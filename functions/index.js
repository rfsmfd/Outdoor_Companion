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

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
// App password for the Outdoor Companion sending mailbox (Google Workspace: rfaison@outdoorcompanionapp.com).
// Set by the owner via `firebase functions:secrets:set GMAIL_APP_PASSWORD` — never in source.
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// The photo's project storage bucket (public identifier, not a secret).
const STORAGE_BUCKET = "outdoor-companion-ee5b3.firebasestorage.app";

// Bulk-tagging COST CASCADE (non-deep path): every frame is first read by the cheap model
// (MODEL_CHEAP). If that read is confident AND it's not a buck, we keep it — that's the easy
// majority (empties, does, turkeys, coons) done for a fraction of a cent. Only frames the cheap
// model is unsure about OR flags as a buck escalate to the mid model (MODEL) for a better read
// (antler points stay on the stronger model). The deep single-photo "Re-tag" still uses Opus/high.
// Tune cost vs accuracy by swapping these strings — one line each.
const MODEL = "claude-sonnet-5";        // mid tier — escalation target (bucks + uncertain frames)
const MODEL_CHEAP = "claude-haiku-4-5"; // first-pass bulk model (cheapest)
const MODEL_DEEP = "claude-opus-5";     // deep single-photo re-tag + buck matching

// Ol' Gus — the in-app help companion. His entire knowledge is the app's own feature guide.
const { GUS_KB } = require("./gusKnowledge");

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
    antler: {
      type: "object",
      additionalProperties: false,
      description:
        "Structured rack detail for identifying an INDIVIDUAL buck across photos. Fill only when a clearly antlered buck is present; otherwise use 0 / 'unknown' / empty.",
      properties: {
        pointsLeft: { type: "integer", description: "Scorable points on the buck's LEFT antler (0 if none/unknown)." },
        pointsRight: { type: "integer", description: "Scorable points on the buck's RIGHT antler (0 if none/unknown)." },
        totalPoints: { type: "integer", description: "Total scorable points (0 if none/unknown)." },
        spreadClass: {
          type: "string",
          enum: ["unknown", "narrow", "average", "wide", "very-wide"],
          description:
            "Inside spread vs the ears (ear tip-to-tip ~16-18 in on a whitetail): narrow=inside the ears, average=about ear width, wide=beyond the ears, very-wide=well beyond.",
        },
        mass: { type: "string", enum: ["unknown", "light", "average", "heavy"], description: "Antler/beam mass (thickness)." },
        frameHeight: {
          type: "string",
          enum: ["unknown", "short", "medium", "tall"],
          description:
            "Overall rack/tine HEIGHT independent of width: short=stubby/low tines, medium=average, tall=long tines / tall G2-G3 / tall typical frame. Combined with spreadClass this distinguishes 'tall & narrow' from 'wide & low' etc. 'unknown' if not a clear buck or can't tell.",
        },
        features: {
          type: "array",
          items: { type: "string" },
          description:
            "Distinctive traits that FINGERPRINT this buck: e.g. 'drop tine right', 'kicker off right base', 'split G2 left', 'sticker points', 'broken left main beam', 'palmated brow', 'strong asymmetry'. Empty array if none notable.",
        },
        signature: {
          type: "string",
          description: "One-line human-readable rack summary, e.g. 'wide 5x4, split left G2, heavy mass'. Empty string if not a buck.",
        },
      },
      required: ["pointsLeft", "pointsRight", "totalPoints", "spreadClass", "mass", "frameHeight", "features", "signature"],
    },
    bodyClass: {
      type: "string",
      enum: ["unknown", "young", "mature", "old"],
      description:
        "Rough age/body class for a DEER from body size and build (young~1.5yr, mature~2.5yr, old~3.5yr+). 'unknown' if not a deer or can't tell. Helps identify a buck across seasons when antlers change or are shed.",
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
    "antler",
    "bodyClass",
    "notes",
    "confidence",
  ],
};

const SYSTEM_PROMPT =
  "You are an expert wildlife biologist analyzing a single trail-camera (game camera) photograph. " +
  "These are often taken at night in infrared/black-and-white, sometimes with the animal far from the " +
  "camera, partially in frame, or motion-blurred. Determine whether an animal is present, identify the " +
  "species, count the individuals, and for deer note sex and (for bucks) antler characteristics. " +
  "When a clearly antlered buck is present, fill the structured 'antler' object precisely — points per " +
  "side and total, spread relative to the ears, mass, and especially any DISTINCTIVE FINGERPRINT features " +
  "(drop tines, kickers, split points, stickers, broken beams, palmation, strong asymmetry) plus a one-line " +
  "signature — because these are what let us recognize the SAME individual buck across different photos. " +
  "For any deer, also give a rough body/age class. Use 0 / 'unknown' / empty for antler fields when a buck " +
  "isn't clearly present or you genuinely can't tell — never guess antler detail you cannot see. " +
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
    // Deep mode (single-photo "Re-tag") looks HARDER with a stronger model + high effort — much
    // better at fine antler tine-counting on a buck. Bulk "Tag all" runs the cost cascade below.
    const deep = !!(request.data && request.data.deep);

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

    // One vision analysis with a given model + effort. Returns {parsed, usage}; throws on
    // API/parse errors (err.refusal set when the model declined) so callers can fall back.
    async function analyze(model, effort) {
      const response = await client.messages.create({
        model: model,
        max_tokens: 1024,
        output_config: { effort: effort, format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
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
      if (response.stop_reason === "refusal") { const e = new Error("refusal"); e.refusal = true; throw e; }
      const tb = (response.content || []).find((b) => b.type === "text");
      if (!tb) throw new Error("no text block returned");
      return { parsed: JSON.parse(tb.text), usage: response.usage || {} };
    }

    let parsed = null, finalModel = null, escalated = false;
    let inTok = 0, outTok = 0;
    try {
      if (deep) {
        // Deep single-photo re-tag: one strong pass, no cascade.
        const r = await analyze(MODEL_DEEP, "high");
        parsed = r.parsed; finalModel = MODEL_DEEP;
        inTok = r.usage.input_tokens || 0; outTok = r.usage.output_tokens || 0;
      } else {
        // Cascade: cheap first…
        let r1 = null;
        try { r1 = await analyze(MODEL_CHEAP, "low"); }
        catch (e1) { if (e1 && e1.refusal) throw e1; /* else Haiku unavailable → fall to mid below */ }
        if (r1) {
          parsed = r1.parsed; finalModel = MODEL_CHEAP;
          inTok = r1.usage.input_tokens || 0; outTok = r1.usage.output_tokens || 0;
          // …escalate to the mid model ONLY when the cheap read is unsure OR it's a buck (where
          // antler detail matters). Does / turkeys / empties with high confidence stay cheap.
          const unsure = parsed.confidence !== "high";
          const isBuck = parsed.isBuck === true;
          if (unsure || isBuck) {
            try {
              const r2 = await analyze(MODEL, "medium");
              parsed = r2.parsed; finalModel = MODEL; escalated = true;
              inTok += r2.usage.input_tokens || 0; outTok += r2.usage.output_tokens || 0;
            } catch (e2) { /* keep the cheap result if the escalation call fails */ }
          }
        } else {
          // Cheap model unavailable — go straight to the mid model so tagging still works.
          const r2 = await analyze(MODEL, "low");
          parsed = r2.parsed; finalModel = MODEL; escalated = true;
          inTok = r2.usage.input_tokens || 0; outTok = r2.usage.output_tokens || 0;
        }
      }
    } catch (e) {
      if (e && e.refusal) throw new HttpsError("internal", "The model declined to analyze this image.");
      console.error("Anthropic request failed:", e && e.message);
      throw new HttpsError("internal", "The AI request failed. Check the API key / billing and try again.");
    }
    if (!parsed) throw new HttpsError("internal", "The model returned no result.");

    console.log(
      "tagPhoto ok:",
      photoId,
      parsed.primarySpecies,
      finalModel,
      escalated ? "(escalated)" : "",
      "in=" + inTok,
      "out=" + outTok
    );

    return Object.assign({}, parsed, { model: finalModel, escalated: escalated, taggedAt: Date.now() });
  }
);

// Phase 2.5 Stage 3 — individual-buck recognition. Given ONE new buck photo and the caller's
// KNOWN bucks (name + recorded antler traits), rank which known buck it matches. Suggest-only:
// the client shows the ranking and the human confirms. Weighs DISTINCTIVE persistent features
// over point count / spread (which grow year to year).
const COMPARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ranked: {
      type: "array",
      description: "Up to 3 best candidate matches, most likely first. Empty array if none are plausible.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string", description: "The exact ref id of the candidate buck being matched." },
          name: { type: "string", description: "The candidate buck's name." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string", description: "One line: the specific antler evidence for (or against) this match." },
        },
        required: ["ref", "name", "confidence", "reason"],
      },
    },
    likelyNew: { type: "boolean", description: "True if the buck is most likely a NEW/unknown buck not in the candidate list." },
    summary: { type: "string", description: "One-line read of the rack on the buck in the photo." },
  },
  required: ["ranked", "likelyNew", "summary"],
};

