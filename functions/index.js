/**
 * Outdoor Companion — Cloud Functions
 *
 * tagPhoto: analyzes one trail-camera photo with Claude vision and returns a
 * structured classification (animal vs empty, species, count, buck, antler
 * notes, confidence). Callable from the signed-in web app.
 *
 * Security model: the caller must be authenticated, and the function only ever
 * reads photos under users/{callerUid}/... — a user can never tag someone
 * else's photos. The Anthropic API key is a Firebase secret (ANTHROPIC_API_KEY),
 * never shipped to the browser or committed to the repo.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// The photo's project storage bucket (public identifier, not a secret).
const STORAGE_BUCKET = "outdoor-companion-ee5b3.firebasestorage.app";

// Cost-effective vision model. Swap to "claude-opus-5" for max accuracy, or
// "claude-haiku-4-5" for the cheapest pass — same code, one string.
const MODEL = "claude-sonnet-5";

// Strict JSON schema — guarantees the model returns exactly these fields.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hasAnimal: { type: "boolean" },
    primarySpecies: {
      type: "string",
      description:
        "Common name of the main animal, e.g. 'whitetail deer', 'wild turkey', 'black bear', 'raccoon', 'coyote', 'wild hog', 'bobcat', 'squirrel', 'bird', 'human', 'vehicle'. Use 'none' when the frame is empty.",
    },
    allSpecies: {
      type: "array",
      items: { type: "string" },
      description: "Every distinct animal species visible; empty array if none.",
    },
    count: { type: "integer", description: "Number of animals visible (0 if empty)." },
    isBuck: {
      type: "boolean",
      description: "True only if a clearly antlered male deer is present.",
    },
    antlerNotes: {
      type: "string",
      description:
        "If a buck is present, a short description of the rack (e.g. '8-point, wide spread, good mass'); otherwise an empty string.",
    },
    notes: {
      type: "string",
      description: "Brief free-text observation (behavior, direction, time-of-day cues, anything notable).",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "hasAnimal",
    "primarySpecies",
    "allSpecies",
    "count",
    "isBuck",
    "antlerNotes",
    "notes",
    "confidence",
  ],
};

const SYSTEM_PROMPT =
  "You are an expert wildlife biologist analyzing a single trail-camera (game camera) photograph. " +
  "These are often taken at night in infrared/black-and-white, sometimes with the animal far from the " +
  "camera, partially in frame, or motion-blurred. Determine whether an animal is present, identify the " +
  "species, count the individuals, and for deer note sex and (for bucks) antler characteristics. " +
  "Be honest about uncertainty via the confidence field, and when genuinely unsure whether something is " +
  "an animal, lean toward flagging a possible animal rather than calling the frame empty — a missed animal " +
  "is worse than a false alarm. Respond with the structured JSON only.";

exports.tagPhoto = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-east1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to tag photos.");
    }
    const photoId = request.data && request.data.photoId;
    if (!photoId || typeof photoId !== "string") {
      throw new HttpsError("invalid-argument", "A photoId is required.");
    }

    // Owner-scoped path — the function can only ever read the caller's own photos.
    const storagePath = "users/" + uid + "/trailcam/" + photoId + ".jpg";
    const file = admin.storage().bucket(STORAGE_BUCKET).file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("not-found", "That photo was not found in your account.");
    }

    let base64;
    try {
      const [buf] = await file.download();
      base64 = buf.toString("base64");
    } catch (e) {
      throw new HttpsError("internal", "Could not read the photo from storage.");
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        // Low effort keeps cost/latency down; the task is a constrained classification.
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: "Analyze this trail-camera photo and return the structured JSON." },
            ],
          },
        ],
      });
    } catch (e) {
      console.error("Anthropic request failed:", e && e.message);
      throw new HttpsError("internal", "The AI request failed. Check the API key / billing and try again.");
    }

    if (response.stop_reason === "refusal") {
      throw new HttpsError("internal", "The model declined to analyze this image.");
    }

    const textBlock = (response.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      throw new HttpsError("internal", "The model returned no result.");
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (e) {
      throw new HttpsError("internal", "The model returned unreadable output.");
    }

    const usage = response.usage || {};
    console.log(
      "tagPhoto ok:",
      photoId,
      parsed.primarySpecies,
      "in=" + (usage.input_tokens || 0),
      "out=" + (usage.output_tokens || 0)
    );

    return Object.assign({}, parsed, { model: MODEL, taggedAt: Date.now() });
  }
);
