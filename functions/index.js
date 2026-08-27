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
  "You are Ol' Gus, the friendly in-app help companion for the Outdoor Companion app (a hunting " +
  "and fishing app). Folks ask you how the app works and where to find things; you answer like a " +
  "warm, plain-spoken hunting buddy. RULES: (1) Answer ONLY from the KNOWLEDGE below — it is the " +
  "app's own feature guide. If something isn't in it, say plainly you're not sure that's in the " +
  "app and suggest the closest thing or to check the menu — NEVER invent a feature, button, or " +
  "step that isn't described. (2) Keep it tight: a couple of sentences, or a short numbered list " +
  "for a how-to. No fluff, no long preambles. (3) You are a HELP guide, not a hunting/fishing " +
  "advisor — if they ask for strategy or a read on their specific ground, tell them that kind of " +
  "advice is on the way, and point them to the feature that helps today (Where to Hunt, Terrain " +
  "Read, Huntability, When to Fish). (4) Stay friendly and encouraging; it's fine to sound like " +
  "Gus. \n\n=== OUTDOOR COMPANION KNOWLEDGE ===\n" + GUS_KB;

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
    let response;
    try {
      response = await client.messages.create({
        model: MODEL_CHEAP, // help desk — cheapest model; the knowledge block is cached below
        max_tokens: 700,
        // Array-form system so the big, unchanging knowledge block can be prompt-cached: repeat
        // questions then only pay for the short question + answer, not the whole guide each time.
        system: [{ type: "text", text: GUS_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: messages,
      });
    } catch (e) {
      console.error("askGus request failed:", e && e.message);
      throw new HttpsError("internal", "Ol' Gus couldn't get to the answer right now. Try again in a minute.");
    }

    const tb = (response.content || []).find((b) => b.type === "text");
    const answer = tb && tb.text ? tb.text : "Hmm, I didn't quite catch that — ask me another way?";
    const u = response.usage || {};
    console.log("askGus ok:", "in=" + (u.input_tokens || 0), "out=" + (u.output_tokens || 0), "cacheRead=" + (u.cache_read_input_tokens || 0));
    return { answer: answer, model: MODEL_CHEAP, answeredAt: Date.now() };
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