const COMPARE_SYSTEM =
  "You are an expert whitetail biologist doing INDIVIDUAL-buck identification from trail-camera photos. " +
  "You are given ONE new buck photo and a list of KNOWN bucks with their recorded antler traits. Decide " +
  "which known buck (if any) the buck in the photo is. Weigh DISTINCTIVE, PERSISTENT features most heavily " +
  "— drop tines, kickers, split points, sticker points, broken beams, strong asymmetry, brow/tine " +
  "configuration — because point count and spread GROW year to year and can't confirm identity on their " +
  "own. If the distinctive features don't clearly match any known buck, prefer likelyNew=true rather than " +
  "forcing a weak match. Rank up to 3 plausible candidates with honest confidence and the specific " +
  "evidence. Respond with the structured JSON only.";

exports.compareBucks = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-east1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to identify bucks.");
    }
    const photoId = request.data && request.data.photoId;
    if (!photoId || typeof photoId !== "string") {
      throw new HttpsError("invalid-argument", "A photoId is required.");
    }
    const candidates =
      request.data && Array.isArray(request.data.candidates) ? request.data.candidates : [];
    if (!candidates.length) {
      return { ranked: [], likelyNew: true, summary: "No known bucks to compare against yet.", model: MODEL, comparedAt: Date.now() };
    }

    // Owner-scoped — the function can only ever read the caller's own photo.
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

    const list = candidates
      .map((c) => "[" + (c.ref || "") + "] " + (c.name || "(unnamed)") + " — " + (c.fingerprint || "no antler detail recorded yet"))
      .join("\n");

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let response;
    try {
      response = await client.messages.create({
        // Individual-buck matching is the MOST demanding vision task (and low-volume, so cost is a
        // non-issue) — always use the strongest model at high effort so it reads antlers/velvet the
        // SAME way tagging does. A weak matcher misreads velvet vs. hard-antlered and breaks matches.
        model: "claude-opus-5",
        max_tokens: 1024,
        output_config: { effort: "high", format: { type: "json_schema", schema: COMPARE_SCHEMA } },
        system: COMPARE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              {
                type: "text",
                text:
                  "Known bucks:\n" + list +
                  "\n\nWhich of these known bucks is the buck in this photo? Rank the best matches by the distinctive antler evidence; if none fit, say it's likely a new buck.",
              },
            ],
          },
        ],
      });
    } catch (e) {
      console.error("compareBucks request failed:", e && e.message);
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
    console.log("compareBucks ok:", photoId, "candidates=" + candidates.length, "likelyNew=" + parsed.likelyNew);
    return Object.assign({}, parsed, { model: "claude-opus-5", comparedAt: Date.now() });
  }
);

/**
 * Ol' Gus — "your hunting companion, powered by Claude."
 *
 * V1 = an in-app HELP DESK. A user asks "how do I… / where is… / what does X do?" and Gus
 * answers in plain steps, grounded ONLY in the app's own feature guide (gusKnowledge.js) so he
 * can't invent buttons or features. Not (yet) a my-ground hunting advisor — strategy questions
 * get pointed at the feature that helps (Where to Hunt, Terrain Read, etc.).
 *
 * Cheap by design: Haiku, short answers, and the big knowledge block is prompt-CACHED so repeat
 * questions only pay for the short question + answer. Reuses the existing ANTHROPIC_API_KEY
 * secret — no new infra.
 */
const GUS_SYSTEM =
  "You are Ol' Gus — a warm, weathered old hunter and fisherman who sits by the campfire and helps " +
  "folks find their way around the Outdoor Companion app. You've spent a lifetime in the woods and " +
  "on the water, and you talk like a kind old-timer: easygoing, encouraging, a touch folksy (a " +
  "'Well now…', a 'here's the trick of it…'), never stiff or robotic. You're the fella who puts a " +
  "hand on your shoulder and says 'don't you worry, it's easy — watch here.' RULES: (1) Answer from " +
  "the KNOWLEDGE below — the app's own feature guide plus the short 'about' note. For a how-to, give " +
  "plain, simple, numbered steps a first-timer can follow. If something truly isn't in what you " +
  "know, say so kindly ('That one I can't rightly say…') and point them to the closest thing — NEVER " +
  "invent a feature, button, step, or fact you don't have. (1b) CRITICAL — assume the person is " +
  "brand-new and does NOT know their way around yet. For ANY how-to, tell them WHERE the control is: " +
  "which panel or tab and the EXACT button label, using the 'WHERE THINGS ARE' layout in the " +
  "knowledge. Never just say 'go to Cameras' — say 'tap the CAMERAS tab in the left panel.' Never " +
  "just say 'turn on the layer' — say which button and where (e.g. 'the 📐 button in the toolbar at " +
  "the top of the map'). On a phone, remind them the ☰ menu (top-left) opens the left panel. Walk " +
  "them there like you're pointing across the truck seat. (2) Warm but not long-winded — a couple " +
  "of friendly sentences, or a short numbered list. Get them the answer. (3) You help folks USE the " +
  "app; you're not a hunting-strategy advisor yet — if they ask for a read on their own ground, tell " +
  "them warmly that kind of advice is coming down the road, and point them to the feature that helps " +
  "today (Where to Hunt, Terrain Read, Huntability, When to Fish). (4) It's fine to chat a little " +
  "about what the app is and who made it, from the 'about' note — that's part of being a good " +
  "companion. (5) After each answer, suggest up to THREE short, natural follow-up questions on the " +
  "SAME topic that the person is likely to want next — phrase each in first person the way they'd " +
  "tap it ('How do I create QR tag sheets?', 'How do I import photos from my camera?'), and only " +
  "ones you can actually answer from the knowledge. Put them in the 'followups' list; use an empty " +
  "list if nothing natural fits. (6) When your answer tells the person to TAP specific on-screen " +
  "controls, ALSO fill 'highlights' with those controls' tokens IN TAP ORDER, using ONLY the " +
  "POINTABLE TARGETS tokens in the knowledge — the app then lights each one up on screen as you " +
  "talk them through it. Match the token to the control you named (e.g. Cameras tab = tab-cameras, " +
  "Deploy Camera = deploy-camera, the + Add Site button = add-site). Leave it empty for answers " +
  "that aren't a tap-here walkthrough. (7) You're also how folks send FEEDBACK. When someone reports " +
  "a bug, wishes for a feature, seems stuck or frustrated, or when you've just finished helping — " +
  "warmly point them to the 💡 Suggestion / Issue button (top-right of the app, or in the demo " +
  "banner) so it goes straight to the maker; set 'send-feedback' in highlights when you do. Don't " +
  "nag — just mention it when it genuinely fits. \n\n=== OUTDOOR COMPANION KNOWLEDGE ===\n" + GUS_KB;

