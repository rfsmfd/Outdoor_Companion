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

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

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
  { region: "us-east1", cors: true, memory: "256MiB", timeoutSeconds: 20 },
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

  // --- feedback + waitlist + agreements (newest first) ---
  const [fbSnap, wlSnap, agSnap] = await Promise.all([
    db.collection("feedback").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] })),
    db.collection("waitlist").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] })),
    db.collection("agreements").limit(2000).get().catch(() => ({ docs: [] })),
  ]);
  const feedback = fbSnap.docs.map((d) => d.data());
  const waitlist = wlSnap.docs.map((d) => d.data());
  const agreements = {};   // uid -> { acceptedAt, version }
  agSnap.docs.forEach((d) => { agreements[d.id] = d.data(); });

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
      const fbCount = (fbByEmail[em] || 0) + (fbByUid[u.uid] || 0);
      const ag = agreements[u.uid];
      testers.push({
        email: u.email || "(no email)",
        uid: u.uid,
        createdAt: u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : 0,
        lastSignIn: lastSignIn,
        daysQuiet: lastSignIn ? Math.floor((now - lastSignIn) / DAY) : null,
        feedbackCount: fbCount,
        agreedAt: ag ? (ag.acceptedAt || 0) : 0,
        agreedVersion: ag ? (ag.version || 0) : 0,
      });
    });
    pageToken = res.pageToken;
  } while (pageToken);
  testers.sort((a, b) => (b.lastSignIn || 0) - (a.lastSignIn || 0));

  return { generatedAt: now, feedback: feedback, waitlist: waitlist, telemetry: telemetry, testers: testers };
});

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