// The on-screen controls Gus can point at (the client lights each one up in order). Keep in sync
// with GUS_TARGETS in index.html and the POINTABLE TARGETS list in gusKnowledge.js.
const GUS_TARGET_TOKENS = [
  "add-site", "my-location", "plan-hunt", "where-to-hunt", "field-card", "hunt-mode", "walk-in",
  "log-sit", "scout-mode", "camera-plan", "terrain-read", "tab-sites", "tab-log", "tab-cameras",
  "tab-analytics", "register-camera", "deploy-camera", "batch-qr", "import-photos", "quick-log",
  "property-lines", "layers", "wind", "compass", "map-display", "send-feedback", "show-cameras", "show-camera-icons",
  "show-stands", "show-access", "show-bedding", "show-feeding", "show-water", "show-bucks", "show-does",
  "show-bears", "show-turkeys", "show-scrapes", "show-rubs", "show-tracks", "show-deer-trails",
  "show-hunts", "show-camera-history", "show-scout-board", "show-camera-coverage",
  "mode-hunting", "mode-fishing",
  "photo-gallery", "solunar", "journal", "trails", "import", "export",
];

// Structured output: warm answer + follow-up questions + the controls to point at on screen.
const GUS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: {
      type: "string",
      description: "The warm, plain-spoken answer, naming the exact panel/tab/button where the control lives.",
    },
    followups: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to 3 SHORT natural next questions on the same topic, phrased in first person as the user would tap them (e.g. 'How do I deploy a camera?'). Each must be answerable from the knowledge. Empty array if none fit.",
    },
    highlights: {
      type: "array",
      items: { type: "string", enum: GUS_TARGET_TOKENS },
      description:
        "If the answer tells the user to tap specific on-screen controls, list their tokens here IN THE ORDER the user should tap them — the app lights each one up as Gus talks. Use ONLY these tokens, matching the controls named in the answer. Empty array when the answer isn't a tap-here walkthrough.",
    },
  },
  required: ["answer", "followups", "highlights"],
};

exports.askGus = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-east1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You have to be signed in to ask Ol' Gus.");
    }
    const raw = request.data && request.data.question;
    if (!raw || typeof raw !== "string" || !raw.trim()) {
      throw new HttpsError("invalid-argument", "Ask Ol' Gus a question first.");
    }
    const question = raw.trim().slice(0, 1500);

    // Optional short back-and-forth for follow-ups: [{role:'user'|'assistant', text}]. Cap it.
    const hist = request.data && Array.isArray(request.data.history) ? request.data.history : [];
    const messages = [];
    for (let i = Math.max(0, hist.length - 6); i < hist.length; i++) {
      const h = hist[i];
      if (h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string" && h.text.trim()) {
        messages.push({ role: h.role, content: h.text.slice(0, 2000) });
      }
    }
    messages.push({ role: "user", content: question });

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    // Array-form system so the big knowledge block is prompt-CACHED (repeat questions cost pennies).
    const req = {
      model: MODEL_CHEAP, // help desk — cheapest model
      max_tokens: 800,
      output_config: { format: { type: "json_schema", schema: GUS_SCHEMA } }, // NOTE: Haiku rejects `effort`
      system: [{ type: "text", text: GUS_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: messages,
    };
    // RETRY a few times — a transient API blip or a cold-start shouldn't ever show the user "Sorry."
    let response = null, lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { response = await client.messages.create(req); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise(function (r) { setTimeout(r, 500 + attempt * 800); });
      }
    }
    if (lastErr || !response) {
      console.error("askGus request failed after retries:", lastErr && lastErr.message);
      throw new HttpsError("internal", "Ol' Gus couldn't get to the answer right now. Try again in a minute.");
    }

    const tb = (response.content || []).find((b) => b.type === "text");
    let answer = "Hmm, I didn't quite catch that — ask me another way?";
    let followups = [];
    let highlights = [];
    try {
      const parsed = JSON.parse(tb.text);
      if (parsed && typeof parsed.answer === "string" && parsed.answer.trim()) answer = parsed.answer;
      if (parsed && Array.isArray(parsed.followups)) {
        followups = parsed.followups.filter(function (s) { return typeof s === "string" && s.trim(); }).slice(0, 3);
      }
      if (parsed && Array.isArray(parsed.highlights)) {
        highlights = parsed.highlights.filter(function (s) { return GUS_TARGET_TOKENS.indexOf(s) >= 0; }).slice(0, 8);
      }
    } catch (e) { /* schema should guarantee JSON; keep the fallback answer if not */ }
    const u = response.usage || {};
    console.log("askGus ok:", "in=" + (u.input_tokens || 0), "out=" + (u.output_tokens || 0), "cacheRead=" + (u.cache_read_input_tokens || 0));
    return { answer: answer, followups: followups, highlights: highlights, model: MODEL_CHEAP, answeredAt: Date.now() };
  }
);

/**
 * submitFeedback — collect tester suggestions & issue reports into one Firestore log the founder can
 * watch. An HTTP endpoint (not callable) so it works for DEMO visitors who have NO account, as well as
 * signed-in testers. cors:true handles the browser preflight. Writes go through the admin SDK so no
 * security rule is needed; the collection is never read by the client.
 */
exports.submitFeedback = onRequest(
  { region: "us-east1", cors: true, secrets: [GMAIL_APP_PASSWORD], memory: "256MiB", timeoutSeconds: 20 },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }   // cors:true also handles this
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }
    try {
      const b = req.body || {};
      const text = String(b.text || "").trim().slice(0, 4000);
      if (!text) { res.status(400).json({ ok: false, error: "empty" }); return; }
      const doc = {
        text: text,
        kind: String(b.kind || "suggestion").slice(0, 40),      // "suggestion" | "issue"
        context: String(b.context || "").slice(0, 200),          // where they were (e.g. "demo", "Where to Hunt")
        email: String(b.email || "").slice(0, 200),
        uid: String(b.uid || "").slice(0, 128),
        build: String(b.build || "").slice(0, 20),
        demo: !!b.demo,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        createdAt: Date.now(),
      };
      const coll = doc.kind === "waitlist" ? "waitlist" : "feedback";   // waitlist sign-ups get their own list
      await admin.firestore().collection(coll).add(doc);
      console.log(coll + ":", doc.kind, "build=" + doc.build, "from=" + (doc.email || doc.uid || (doc.demo ? "demo" : "anon")), "|", text.slice(0, 80));
      // Ping the owner's inbox so nothing gets missed without opening the console. Never block the
      // submission on it — a mail hiccup must not lose the feedback (it's already saved above).
      try {
        const from = doc.email || (doc.demo ? "a demo visitor" : "a tester");
        const subj = doc.kind === "waitlist" ? "✉ New waitlist signup — Outdoor Companion"
          : doc.kind === "issue" ? "🐞 New issue reported — Outdoor Companion"
          : "💡 New suggestion — Outdoor Companion";
        const lines = [
          "Kind: " + doc.kind,
          "From: " + from,
          doc.context ? "Where: " + doc.context : "",
          doc.build ? "Build: " + doc.build : "",
          "",
          doc.text,
          "",
          "— view all in the app's 🛠 Admin console.",
        ].filter(function (x) { return x !== ""; });
        const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#20281a;max-width:560px;\">" +
          "<p style=\"margin:0 0 6px;\"><strong>" + doc.kind + "</strong> from " + from + (doc.context ? " · " + doc.context : "") + (doc.build ? " · B" + doc.build : "") + "</p>" +
          "<blockquote style=\"margin:8px 0;padding:10px 14px;border-left:3px solid #79883f;background:#f3f4ec;\">" +
          doc.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>") +
          "</blockquote><p style=\"font-size:12px;color:#888;\">View all in the app's Admin console.</p></div>";
        await sendMail(FOUNDER_EMAIL, subj, lines.join("\n"), html);
      } catch (mailErr) { console.error("feedback notify email failed:", mailErr && mailErr.message); }
      // Waitlist joiners get a friendly confirmation: we're in testing now, we'll email them at launch.
      if (doc.kind === "waitlist" && doc.email && doc.email.indexOf("@") > 0) {
        try {
          const wtext = "Thanks for your interest in Outdoor Companion!\n\n" +
            "We're in private testing right now with a small group of hunters and anglers, so access is invite-only for the moment. " +
            "You're on the list — the day we open it up, we'll email you right here with your way in.\n\n" +
            "Sit tight, and thanks for wanting to be part of it.\n\n— Outdoor Companion";
          const whtml = "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#20281a;max-width:560px;line-height:1.5;\">" +
            "<h2 style=\"color:#3a4d2a;\">You're on the list ✅</h2>" +
            "<p>Thanks for your interest in <strong>Outdoor Companion</strong>!</p>" +
            "<p>We're in <strong>private testing</strong> right now with a small group of hunters and anglers, so access is invite-only for the moment. You're on the waitlist — the day we open it up, we'll email you right here with your way in.</p>" +
            "<p>Sit tight, and thanks for wanting to be part of it.</p>" +
            "<p>— <strong>Outdoor Companion</strong></p></div>";
          await sendMail(doc.email, "You're on the Outdoor Companion waitlist ✅", wtext, whtml);
        } catch (wErr) { console.error("waitlist confirm email failed:", wErr && wErr.message); }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("submitFeedback failed:", e && e.message);
      res.status(500).json({ ok: false, error: "server" });
    }
  }
);

/**
 * Invite gate for account sign-up during the invited test phase.
 * Validated SERVER-SIDE so the valid codes never live in the client bundle.
 *   - HARDCODED_INVITE_CODES: quick shared code(s) the founder can hand out immediately.
 *     Edit this array + redeploy to rotate. (Case-insensitive; stored/compared upper-case.)
 *   - Firestore `inviteCodes`: for more/managed codes — add a doc { code:"XXXX", active:true }
 *     in the console to grant another code without a redeploy.
 * NOTE: this is a SOFT gate for the friendly test phase (deters casual/stranger sign-ups
 * from the public demo URL). It is not hard enforcement — that comes later via security
 * rules requiring an approved flag. Kept deliberately simple for now.
 */
const HARDCODED_INVITE_CODES = ["CEDARCREEK26"];   // ← founder: change/add codes here, then redeploy

exports.checkInvite = onRequest(
  { region: "us-east1", cors: true, memory: "256MiB", timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }
    try {
      const code = String((req.body && req.body.code) || "").trim().toUpperCase();
      if (!code) { res.json({ ok: false }); return; }
      if (HARDCODED_INVITE_CODES.map((c) => c.toUpperCase()).indexOf(code) >= 0) { res.json({ ok: true }); return; }
      const snap = await admin.firestore().collection("inviteCodes")
        .where("code", "==", code).where("active", "==", true).limit(1).get();
      res.json({ ok: !snap.empty });
    } catch (e) {
      console.error("checkInvite failed:", e && e.message);
      res.status(500).json({ ok: false, error: "server" });
    }
  }
);

/**
 * Anonymous usage telemetry — "generic data, nothing personal."
 * Captures how the app is USED (which features, which module, demo vs real, what build)
 * so the founder can see engagement in aggregate. Deliberately privacy-preserving:
 *   - Identity is a random per-install id the CLIENT generates (oc_anon_id) — NOT the
 *     user's email/uid/name. It ties a session's events together, nothing more.
 *   - NO map coordinates, NO record contents, NO names, NO free text, NO email.
 *   - `props` is sanitized to short primitives only (numbers/booleans/short enums), so even
 *     a misbehaving client can't smuggle personal data or large blobs into the log.
 * Writes to the `telemetry` collection. Fire-and-forget from the client.
 */
function sanitizeProps(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  let n = 0;
  for (const k of Object.keys(raw)) {
    if (n++ >= 12) break;                                   // cap number of keys
    const key = String(k).slice(0, 40);
    const v = raw[k];
    if (typeof v === "number" && isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
    else if (typeof v === "string") out[key] = v.slice(0, 60);   // short enums/labels only
    // objects/arrays/anything else are dropped on purpose
  }
  return out;
}

exports.logEvent = onRequest(
  { region: "us-east1", cors: true, memory: "128MiB", timeoutSeconds: 10 },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
    try {
      const b = req.body || {};
      const event = String(b.event || "").trim().slice(0, 60);
      if (!event) { res.json({ ok: false }); return; }
      const ua = String(req.headers["user-agent"] || "");
      const doc = {
        event: event,                                        // e.g. "app_open", "tab_open", "demo_start"
        anonId: String(b.anonId || "").slice(0, 40),         // random per-install id (not personal)
        build: String(b.build || "").slice(0, 20),
        module: (b.module === "fishing" || b.module === "hunting") ? b.module : "",
        demo: !!b.demo,
        signedIn: !!b.signedIn,                              // boolean only — never who
        platform: /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop",
        props: sanitizeProps(b.props),
        createdAt: Date.now(),
      };
      await admin.firestore().collection("telemetry").add(doc);
      res.json({ ok: true });
    } catch (e) {
      console.error("logEvent failed:", e && e.message);
      res.status(500).json({ ok: false });
    }
  }
);

/**
 * Admin console data — founder-only. Reads server-side (admin SDK) so the raw
 * feedback/waitlist/telemetry collections never need to be client-readable, and
 * returns three things:
 *   - telemetry: AGGREGATES only (counts, unique installs) — stays anonymous, no names.
 *   - feedback + waitlist: the actual entries (these already carry any email the sender chose).
 *   - testers: the account roster from Firebase Auth (email, signed-up, LAST sign-in) cross-
 *     referenced with feedback counts — this is what answers "who's engaging and who's gone quiet."
 * Gated to the founder's email. Everyone else gets permission-denied.
 */
const FOUNDER_EMAIL = "rfsmfd@gmail.com";

exports.adminData = onCall({ region: "us-east1", memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
  const email = String((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
  if (!request.auth || email !== FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "This area is for the app owner.");
  }
  const db = admin.firestore();
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;

  // --- feedback + waitlist + agreements + allowlist + activity + aggregate (newest first) ---
  const [fbSnap, wlSnap, agSnap, alSnap, uaSnap, agrSnap] = await Promise.all([
    db.collection("feedback").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] })),
    db.collection("waitlist").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] })),
    db.collection("agreements").limit(2000).get().catch(() => ({ docs: [] })),
    db.collection("allowlist").limit(2000).get().catch(() => ({ docs: [] })),
    db.collection("userActivity").limit(2000).get().catch(() => ({ docs: [] })),
    db.collection("aggregate").limit(8000).get().catch(() => ({ docs: [] })),
  ]);
  const feedback = fbSnap.docs.map((d) => d.data());
  const waitlist = wlSnap.docs.map((d) => d.data());
  const agreements = {};   // uid -> { acceptedAt, version }
  agSnap.docs.forEach((d) => { agreements[d.id] = d.data(); });
  const access = alSnap.docs.map((d) => d.data());
  const activity = {};     // uid -> { lastSeenAt, opens } (real app-open time + visit count)
  uaSnap.docs.forEach((d) => { const v = d.data(); activity[d.id] = { lastSeenAt: v.lastSeenAt || 0, opens: v.opens || 0 }; });

  // --- telemetry aggregates (last 30 days), anonymous ---
  const telSnap = await db.collection("telemetry")
    .where("createdAt", ">=", now - 30 * DAY).limit(8000).get().catch(() => ({ docs: [] }));
  const tel = telSnap.docs.map((d) => d.data());
  const byEvent = {}, byTab = {}, platform = { mobile: 0, desktop: 0 };
  const installs = {}, installs7 = {};
  let demoStarts = 0, appOpens = 0;
  tel.forEach((t) => {
    byEvent[t.event] = (byEvent[t.event] || 0) + 1;
    if (t.event === "demo_start") demoStarts++;
    if (t.event === "app_open") appOpens++;
    if (t.event === "tab_open" && t.props && t.props.tab) byTab[t.props.tab] = (byTab[t.props.tab] || 0) + 1;
    if (t.platform === "mobile" || t.platform === "desktop") platform[t.platform]++;
    if (t.anonId) {
      installs[t.anonId] = true;
      if (t.createdAt >= now - 7 * DAY) installs7[t.anonId] = true;
    }
  });
  const telemetry = {
    windowDays: 30, totalEvents: tel.length,
    uniqueInstalls: Object.keys(installs).length,
    activeInstalls7d: Object.keys(installs7).length,
    appOpens: appOpens, demoStarts: demoStarts,
    byEvent: byEvent, byTab: byTab, platform: platform,
  };

  // --- tester roster from Firebase Auth (identity is fair game for invited accounts) ---
  const fbByEmail = {}, fbByUid = {};
  feedback.forEach((f) => {
    if (f.email) fbByEmail[String(f.email).toLowerCase()] = (fbByEmail[String(f.email).toLowerCase()] || 0) + 1;
    if (f.uid) fbByUid[f.uid] = (fbByUid[f.uid] || 0) + 1;
  });
  const testers = [];
  let pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    res.users.forEach((u) => {
      const em = (u.email || "").toLowerCase();
      const lastSignIn = u.metadata && u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : 0;
      const act = activity[u.uid] || { lastSeenAt: 0, opens: 0 };
      // Real "last active" = the later of a fresh sign-in and the app-open heartbeat.
      const lastActive = Math.max(lastSignIn, act.lastSeenAt || 0);
      const fbCount = (fbByEmail[em] || 0) + (fbByUid[u.uid] || 0);
      const ag = agreements[u.uid];
      testers.push({
        email: u.email || "(no email)",
        uid: u.uid,
        createdAt: u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : 0,
        lastSignIn: lastSignIn,
        lastActive: lastActive,
        opens: act.opens || 0,
        daysQuiet: lastActive ? Math.floor((now - lastActive) / DAY) : null,
        feedbackCount: fbCount,
        agreedAt: ag ? (ag.acceptedAt || 0) : 0,
        agreedVersion: ag ? (ag.version || 0) : 0,
      });
    });
    pageToken = res.pageToken;
  } while (pageToken);
  testers.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

  // Mark which approved emails have actually created an account yet.
  const testerEmails = {};
  testers.forEach((t) => { if (t.email) testerEmails[t.email.toLowerCase()] = true; });
  access.forEach((a) => { a.signedUp = !!testerEmails[normEmail(a.email)]; });
  access.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  // Waitlist: dedupe by email + derive status (waiting → invited → joined).
  const allowActive = {};
  access.forEach((a) => { if (a.active !== false) allowActive[normEmail(a.email)] = true; });
  const wlMap = {};
  waitlist.forEach((w) => {
    const e = normEmail(w.email); if (!e) return;
    if (!wlMap[e]) wlMap[e] = { email: w.email, createdAt: w.createdAt || 0, notifiedAt: w.notifiedAt || 0 };
    else { wlMap[e].notifiedAt = Math.max(wlMap[e].notifiedAt, w.notifiedAt || 0); if ((w.createdAt || 0) < wlMap[e].createdAt) wlMap[e].createdAt = w.createdAt; }
  });
  const waitlistOut = Object.keys(wlMap).map((e) => {
    const w = wlMap[e]; w.invited = !!allowActive[e]; w.joined = !!testerEmails[e]; return w;
  });
  waitlistOut.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // --- aggregate movement dataset: summary only (the raw records carry no identity) ---
  const agg = agrSnap.docs.map((d) => d.data());
  const aggByModule = {}, aggByType = {}, aggByHour = {}, aggByPressure = {}, aggByMoon = {};
  const regionSet = {};
  function hourBucket(h) {
    if (h == null) return "Unknown";
    if (h >= 5 && h < 8) return "Dawn"; if (h >= 8 && h < 11) return "Morning";
    if (h >= 11 && h < 15) return "Midday"; if (h >= 15 && h < 18) return "Evening";
    if (h >= 18 && h < 21) return "Dusk"; return "Night";
  }
  function moonBucket(m) {
    if (m == null) return "Unknown";
    if (m < 0.1 || m > 0.9) return "New"; if (m >= 0.4 && m <= 0.6) return "Full";
    return m < 0.5 ? "Waxing" : "Waning";
  }
  agg.forEach((r) => {
    if (r.module) aggByModule[r.module] = (aggByModule[r.module] || 0) + 1;
    if (r.type) aggByType[r.type] = (aggByType[r.type] || 0) + 1;
    aggByHour[hourBucket(r.hour)] = (aggByHour[hourBucket(r.hour)] || 0) + 1;
    aggByMoon[moonBucket(r.moon)] = (aggByMoon[moonBucket(r.moon)] || 0) + 1;
    const pt = (r.weather && r.weather.pressureTrend) || "Unknown";
    aggByPressure[pt] = (aggByPressure[pt] || 0) + 1;
    if (r.regionLat != null && r.regionLng != null) regionSet[r.regionLat + "," + r.regionLng] = true;
  });
  const insights = {
    total: agg.length,
    byModule: aggByModule, byType: aggByType, byHour: aggByHour,
    byPressure: aggByPressure, byMoon: aggByMoon,
    regions: Object.keys(regionSet).length,
  };

  return { generatedAt: now, feedback: feedback, waitlist: waitlistOut, telemetry: telemetry, testers: testers, access: access, insights: insights };
});

/**
 * Email everyone on the waitlist at once (the launch/announcement blast). Owner-gated. BCC, and
 * stamps notifiedAt on each waitlist doc so the console can show who's been emailed.
 */
exports.broadcastWaitlist = onCall(
  { region: "us-east1", secrets: [GMAIL_APP_PASSWORD], memory: "512MiB", timeoutSeconds: 180 },
  async (request) => {
    ownerOnly(request);
    const subject = String((request.data && request.data.subject) || "").trim().slice(0, 200);
    const message = String((request.data && request.data.message) || "").trim().slice(0, 8000);
    if (!subject || !message) throw new HttpsError("invalid-argument", "A subject and a message are required.");
    const db = admin.firestore();
    const snap = await db.collection("waitlist").limit(5000).get();
    const emailSet = {};
    snap.docs.forEach((d) => { const e = normEmail(d.data().email); if (e) emailSet[e] = true; });
    const emails = Object.keys(emailSet);
    if (!emails.length) return { ok: true, sent: 0 };
    const safe = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#20281a;max-width:560px;line-height:1.5;\">" +
      safe + "<hr style=\"border:none;border-top:1px solid #ccc;margin:18px 0;\"/>" +
      "<p style=\"font-size:12px;color:#888;\">You're getting this because you joined the Outdoor Companion waitlist.</p></div>";
    await sendMail(MAIL_FROM, subject, message, html, emails);
    // Stamp notifiedAt (chunked so we never exceed Firestore's 500-op batch limit).
    const nowTs = Date.now();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.set(d.ref, { notifiedAt: nowTs }, { merge: true }));
      await batch.commit();
    }
    return { ok: true, sent: emails.length };
  }
);

/**
 * Records a tester's acceptance of the use agreement (shown on first sign-in).
 * Authenticated: writes agreements/{uid} keyed by the signed-in user, so it's a
 * tamper-resistant record of who agreed, when, and to which version — surfaced in
 * the owner console. One doc per user (re-accepting a new version overwrites).
 */
exports.recordAgreement = onCall({ region: "us-east1" }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
  const version = Number((request.data && request.data.version) || 1) || 1;
  const email = (request.auth.token && request.auth.token.email) || "";
  await admin.firestore().collection("agreements").doc(uid).set({
    uid: uid, email: email, version: version, acceptedAt: Date.now(),
  }, { merge: true });
  return { ok: true };
});

/**
 * Heartbeat — stamps a signed-in user's LAST-ACTIVE time (userActivity/{uid}). Firebase Auth's
 * lastSignInTime only moves on a fresh password sign-in, but the app keeps sessions alive, so it
 * badly understates real use. The console roster uses max(lastSignIn, lastSeenAt) instead.
 * Called on app open while signed in. Cheap; identity here is fair (it's the tester's own account).
 */
exports.heartbeat = onCall({ region: "us-east1" }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) return { ok: false };
  const email = (request.auth.token && request.auth.token.email) || "";
  // The client sends this once per app-open, so `opens` counts visits (not token refreshes).
  await admin.firestore().collection("userActivity").doc(uid).set({
    uid: uid, email: email, lastSeenAt: Date.now(),
    opens: admin.firestore.FieldValue.increment(1),
  }, { merge: true });
  return { ok: true };
});

/**
 * AGGREGATE MOVEMENT DATA — the anonymized crowd dataset (deer & fish movement vs conditions).
 * Each sighting/catch contributes ONE record: species/activity type, coarse region, time-of-day,
 * season, moon, solunar, and weather — and NOTHING that identifies the person or the exact spot.
 *   - Identity: NONE stored. The doc id is sha256(uid + ":" + obsKey) purely for idempotency (so
 *     re-sending the same observation overwrites instead of duplicating); it's one-way and the record
 *     itself holds no uid/email/obsId.
 *   - Location: COARSE only. The client already rounds to a ~15-mi grid before sending; we round again
 *     defensively and store just the cell — never the real coordinates, property, or site.
 *   - Also dropped: names, notes, photos, exact day, buck names, siteId/propertyId.
 * Only whitelisted primitive fields are ever written, so a misbehaving client can't smuggle anything in.
 */
const AGG_GRID = 0.25;   // ~15-17 mile cells — coarse region, never a specific spot
function aggCell(n) { return (typeof n === "number" && isFinite(n)) ? Math.round(n / AGG_GRID) * AGG_GRID : null; }
function aggNum(n) { return (typeof n === "number" && isFinite(n)) ? n : null; }
function aggStr(s, max) { return s ? String(s).slice(0, max || 20) : null; }

exports.contributeAggregate = onCall({ region: "us-east1", memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const items = (request.data && request.data.items) || [];
  if (!Array.isArray(items) || !items.length) return { ok: true, wrote: 0 };
  const db = admin.firestore();
  let wrote = 0;
  for (let i = 0; i < items.length && i < 3000; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach((it) => {
      const key = String((it && it.k) || "");
      if (!key) return;
      const w = (it && it.weather) || {};
      const rec = {
        module: (it.module === "fishing" || it.module === "hunting") ? it.module : "",
        type: aggStr(it.type, 40),
        regionLat: aggCell(it.region && it.region.lat),
        regionLng: aggCell(it.region && it.region.lng),
        hour: (typeof it.hour === "number") ? Math.max(0, Math.min(23, Math.floor(it.hour))) : null,
        month: (typeof it.month === "number") ? Math.max(1, Math.min(12, Math.floor(it.month))) : null,
        year: (typeof it.year === "number") ? Math.floor(it.year) : null,
        moon: aggNum(it.moon),
        solunar: aggStr(it.solunar, 20),
        weather: {
          tempF: aggNum(w.tempF), windDir: aggStr(w.windDir, 6), windMph: aggNum(w.windMph),
          pressureInHg: aggNum(w.pressureInHg), pressureTrend: aggStr(w.pressureTrend, 10),
          cloudCoverPct: aggNum(w.cloudCoverPct), humidity: aggNum(w.humidity),
        },
        depthFt: aggNum(it.depthFt),
        heading: aggStr(it.headingDir, 6),
        contributedAt: Date.now(),
      };
      const docId = crypto.createHash("sha256").update(uid + ":" + key).digest("hex");
      batch.set(db.collection("aggregate").doc(docId), rec);   // idempotent — no duplicates
      wrote++;
    });
    await batch.commit();
  }
  return { ok: true, wrote: wrote };
});

/**
 * ACCESS ALLOWLIST (Option #4) — only emails the owner has approved may create an account.
 * The owner adds/removes emails from the console; sign-up checks the list. Docs live in
 * `allowlist/{email}` (email lower-cased as the id) = { email, active, note, addedAt }.
 * The owner's own email is always allowed so he can never lock himself out.
 * NOTE: `checkAccess` is a friendly UX pre-check (nice "you're not on the list" message).
 * TRUE enforcement (rejecting an unapproved account at creation time) wants an Auth
 * blocking function — a follow-up that needs Identity Platform enabled in the console.
 */
function normEmail(e) { return String(e || "").trim().toLowerCase(); }
async function isEmailAllowed(email) {
  email = normEmail(email);
  if (!email) return false;
  if (email === FOUNDER_EMAIL) return true;
  const snap = await admin.firestore().collection("allowlist").doc(email).get();
  return snap.exists && snap.data().active !== false;
}
function ownerOnly(request) {
  const email = normEmail(request.auth && request.auth.token && request.auth.token.email);
  if (!request.auth || email !== FOUNDER_EMAIL) throw new HttpsError("permission-denied", "This area is for the app owner.");
}

exports.checkAccess = onRequest(
  { region: "us-east1", cors: true, memory: "256MiB", timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
    try {
      const ok = await isEmailAllowed((req.body && req.body.email) || "");
      res.json({ ok: ok });
    } catch (e) {
      console.error("checkAccess failed:", e && e.message);
      res.status(500).json({ ok: false, error: "server" });
    }
  }
);

exports.grantAccess = onCall({ region: "us-east1", secrets: [GMAIL_APP_PASSWORD] }, async (request) => {
  ownerOnly(request);
  const email = normEmail(request.data && request.data.email);
  if (!email || email.indexOf("@") < 0) throw new HttpsError("invalid-argument", "Enter a valid email.");
  const note = String((request.data && request.data.note) || "").slice(0, 200);
  const db = admin.firestore();
  // Only send the welcome email on a FIRST grant (not when re-granting an already-active email).
  const prior = await db.collection("allowlist").doc(email).get();
  const wasActive = prior.exists && prior.data().active !== false;
  await db.collection("allowlist").doc(email).set({
    email: email, active: true, note: note, addedAt: Date.now(),
  }, { merge: true });
  let emailed = false;
  if (!wasActive) {
    try {
      await sendMail(email, "You're in — Outdoor Companion early access", welcomeEmailText(), welcomeEmailHtml());
      emailed = true;
    } catch (e) { console.error("welcome email failed for", email, "-", e && e.message); }
  }
  return { ok: true, email: email, emailed: emailed };
});

exports.revokeAccess = onCall({ region: "us-east1" }, async (request) => {
  ownerOnly(request);
  const email = normEmail(request.data && request.data.email);
  if (!email) throw new HttpsError("invalid-argument", "No email given.");
  await admin.firestore().collection("allowlist").doc(email).set({
    active: false, revokedAt: Date.now(),
  }, { merge: true });
  return { ok: true, email: email };
});

/**
 * EMAIL — sends from the Outdoor Companion Workspace mailbox via Gmail SMTP + an app password
 * (secret GMAIL_APP_PASSWORD). Base plumbing for welcome / access-granted / update-broadcast mail.
 */
const MAIL_FROM = "Outdoor Companion <rfaison@outdoorcompanionapp.com>";
const MAIL_USER = "rfaison@outdoorcompanionapp.com";
function makeMailer() {
  // Strip any whitespace — Gmail shows app passwords as "abcd efgh ijkl mnop" and it's easy to
  // paste the spaces in; SMTP wants the bare 16 characters.
  const pass = String(GMAIL_APP_PASSWORD.value() || "").replace(/\s+/g, "");
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: MAIL_USER, pass: pass },
  });
}
async function sendMail(to, subject, text, html, bcc) {
  const msg = { from: MAIL_FROM, to: to, subject: subject, text: text, html: html || undefined };
  if (bcc && bcc.length) msg.bcc = bcc;
  return makeMailer().sendMail(msg);
}

// The in-app Tester Use Agreement, mirrored here so the welcome email can include a copy.
const AGREEMENT_LINES = [
  "Outdoor Companion and all of its code, design, and data are the private property of Faison Digital Works, LLC. This is not open-source.",
  "You agree not to copy, reverse-engineer, decompile, extract, redistribute, resell, or attempt to hack, break into, or tamper with the app, its code, or its data.",
  "You'll keep your login private and use the app only for your own hunting/fishing.",
  "Anonymous, pooled data about conditions and activity (never your identity, exact locations, or personal records) may be used to improve the app for everyone.",
  "This is a test version, provided as-is, with no warranty — things may change or break.",
  "Access is granted for testing and can be ended at any time.",
];
const APP_URL = "https://rfsmfd.github.io/Outdoor_Companion/";

function welcomeEmailHtml() {
  const items = AGREEMENT_LINES.map((l) => "<li style=\"margin:6px 0;\">" + l + "</li>").join("");
  return "" +
    "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#20281a;max-width:560px;line-height:1.5;\">" +
      "<h2 style=\"color:#3a4d2a;margin-bottom:6px;\">Welcome to Outdoor Companion 🦌🎣</h2>" +
      "<p>You're in — I've approved your email for early access. Outdoor Companion is a map-based companion for planning your hunts and fishing trips: stands, cameras, sightings, wind &amp; thermals, terrain reads, and more.</p>" +
      "<p><strong>To get started:</strong></p>" +
      "<ol>" +
        "<li>Open <a href=\"" + APP_URL + "\">" + APP_URL + "</a> — on your phone, tap Share → <em>Add to Home Screen</em> so it opens like an app.</li>" +
        "<li>Tap <strong>CREATE ACCOUNT</strong> and sign up with <strong>this same email address</strong> and a password.</li>" +
        "<li>Say hello to <strong>Ol' Gus</strong> in the corner — tap him anytime and he'll walk you through anything.</li>" +
      "</ol>" +
      "<p><strong>The deal:</strong> it's free while we're testing. All I ask is that you send your honest feedback as you use it — there's a <strong>💡 Suggestion / Issue</strong> button right in the app. Testers who keep up regular, useful feedback earn a <strong>free year</strong> once we launch. 🤝</p>" +
      "<p style=\"margin-top:18px;\"><strong>The fine print you'll agree to when you first sign in:</strong></p>" +
      "<ul>" + items + "</ul>" +
      "<p style=\"margin-top:18px;\">See you in the woods,<br/><strong>Outdoor Companion</strong></p>" +
    "</div>";
}
function welcomeEmailText() {
  return "Welcome to Outdoor Companion!\n\n" +
    "You're in — I've approved your email for early access.\n\n" +
    "To get started:\n" +
    "1) Open " + APP_URL + " (on your phone, add it to your Home Screen so it opens like an app).\n" +
    "2) Tap CREATE ACCOUNT and sign up with THIS same email address and a password.\n" +
    "3) Tap Ol' Gus in the corner anytime for a hand.\n\n" +
    "The deal: it's free while we're testing. Please send honest feedback with the in-app Suggestion/Issue button. Testers who keep up regular, useful feedback earn a free year once we launch.\n\n" +
    "The fine print you'll agree to on first sign-in:\n- " + AGREEMENT_LINES.join("\n- ") + "\n\n" +
    "See you in the woods,\nOutdoor Companion";
}

/**
 * Update broadcast — owner types a "what's new" note in the console and it emails every tester
 * account at once (BCC, so recipients don't see each other). Owner-gated.
 */
exports.sendBroadcast = onCall(
  { region: "us-east1", secrets: [GMAIL_APP_PASSWORD], memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    ownerOnly(request);
    const subject = String((request.data && request.data.subject) || "").trim().slice(0, 200);
    const message = String((request.data && request.data.message) || "").trim().slice(0, 8000);
    if (!subject || !message) throw new HttpsError("invalid-argument", "A subject and a message are required.");
    const emails = [];
    let pageToken;
    do {
      const res = await admin.auth().listUsers(1000, pageToken);
      res.users.forEach((u) => { if (u.email) emails.push(u.email); });
      pageToken = res.pageToken;
    } while (pageToken);
    if (!emails.length) return { ok: true, sent: 0 };
    const safe = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#20281a;max-width:560px;line-height:1.5;\">" +
      safe +
      "<hr style=\"border:none;border-top:1px solid #ccc;margin:18px 0;\"/>" +
      "<p style=\"font-size:12px;color:#888;\">You're receiving this as an Outdoor Companion tester. Reply anytime with feedback.</p></div>";
    await sendMail(MAIL_FROM, subject, message, html, emails);   // BCC everyone
    return { ok: true, sent: emails.length };
  }
);

/**
 * Owner-only test send — fires a sample email to the owner so mail can be re-verified any time
 * (wired to a "Send test email" button in the console). Owner-gated; sends only to the owner.
 */
exports.sendTestEmail = onCall(
  { region: "us-east1", secrets: [GMAIL_APP_PASSWORD], memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    ownerOnly(request);
    const info = await sendMail(
      FOUNDER_EMAIL,
      "Outdoor Companion — test email ✅",
      "This is a test from Outdoor Companion. If you're reading this, sending from rfaison@outdoorcompanionapp.com works.",
      "<p>This is a test from <strong>Outdoor Companion</strong>.</p><p>If you're reading this, sending from <strong>rfaison@outdoorcompanionapp.com</strong> works. 🤠</p>"
    );
    return { ok: true, messageId: info && info.messageId, accepted: info && info.accepted };
  }
);

/**
 * Group sharing — membership mutations that clients can't do safely.
 *
 * Data model: groups/{gid} = { name, ownerUid, memberUids:[...],
 * members:{uid:{name,role,joinedAt}}, inviteCode, createdAt }.
 *
 * Phase 3b (per-item sharing): items stay in their owner's tree
 * (users/{uid}/{coll}/{id}) and carry a top-level `sharedGroups:[gid]`. The group
 * view is a collectionGroup query across members. The security rule that lets a
 * member read another member's shared item checks membership against a top-level,
 * FUNCTION-ONLY mirror doc `memberships/{uid} = { groups:[gid,...] }`. That mirror
 * MUST be maintained here (never client-writable) — so create/join/leave each keep
 * it in sync. Group create/join/leave all run server-side: create so it can also
 * seed the mirror; join because a non-member can't read a group by code under
 * members-only rules; leave so self-removal / owner hand-off is validated.
 */
const REGION = "us-east1";

// Server-side invite code: 8 non-confusable chars (no 0/O/1/I/L).
function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

exports.createGroup = onCall({ region: REGION }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to create a group.");
  }
  const name = String((request.data && request.data.name) || "").trim().slice(0, 120);
  if (!name) {
    throw new HttpsError("invalid-argument", "A group name is required.");
  }
  const email = (request.auth.token && request.auth.token.email) || "";

  const db = admin.firestore();
  const ref = db.collection("groups").doc();
  const code = genCode();
  const members = {};
  members[uid] = { name: email, role: "owner", joinedAt: Date.now() };
  await ref.set({
    name: name, ownerUid: uid, memberUids: [uid], members: members,
    inviteCode: code, createdAt: Date.now(),
  });
  // Seed the membership mirror the security rules read.
  await db.collection("memberships").doc(uid).set(
    { groups: admin.firestore.FieldValue.arrayUnion(ref.id) }, { merge: true });

  return { gid: ref.id, code: code, name: name };
});

exports.joinGroup = onCall({ region: REGION }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to join a group.");
  }
  const code = String((request.data && request.data.code) || "").trim().toUpperCase();
  if (!code) {
    throw new HttpsError("invalid-argument", "An invite code is required.");
  }
  const memberName = String((request.data && request.data.name) || "").slice(0, 120);

  const db = admin.firestore();
  const snap = await db.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (snap.empty) {
    throw new HttpsError("not-found", "That invite code didn't match any group.");
  }
  const doc = snap.docs[0];
  const data = doc.data() || {};
  const members = data.memberUids || [];

  if (members.indexOf(uid) === -1) {
    const update = { memberUids: admin.firestore.FieldValue.arrayUnion(uid) };
    update["members." + uid] = { name: memberName, role: "member", joinedAt: Date.now() };
    await doc.ref.update(update);
  }
  // Keep the membership mirror in sync (idempotent).
  await db.collection("memberships").doc(uid).set(
    { groups: admin.firestore.FieldValue.arrayUnion(doc.id) }, { merge: true });

  return { gid: doc.id, name: data.name || "" };
});

exports.leaveGroup = onCall({ region: REGION }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const gid = String((request.data && request.data.gid) || "").trim();
  if (!gid) {
    throw new HttpsError("invalid-argument", "A group id is required.");
  }

  const db = admin.firestore();
  const ref = db.collection("groups").doc(gid);
  const snap = await ref.get();
  // Always drop the group from the leaver's membership mirror, even if the group is
  // already gone, so the rules never grant read via a stale membership entry.
  await db.collection("memberships").doc(uid).set(
    { groups: admin.firestore.FieldValue.arrayRemove(gid) }, { merge: true });
  if (!snap.exists) {
    return { left: true }; // already gone
  }
  const data = snap.data() || {};
  const members = data.memberUids || [];
  if (members.indexOf(uid) === -1) {
    return { left: true }; // not a member; nothing to do
  }

  const remaining = members.filter((u) => u !== uid);
  if (remaining.length === 0) {
    // Last member out — remove the group doc. Its shared subcollection records
    // become inaccessible (rules require a member), which is the intended clean slate.
    await ref.delete();
    return { left: true, deleted: true };
  }

  const update = {
    memberUids: admin.firestore.FieldValue.arrayRemove(uid),
  };
  update["members." + uid] = admin.firestore.FieldValue.delete();
  // If the owner leaves, hand ownership to the next remaining member so the group
  // never ends up ownerless (which would freeze name edits / deletion).
  if (data.ownerUid === uid) {
    update.ownerUid = remaining[0];
    update["members." + remaining[0] + ".role"] = "owner";
  }
  await ref.update(update);
  return { left: true };
});
