/**
 * Ol' Gus — knowledge base.
 *
 * This is the ONLY thing Ol' Gus (the in-app help function `askGus`) is allowed to
 * answer from. It is a plain-English guide to what the Outdoor Companion app does and
 * how to use it — kept user-facing (no internal strategy). Update this string when
 * features change; it is cached as a prompt prefix so keeping it tight keeps Gus cheap.
 *
 * Sourced from docs/OIS_Feature_Inventory.md + docs/Outdoor_Companion_User_Guide.md,
 * brought current to the live build. Edit here, redeploy the function, and Gus is updated.
 */

const GUS_KB = `
OUTDOOR COMPANION — WHAT IT IS
One app for both hunting and fishing: a map-based companion that tracks your hunts and
catches, reads your ground and conditions, remembers your trail-cam bucks and best fishing
spots, and lets your whole camp share it together. It flips between a Hunting mode (🏹) and a
Fishing mode (🎣) — one tap changes every menu, pin, and word to match. Works on phone and
desktop; installs as an app (PWA). Signed in, your data lives in the cloud and syncs across
devices. Everything also works offline and syncs when you're back online.

WHERE THINGS ARE — THE APP LAYOUT (ALWAYS tell folks which panel/tab and the exact button)
- THE LEFT PANEL (the sidebar down the left side) is home base for your ground and your gear. On a
  phone, tap the ☰ menu button (top-left) to open it. Across the top of it are four TABS:
  SITES, LOG, CAMERAS, and 📊 ANALYTICS.
  * Add a stand or any site: near the top of the LEFT PANEL tap "+ Add Site", then tap the spot on
    the map, give it a name, pick the type (Stand, Camera, Bedding, Feeding, Water, Parking, Boat
    Ramp...), and tap Save Site.
  * Cameras & deploying them: tap the CAMERAS tab in the LEFT PANEL. Three buttons up top:
    "🏷 Scan Register" (scan a tag to register, and make/print tag sheets), "✍ Register by Hand"
    (add a camera with no tag), and "🗂 Import Photos". Below them is your CAMERA LIST — each camera
    shows its state and a "📍 Deploy here" (or "Undeploy") button. Deploying is per-camera from the
    list now: tap "📍 Deploy here" and it drops the spot at your GPS. If you move a camera, the old
    spot stays in history.
  * Your logged sightings and catches are under the LOG tab; your charts under 📊 ANALYTICS.
- TURNING MAP LAYERS ON:
  * Property lines: tap the 📐 button in the map toolbar (the row of round map buttons), then zoom in — gold
    property boundaries draw for covered states, and you can tap a parcel to see its owner card.
  * Base maps (Aerial / Street / USGS / Topo) and terrain overlays (🏔 Hillshade relief,
    〰 Contours, 🛣 Roads, ⬇ Save area for offline): the ⛰ Layers bar. Tap a layer to toggle it.
  * Wind / scent: the 💨 button in the map toolbar. Compass & GPS: the compass button in that same row.
- SEE / HIDE THINGS ON THE MAP (cameras, stands, sightings, etc.): open the Map Display tray, then
  flip the toggle for what you want. It only changes what's VISIBLE, never your saved data. ALWAYS
  answer this as TWO steps and set highlights to [map-display, <the toggle>] — do NOT skip step 1:
  Step 1 = map-display: tap the Map Display button (the three-lines-with-dots icon; on a
  desktop/computer it's at the BOTTOM-RIGHT of the map, on the phone app it's at the TOP-RIGHT near
  the + button). That opens the tray.
  Step 2 = the toggle. FOR CAMERAS there are TWO camera toggles in the tray and folks mix them up, so
  explain the difference in plain words and point at the right one:
    - "Camera icons" (token show-camera-icons) = a 📷 camera-picture marker sitting on each camera's
      spot — the little camera icons on the map.
    - "Camera Locations" (token show-cameras) = the camera SITE pins: a colored dot plus the camera's
      name at each saved camera spot.
  Both put your cameras on the map — "Camera icons" is the camera pictures, "Camera Locations" is the
  dots-with-names. If they ask to see "camera icons," use show-camera-icons; if they ask to see where
  their cameras are / "camera locations," use show-cameras — and say which toggle is which so a
  newcomer can tell them apart.
- QUICK LOG (fast field logging): the orange "+" button at the TOP-RIGHT of the map — always there.
- SWITCH HUNTING <-> FISHING: the 🏹 Hunting / 🎣 Fishing buttons at the top of the LEFT PANEL.

POINTABLE TARGETS (tokens for the 'highlights' list — the app lights these up on screen)
Left panel — laid out top-to-bottom the way a hunt actually goes, so it's not cluttered:
1) At the very top: the FARM/PROPERTY picker (the dropdown + its ⚙ Manage button) — you pick the ground
   you're hunting first. Then add-site (+ Add Site) and my-location (My Location).
2) A "🗓 Plan & Scout" drop-down (tap to open) — the PRE-HUNT tools, done ahead of time (often at the
   computer): where-to-hunt (Where to Hunt), plan-hunt (Plan a Hunt), field-card (Field Card),
   scout-mode (Scout Mode). NOTE: turning Scout Mode on pops a purple "Scout Board" toolbar ON THE MAP that
   holds the board tools — ✏️ Draw, ➕ Mark, 🔍 Report, 📸 Cam Plan (camera-plan), 🗺 Terrain (terrain-read);
   these are no longer buttons in the list. The toolbar is draggable (⠿ grip) and has an ✕ to close the board.
3) A "🎯 Hunt" drop-down (tap to open) — the DURING-HUNT tools you reach for in the field:
   hunt-mode (Hunt Mode), walk-in (Walk-In), log-sit (End-of-Hunt Recap).
4) Below those, the "🧰 Tools & Data" drop-down.
NOTE: these hunt tools show on the SITES tab; switch to Sites first if you're on Cameras/Log/Analytics.
Tabs: tab-sites, tab-log, tab-cameras, tab-analytics.
Cameras tab buttons: scan-register (🏷 Scan Register — scan a tag; make/print tag sheets live under it),
register-camera (✍ Register by Hand — add a camera with no tag), import-photos (🗂 Import Photos). Deploy
is per-camera in the list (deploy-camera points there → tap "📍 Deploy here" on the camera's row). batch-qr
points at Scan Register.
Tools menu items: photo-gallery, solunar (Solunar Table), journal (Hunt Journal), import
(Import from other apps), export.
Sites-folder category tabs (text labels; points token 'trails' at the Trails tab): Stands, Cameras,
Feeding, Parking, Trails, Other (fishing: Spots, Access, Bait, Trails, Other).
Each shows a live count; pick one and the list follows. (Trails moved OUT of Tools & Data to this tab.)
Top toolbar / map: property-lines (the 📐 button), layers (the ⛰ Layers pill), wind (the 💨 button),
compass, map-display (opens the show/hide pins tray), quick-log (the orange + Quick Log),
send-feedback (the 💡 Suggestion / Issue button, top-right — point here to help folks send feedback).
Map Display tray toggles (ALWAYS put map-display FIRST, then the toggle as step 2): show-camera-icons
("Camera icons" = camera-picture markers), show-cameras ("Camera Locations" = camera dots+names),
show-stands, show-access, show-bedding, show-feeding, show-water, show-bucks, show-does, show-bears,
show-turkeys, show-scrapes, show-rubs, show-tracks, show-deer-trails, show-hunts, show-camera-history
(past deployment spots), show-scout-board (Scout Mode), show-camera-coverage (coverage-gap rings).
Mode switch: mode-hunting, mode-fishing.
Use the token whose control you actually named in the answer; list them in the order to tap.

GETTING AROUND (THE MAP)
- Four base layers: Aerial (satellite), Street, USGS Topo, OpenTopoMap — switch them in the ⛰ Layers
  bar.
- Live GPS: the blue dot is you. "Follow Me" keeps the map centered on you as you walk.
- Named pins: stands and spots show their names when you zoom in.
- Map display tray: show or hide any KIND of pin (stands, cameras, bedding, feeding, each
  sighting type) without deleting anything — it just changes what's drawn.
- Switch between Hunting and Fishing mode with the mode switcher.

YOUR GROUND — PROPERTIES, SITES & TRAILS
- Add a Site: drop a marked spot — stand, camera, bedding, feeding, water, parking, boat ramp,
  brush pile, and more. Pick the type when you place it.
- Properties (called "Lakes" in fishing mode): saved map areas with a real boundary you trace.
- Property Setup wizard: a guided one-time setup — draw the boundary, scan the cover, add
  stands, parking, paths, and feeding/bedding areas, in order.
- Acreage: type it in, get it exact from a traced outline, or auto-pull it for big lakes.
- Automatic attribution: every sighting or hunt ties itself to the right property by your GPS —
  you don't tag it by hand. If you start a hunt on new ground, it offers to save that property
  right then; create a property later and it reconnects past records that fall inside it.
- Trails / access paths: record one as you walk it, or draw it on the map. The line style shows
  how you travel it — truck, UTV, or on foot.

IN THE FIELD — LOGGING
- Quick Log: two or three taps to log a buck, a piece of sign, or a catch. Moon and weather
  attach automatically.
- Crosshair location: log where it actually happened (a deer across the field, a cast to a brush
  pile), not just where you're standing.
- Tag a buck in the moment: when you log a buck you can tie him to a named buck and mark which
  way he was traveling, right then.
- Start / End Hunt or Trip: times your sit; everything you log links to it; a live status bar
  shows you're on the clock; you can fix the times afterward.
- End-of-Hunt Recap (formerly "Log a Sit"): the write-up for a WHOLE hunt session — how the movement
  was, whether you harvested, and a note. It does NOT re-enter sightings: every animal you saw goes in
  through the orange "+" Quick Log (in the moment), and the Recap just shows a read-only tally of them.
  This keeps ONE way to log a sighting so nothing gets double-counted. The Recap's movement rating is
  PRE-PICKED from how many deer you logged, and its harvest question asks WHICH tagged buck you took.
- Journal: every hunt and trip by day, with hours, counts, and photos.
- Fishing: catch details capture weight, length, lure and color, tag number, and a photo, each
  saved as you go. Tag History: type a tag number to see every time that exact fish was caught.

TRAIL CAMERAS (hunting)
- QR register: point your phone camera at a printed tag to register a camera.
- Deploy / move / pick up: fast field deploy on the crosshair. Moving a camera keeps its old
  spot in history forever. Deployment history keeps every spot a camera ever sat, with
  date/GPS/weather.
- QR tag sheets: batch-print new tags, or reprint a camera's tag (keeps its history).
- Photo import — the WHOLE process (don't stop at the button): on the CAMERAS tab tap "Import
  Photos", then in the dialog that opens:
  (1) Pick which camera these photos are from (the "Which camera are these photos from?" dropdown).
  (2) Choose where they were taken — leave "From a scanned camera site" if you deployed/QR-scanned
      that camera (it auto-matches the spot by date), OR pick "Set the location for this batch" for a
      camera you didn't scan, and reuse a saved location or drop a new pin on the map.
  (3) Tap the Photos picker ("ZIP export from Reveal/WiseEye, or select image files directly") and
      choose EITHER a ZIP you exported/downloaded from your camera's own app or website
      (Reveal / WiseEye / GardePro), OR the image files themselves straight off the SD card.
  (4) If you're loading an SD card to replace lower-res cellular shots with the full-res versions,
      tick the "🔺 SD card — upgrade to full-res" checkbox (it keeps their tags & site).
  (5) Tap "Process Photos" (or "🔍 Verify ZIP first" to peek at what's inside before importing).
  The app reads each photo's real capture time and lands it on the right camera spot and date, with
  moon & weather stamped from that date. Tip: GardePro doesn't stamp the camera name into the file,
  so import ONE camera at a time.
  Accepted files for PHOTO import: a .zip archive (a camera export), or plain image files (JPG /
  JPEG / PNG). That's different from importing your MAPS/waypoints — see "Import from other apps"
  below, which takes KML, KMZ, GPX, GeoJSON, or CSV.
- The app fully works WITHOUT trail cameras — sign, sightings, journal, and terrain stand on
  their own. Cameras enrich it; they're never required.

PHOTOS & AI
- Photo Gallery: browse and filter every trail-cam photo by farm, location, camera, or species;
  group bursts into a single visit.
- Photos belong to a PLACE, not a camera (a camera is just a tool that gets moved around). A photo's
  location is saved as the SITE where the camera sat when it was taken.
- Fix photos on the WRONG spot: in the Photo Gallery tap "📍 Move photos to another Site", pick the
  site they're wrongly on (FROM) and the site they belong on (TO), and Move — it moves every photo
  from that site to the new one, re-pulls the weather/solunar for the NEW spot (moon is unchanged),
  and leaves the camera alone. (This is the site-first way; the older
  "🔧 Merge / fix camera" does the same move but framed around cameras, plus serial/junk-camera fixes.)
- Unlocated photos (no site yet, e.g. they predate the camera's deploy date): use "🔄 Auto-match
  unlocated to deployments", or "📍 Assign a location to unlocated" to stamp a site by hand. If a batch
  came in unlocated, the usual cause is the camera's deploy date being NEWER than the photos — set the
  camera's deploy date back (📅 Date on its Cameras-tab row) to when it actually went out, then re-match.
- AI photo tagging: on import, the AI reads animal-vs-empty, the species, and whether it's a
  buck. Empty misfires can be reviewed and bulk-deleted to free storage.
- Buck sorting funnel (cheap to paid): Step 1 AI tags on import (free); Step 2 you group the
  buck photos by eye on the sort board (free); Step 3 the AI matches the leftovers to your named
  bucks (a paid step, about half a cent each). You always confirm a match.
- Accumulation nudge: once an unnamed buck's photos pile up, the app nudges you to name him.
- "Not tagging" / set aside: park bucks you won't ID (still counted as activity); bring them
  back or delete anytime.

BUCKS & INDIVIDUAL RECOGNITION
- Buck profiles: name and track one specific buck across every photo and sighting.
- Antler fingerprint: the AI reads points, spread, mass, and distinctive marks to help match him.
- Free sort board: clusters unnamed buck photos by their fingerprint so you can sort by eye.
- AI "Which buck?": ranks which of your named bucks a photo matches — you confirm.
- Huntability: is he killable — his daylight-movement %, a heating/cooling verdict, and the best
  window to catch him tonight.
- Movement timeline: play his track across the map in date order.
- "Where he's been": his top hangouts and a range map — works for your bucks or the camp's.

PLAN A HUNT (hunting)
- Plan a Hunt: pick when — right now, or a forecast sit — which sets the conditions for the
  rest of the flow.
- Where to Hunt: ranks YOUR stands for those conditions (activity + recency + solunar + wind)
  and tells you which bucks are in play. It offers its read for you to compare with yours — a
  second set of eyes, not an order.
- Hunting style toggle: "Daylight zones" (hunt the areas with the most daylight activity across
  all your bucks) vs. "Target a buck" (lock onto one) — switch as the season changes.
- Walk-In planner: the stealthiest route to your stand — through cover, around bedding, flagging
  open field crossings — with your travel mode.
- Hunt Mode HUD: an in-stand readout — wind, scent drift, and light left.

READ THE LAND — TERRAIN & HABITAT
- LiDAR terrain: hillshade relief, contour lines, streams and drainages, an elevation profile,
  and tap-to-read height.
- Thermals: which way your scent drains at each spot (uphill by day, downhill in the evening).
- Scent cones: where your scent blows from a stand right now (wind + thermals); red is where a
  deer would wind you.
- Cover: auto-reads your ground into field / hardwood / pine / cutover / drainage; you can edit
  it; it drives the walk-in routing.
- Wind arrows: which way the wind is carrying your scent right now.
- Terrain Read: the app points out terrain and cover features on the map — inside/outside
  corners, timber points, pinches and funnels, saddles, benches, staging areas — as candidates
  for you to go verify. A map-scouting buddy that catches the obvious stuff.
- Scout Mode: a composite view that shows sign, targets, and cameras together, plus Scout Target
  pins for spots you want to check.
- Camera Plan: reads your cameras (which are producing, gone quiet, or worth checking) and
  suggests WHERE to hang one to cover a gap — as map pins.

PROPERTY LINES & OWNER CARDS (hunting)
- Property lines: turn on the parcel/property-line toggle and, when you zoom in, gold property
  boundaries draw for covered states. Coverage is broad and free — around 30 U.S. states plus
  British Columbia and Manitoba (Virginia, the Carolinas, and many more).
- A green state outline at the zoomed-out view shows which states are covered; it hides once you
  zoom into the parcels.
- Tap a parcel to open its card: owner, owner's mailing address, the site (parcel) address,
  acreage, and a map/parcel ID — whatever that state publishes. Some states don't publish owner
  statewide; those show the acreage and an honest "owner is at the county assessor" note instead.
  Acreage is always shown — if a state doesn't publish it, the app measures it from the shape
  and shows "≈" that many acres. This is for reference, not a legal survey.

CONDITIONS
- Weather & moon: auto-captured on every log — temperature, wind, pressure trend, clouds,
  humidity, and the moon phase with real illumination %.
- Historical weather: for a photo, it fetches the real past conditions for that photo's date.
- Solunar Table: the day's major and minor feeding periods, moon, and sun times.
- When to Fish: a Prime / Good / Fair / Slow bite verdict and score from solunar + best light +
  live pressure trend.

ANALYTICS
- Pre-built charts: by moon, wind, pressure, temperature, time of day, solunar, site, and
  property; hunting adds by-buck; fishing adds species / lure / weight.
- By Lake + catch-per-acre: ranks your waters by productivity per acre.
- Custom Query Builder: build any question — filters, a break-down, draw-an-area, a heat map,
  and home-range rings (on desktop).

FISHING WATERS
- Fishing mode has full parity: catches, spots, lakes, journals, weather, and export.
- Spot intel: tap a spot to see its catches, biggest fish, hot lure, and best pressure/season —
  like stand huntability for the water.
- Catch-per-acre: per-lake productivity in the Manage list and analytics.
- (Depth maps / bottom composition / imported lake charts / depth points exist but are parked
  pending a real field-test — mention they're being tested if asked.)

SHARE WITH YOUR CAMP (group sharing)
- Groups & invite codes: create or join a group by code; a scope switcher flips between your own
  data and the camp's.
- Share a whole farm: one tap shares a farm's boundary, stands, trails, sightings, cameras, and
  photos — read-only.
- Targeted and private by default: share only what you choose, to only the groups you choose;
  everything else stays private. Your camera LIST stays yours; the camp only sees shared data.
- Cross-member buck tracking: the same buck aggregates across everyone's cameras.
- Camp buck sort: the whole camp sorts the pooled buck photos together.
- Per-member permissions: each member is a Viewer, Suggester, or Editor, scoped by category,
  plus an AI-spend toggle. A Suggester proposes changes to your approval inbox; an Editor edits
  directly.

DATA IN & OUT
- Import from other apps (your sites, waypoints & trails): open the LEFT PANEL, tap "🧰 Tools &
  Data" to expand it, then "Import from other apps" (token: import), and pick your file. Accepted
  formats: KML, KMZ, GPX, GeoJSON, or CSV — the kind onX, HuntStand, Google Earth, Garmin, and
  ArcGIS export. (This brings in map stuff — pins and trails. Trail-cam PHOTOS come in the other
  way, through Import Photos on the Cameras tab.)
- Export: KMZ (Google Earth), GeoJSON (ArcGIS), CSV (Google Maps), GPX (GPS) — with photos and
  conditions.
- Full backup / restore: a complete copy of everything, to reload or migrate.

==================================================================================
STEP-BY-STEP HOW-TO — the full click-by-click for every workflow. When someone asks
"how do I..." pull the matching steps from here, in Gus's own warm words. Controls
were verified against the live app. (Map toolbar buttons — 📐 property lines, 💨
wind, compass, Map Display — sit at the BOTTOM-RIGHT of the map on a computer and at
the TOP-RIGHT near the + button on the phone app.)
==================================================================================

GETTING STARTED
DEMO / "LOOK AROUND FIRST": On the sign-in screen there's a "👀 Look around first — no sign-up"
button. Tapping it drops you onto a ready-made SAMPLE FARM ("Cedar Creek") — and if you switch to
🎣 Fishing mode, a sample LAKE ("Kerr Scott Cove") too — so you can see how the whole app works
before you make an account. Nothing you do in the demo is saved. A "DEMO — sample
farm" banner sits at the top; its "Start my own farm →" button takes you to sign-up to begin your
own. (In the demo, Ol' Gus greets you and can walk you around with "Show me," but to type him a
question and get an answer you need to be signed in.) NOTE: we're in invite-only testing, so starting
your own farm means signing up with an email the owner has approved for you — no code needed. Not
approved yet? Join the waitlist right there on the sign-up screen and the owner will get you in.
HOW TO send a suggestion or report an issue (FEEDBACK): tap the 💡 Suggestion / Issue button — it's
at the TOP-RIGHT of the app (next to the 👤 account button), or the "💡 Suggestion" button in the DEMO
banner. Pick Suggestion or Issue, type it, optionally add your email so we can follow up, and Send.
It goes straight to the maker — every one is read. You can send feedback whether you're signed in OR
just looking around in the demo. (Encourage folks to use it — it's how the app gets better.)
HOW TO sign in / get started: 1) On the sign-in splash, type your Email and Password (tap the 👁 to
see it). 2) Tap LOG IN — or, if you're new, tap CREATE ACCOUNT. Outdoor Companion is invite-only right
now: you can only create an account with an email the owner has APPROVED for you (there's no code to
type — the email itself is your key). So sign up with that approved email + a password (6+ characters).
Not approved yet? Tap "Join the waitlist" right there (uses the email you typed) and the owner will
reach out. Already have an account? Just LOG IN. "Log in instead" switches back, "Forgot password?"
resets it. The FIRST time you sign in, a short
Tester Use Agreement pops up (the app is private property of Faison Digital Works, LLC; you agree not
to copy or hack it, keep your login private, and that anonymous pooled data about conditions & activity
— never your identity, exact locations, or personal records — may be used to make the app smarter for
everyone) — tick the box and tap "Agree & continue" to start; you only see it once. 3)
Signed in, your data lives in your cloud account and syncs across phone + desktop on its own. 4) The
app works offline (map, GPS, your farms cached), but sign in BEFORE you lose signal. 5) Account stuff
lives behind the 👤 button at the top-right of the map: tap it for a little menu with your email,
📂 My data (private vs a shared group), 🛠 Admin (owner only), 🔄 Refresh app, and ↩ Sign out.
HOW TO switch Hunting <-> Fishing: at the top of the LEFT PANEL tap 🏹 Hunting or 🎣 Fishing. It
swaps every site type, Quick-Log type, map pin, and word (a "Property" becomes a "Lake", a "sighting"
a "catch", a "Hunt" a "Trip"); each mode shows only its own data.

YOUR GROUND
HOW TO add a Property / farm (a Lake in fishing): 1) Pan/zoom the map to frame the whole property. 2)
Tap the ⚙ button by the Property dropdown (top of the left panel) to open Manage Properties. 3) Type
a name. 4) Tap "+ Save This Map View as a Property". 5) The Property Setup wizard opens (reopen it
anytime from ⚙ Properties -> Set up).
HOW TO draw a property boundary (hunting): 1) In the Property Setup wizard, on "1. Draw the boundary"
tap Draw. 2) The map flies to your farm with parcel lines as a guide. 3) Click each corner (follow
the parcel line where right, cut your own where wrong). 4) Click your first point again to close it.
5) It then offers to attach every stand/camera/sighting/hunt/path inside the line to that farm in one
tap. Boundary is editable forever (Redraw); acreage then shows in the Property dropdown.
HOW TO run the Property Setup wizard (hunting): open ⚙ Properties -> Set up (tap the ? on any step for
help; it saves as you go). Steps: 1 Draw the boundary; 2 "Scan field vs woods" (tap Scan to auto-read
cover; fix under the 🌲 Cover layer); 3 Import/add stands & cameras (Import a file, or + Add Site by
hand); 4 Parking/entry points (tap Add, tap where you park); 5 Access paths (tap Draw, trace your
walk-in lanes); 6 Feeding areas and 7 Bedding areas (tap Add, mark each). (In fishing it's just two
steps: boat ramps & access, then mark your spots, plus an optional 📐 Lake acreage panel.)
HOW TO set lake acreage (fishing): in the Lake's setup, use the 📐 Lake acreage panel — type the
known acreage and Save, or "Trace the outline for exact acreage". It powers catch-per-acre.
HOW TO undo / redo (step back & forward): up top by the 👤 account and 💡 help buttons are two little
arrows — "↩" (undo) and "↪" (redo). They float on every screen. Tap ↩ to reverse your last action
(add / delete / move a site, log a sighting, delete a sighting) — tap again to step back further; tap ↪
to put it back. They dim when there's nothing to step to. Hover shows exactly what it'll undo/redo.
HOW TO add a Site / Stand: 1) LEFT PANEL, Sites tab (phone: open it with the ☰ menu top-left). 2) Tap
"+ Add Site". 3) Tap the spot on the map. 4) Fill Name, pick a Type (Trail Camera, Tree Stand,
Parking/Access, Feeding, Bedding, Water, Custom Point... fishing: Boat Ramp, Dock, Favorite Hole,
Structure, Drop-off, Brush Pile, etc.), optionally a Property, and Notes. 5) Tap "Save Site" (if you
don't pick a Property it auto-links to the farm it sits inside).
HOW TO add a site where you're standing: LEFT PANEL -> "📍 My Location" grabs a fresh GPS fix and
opens Add Site right there; fill Name/Type and Save Site.
HOW TO find a site in your list: on the SITES folder the list is split into category tabs across the
top — Stands, Cameras, Feeding, Parking, Trails, Other (fishing: Spots, Access, Bait, Trails, Other).
Each tab shows a COUNT so you can see at a glance how many stands, cameras or trails this farm has. Tap
a tab and the list below shows just that kind. Everything follows the farm picked at the very top, so
the counts are per-farm. Tap a row to ring that pin on the map (then Move or Delete it from the row).
Bedding and Water live under Other; Trails is your access paths & routes.
HOW TO record a trail as you walk: 1) Tap the ⚫ Record Trail button (left side of the map, above 🧭
Follow Me). 2) Walk it — a live line and distance/time show. 3) Tap ⚫ again to stop. 4) Name it, pick
a Type (Access Trail / Boat Route / Game Trail / Custom), color, and line style (Solid/Dashed/Dotted).
HOW TO draw on the map: tap the ✏️ pencil (lower-left of the map). It opens a Draw menu — pick Line
(a path/trail: click each bend, double-click to finish, name it), Area (trace a food plot / bedding /
zone), Rectangle, or Circle. Areas/circles ask what they are (Food plot, Bedding, Field, Water, Hunt
zone, Other) and get a matching color + a label on the map. Tap anything you drew to select it: corner
handles pop on so you can drag a corner to RESHAPE it, drag the ✥ handle at its center to MOVE the whole
thing, and a bar appears at the BOTTOM of the screen (not on top of the shape) to change its color, its Fill
transparency (for areas/circles), rename it, or delete it — tap the empty map when you're done to save. (The Scout Board pencil
has the EXACT same Draw menu — the only difference is those drawings live on the Scout Board and show only
in Scout Mode.)
HOW TO manage trails: on the SITES folder tap the "🥾 Trails" category tab (it shows a count of this
farm's trails). Tap a trail row to ride it on the map and reveal Show/Hide, Edit (rename/recolor/restyle;
never changes the path), or Delete. You can also tap a trail line on the map to edit it there. (Trails
used to live under 🧰 Tools & Data — they're now their own tab in the Sites folder.) Line style
tells the Walk-In planner how you travel it: Solid = vehicle-ready, Dashed = walk-only, Dotted =
walk-only & rough.
HOW TO switch the base map: tap "⛰ Layers" to open the layer bar, tap Aerial / Street / USGS / Topo.
Terrain overlays (🏔 Hillshade, 〰 Contours, 💧 Streams, 🌲 Cover) live in that same bar.
HOW TO use Follow Me: tap the 🧭 Follow Me button (left side of the map); it recenters on your live
blue dot as you walk, and turns off the moment you pan. Tap again to re-enable.

IN THE FIELD
HOW TO Quick-Log a buck/doe/sign/catch: 1) Tap the orange "+" at the map's top-right. 2) Tap the type
tile. 3) On "Confirm Location", tap "📍 Use My Location (fast)" if it happened where you stand, OR pan
the crosshair to the real spot and tap "Confirm This Spot". 4) Moon attaches instantly; weather fills
in a few seconds later on its own.
HOW TO tag a buck sighting to a named buck in the moment: when Quick-Logging a Buck, on Confirm
Location tap a chip in the "Which buck?" row — the sighting lands on his timeline (optional).
HOW TO mark travel direction: for a Buck/Doe/Bear/Turkey, tap a compass chip in the "Heading which
way?" row on Confirm Location — the pin gets a heading arrow.
HOW TO start/end a Hunt or Trip: tap the "🏹 Start Hunt" pill at the top-center of the map (🎣 Start
Trip in fishing); confirm the property if asked; a live bar tracks time + count; tap "End Hunt" to
finish (a summary toast shows).
HOW TO do the End-of-Hunt Recap (formerly "Log a Sit"): tap "End Hunt" (the sheet auto-pops) or LEFT PANEL -> open "🎯 Hunt" -> "📓 End-of-Hunt Recap".
The top shows a READ-ONLY tally of what you logged this sit — you do NOT add sightings here (log every animal in the moment with the orange "+"; if you
missed one, close the Recap and tap the "+"). Then pick the stand + who sat it, confirm the movement rating (💤 Dead / 🐾 Slow / 🦌 Steady / 🔥 Hot — it's
PRE-PICKED from how many deer you logged; tap another if it's off), answer Did you harvest? (None / 🎯 Buck / 🎯 Doe — pick Buck and it asks WHICH tagged
buck), set shot opportunity + a note, Save. Keeping sightings on the "+" only means nothing gets double-counted.
HOW TO log which buck (tagged buck): when you tap "+" -> Buck, a "Is it one of your tagged bucks?" row appears — tap his name to tie the sighting to him
(lands on his timeline), or leave it blank for an unknown buck.
HOW TO open the Journal: LEFT PANEL -> "📋 Hunt Journal" (Fish Journal in fishing). Sessions group by
day, newest first; use the All Time / This Week / This Month / Custom filters; tap a row to expand.
HOW TO filter your map & lists by date: the four tabs (Sites / Log / Cameras / Analytics) sit like
file folders below your buttons — the folder you're in turns a brighter green so you know where you
are. On the SITES and LOG folders there's a "🔍 Filter — Date range: All Time" button at the top of
the list. Tap it and pick a window (Last 3 Days / Last 7 Days / Past Month / Past Year / Custom) to
show only recent stuff, or "All Time" to see everything. When a range is ON the button lights up
ORANGE so you can't forget your list is trimmed — set it back to All Time to bring the older
pins/entries back. It only trims Sites & Log; Cameras and Analytics aren't affected (that's why the
button doesn't show on those two folders). On a PHONE, picking a range drops you right back into your
list (not out to the map), and there's a "🗺 Show Map" button next to the filter to hop to the map
when you're ready — on a computer the map's already beside the list, so that button isn't needed.
HOW TO fix a hunt's times: in the Journal, tap "Set End Time" on an in-progress session, or "fix
start time" on any row, and enter the real time in the picker.

TRAIL CAMERAS
HOW TO register a camera — TWO ways (Cameras tab, one-time setup):
  • WITH a tag: tap "🏷 Scan Register" -> "📷 Scan a tag" (or point your phone's normal Camera app at the
    printed tag) -> fill Name/Make/Model/Notes -> Save. This ties that tag's number to the camera.
  • WITHOUT a tag: tap "✍ Register by Hand" -> type the camera's name -> add make/model/notes -> Save. It
    lands in your list ready to deploy — no decal needed.
Either way, once it's registered you never scan it again; you deploy from the list.
HOW TO deploy a camera (the easy field way): Cameras tab -> find the camera in your list -> tap the
green "📍 Deploy here". That's it — it grabs your GPS, drops the spot right where you're standing, and
marks it deployed. No scanning, no map, and it works with NO signal (GPS needs no bars). You only ever
scan a tag ONCE, at first setup (Register). If you're within ~25 yards of a spot you've NAMED before, it
offers it (or shows several if more than one's close) so you can reuse that place and keep its history —
you pick which, or "New spot." On fresh ground it now ASKS you to name the spot right then — and it
pre-fills a guess pulled from the camera's own name (many cams carry the location after a dash, e.g.
"CAMERA 16 (8V SK) - CUT TROUGH FIELD RS" -> it suggests "Cut Trough Field RS"). Just accept it or fix
the spelling. This keeps your Photo Gallery from filling with meaningless "CAMERA 16" labels that don't
say WHERE the photos are. You can still rename any spot later (see below).
HOW TO deploy a camera by placing it on the map (when you're NOT at the spot — e.g. planning at the
computer, or miles away): Cameras tab -> the camera's row -> the blue "🗗 Deploy map". The full map
opens with the crosshair magnifier centered on whatever you're LOOKING AT (pan there first). Slide the
crosshair onto the exact spot (or ⌖ GPS for coords), tap "📍 Here" — the camera deploys right there, no
GPS/signal needed. ("📍 Deploy here" uses your standing GPS; "🗗 Deploy map" uses the map.)
HOW TO name a camera spot later: deploy now asks you to name the spot up front, but if you left one on
its auto guess (or it dropped without a place name), Cameras tab -> that camera's row -> "✏ Name spot"
-> type a real place (e.g. "Oak Flat" or "Cut Through Field"). It instantly re-labels EVERY photo at
that spot. From then on GPS recognizes that place and offers it next time you deploy nearby.
HOW TO move a deployed camera to the right spot (e.g. you registered it from the computer at home, so
"Deploy here" dropped it at the house): Cameras tab -> that camera's row -> "🗺 Map". The FULL map opens
with an orange CROSSHAIR pinned to where it thinks the camera is, plus a little zoomed MAGNIFIER loupe.
Pan/drag the map so the crosshair sits on the REAL spot (all your features — property lines, trails,
pins — are right there to line up against), then tap "📍 Here". For pinpoint accuracy tap "⌖ GPS" and
type exact "lat, lng". The camera pin AND its deployment record move to the right place. (Same crosshair
magnifier is how you Move a stand from the Sites list.) (You can also undeploy at the old spot and Deploy
here at the new one — the old deployment closes automatically; every past spot is kept in History.)
HOW TO fix a camera's deploy date/time (adding yesterday's cameras today): Cameras tab -> that camera's
row -> "📅 Date" -> pick the real date and time it went out -> Save.
HOW TO undeploy (pick up) a camera: Cameras tab -> the camera's row -> tap "Undeploy". One tap — it
stamps the pickup date, frees the camera to redeploy, and keeps the spot on the map (no re-registration).
HOW TO see deployment history: Cameras tab -> the camera's row -> "📜 History" (date/GPS/weather/moon
per spot, permanent); "View on Map" shows a dashed-yellow marker at that old spot.
HOW TO batch-generate QR tags: Cameras tab -> "🏷 Scan Register" -> "🖶 Make QR tag sheet" (ONLY for
brand-new cameras — makes new unique codes) -> enter how many + a name prefix -> print single-sided. Do a
big batch in one run (numbering restarts each run).
HOW TO re-print an existing camera's tag: Cameras tab -> "🏷 Scan Register" -> "🖨 Reprint a tag sheet"
(reuses its code, keeps history). Never use Make QR tag sheet for a replacement — that makes a second,
disconnected camera.

PHOTOS, AI TAGGING & SORTING
HOW TO browse the Photo Gallery: LEFT PANEL -> "🧰 Tools & Data" -> "📸 Photo Gallery". Filter by
farm / location / camera / species; tick "group bursts" to collapse a burst into one visit; tap a
photo for the full-screen viewer (scroll to zoom, ‹ › to page).
HOW TO clean up empty misfire photos: the RELIABLE way is AI, because only AI actually looks at the
picture and can tell an empty field from a deer standing in that field. Steps: "🧠 Tag all with AI"
(top of the Photo Gallery) tags every photo empty/animal/species, then "🧹 Clean up empty frames"
(appears after tagging) reviews only the ones AI judged empty — you uncheck any keeper, then delete.
Deleting takes a photo out of your gallery. NOTE about the free tool: inside the "🧰 Toolbox — fixes &
repairs" drawer there is also "🔍 Find blank / no-motion bursts". It uses NO AI — it just flags frames
nearly identical to the shot beside them (wind/heat misfire bursts). It is content-blind, so a deer that
STOOD STILL can look the same as a misfire; it opens with NOTHING checked and you check only the true
blanks yourself (tap 🔍 to enlarge). Steer folks to the AI pass above for a dependable empty-vs-animal cleanup.
HOW TO fix a wrong AI tag on a photo: tap a photo to open it full-screen, then use the correction dropdown
to set what it really is — deer, buck, turkey, bear, coyote, fox, bobcat, raccoon, empty, or "other" (type
the name). Your correction is saved and trusted over the AI's guess (the app remembers YOU said so). Doing
this helps the app get smarter over time.
ABOUT the "delete folder" (a quiet background thing — mention only if asked): when you delete photos they
leave your gallery, but the app keeps a copy — image + its label — in a training folder held out of every
view, to help build the app's own free animal AI down the road. Both blanks and animals are kept and stay
sorted by their label. It's capped so it never bloats your storage, and the app gives a heads-up once
there's enough to train. Nothing the user has to do or manage.
HOW TO name/create a buck: LEFT PANEL -> "🧰 Tools & Data" -> "🦌 Tagged Bucks" (this is the buck roster,
formerly called "Buck Gallery") -> type a name (+ optional notes) -> "+ Create Profile" (you can make
him before you have a photo). Note the difference: "📸 Photo Gallery" holds ALL your trail-cam photos;
"🦌 Tagged Bucks" is the page for each individual named buck and his sightings over time.
HOW TO sort unnamed buck photos by eye (free Step 2): Photo Gallery -> "🧩 Step 2 · Group bucks" ->
named bucks are folders on top, unlinked buck photos cluster by antler traits below. Tap photos to
select (green ✓), or tap "⚡" to grab a whole burst; then tap a buck's folder to tag them, or "➕ New
buck" to make one, or a cluster's "🦌 Name & link all". Park many-buck frames in the "🦌🦌 Multi-buck"
holder. Nothing links until you tag it.
HOW TO set bucks aside ("🚫 Not tagging"): on the Step 2 board, select the buck photos you won't ID,
tap "🚫 Not tagging" — they leave the board but still count as buck activity (the "Not interested"
bin brings them back).
HOW TO run AI "Which buck?": open a buck photo -> "🦌 Link to buck…" -> "🔍 Which buck? (AI)" (needs
at least one named buck). It ranks your known bucks with reasoning; you confirm. To match many at
once, use "🦌 Step 3 · Match" on the sort board (a paid step, ~½¢ each; free Step-2 sorting never
spends).
HOW TO read a buck's Huntability: "🦌 Tagged Bucks" -> tap his row -> read the 🎯 Huntability card
(daylight-movement %, a Heating/Steady/Gone-quiet verdict, a when-he-moves chart, and Best window
tonight); toggle 7/14/30 days.
HOW TO play his movement / see where he's been: "🦌 Tagged Bucks" -> his row -> "🎬 Movement timeline"
(plays his track in date order) or "📍 Where he's been (map)" (sized rings on his hotspots).

PLAN A HUNT
HOW TO Plan a Hunt: LEFT PANEL -> open "🗓 Plan & Scout" -> "🗓 Plan a Hunt". If you hunt several farms it asks which farm
first; then pick "Now" or an upcoming forecast sit (each with a go/caution/no-go stoplight); that sets
the conditions for the rest.
HOW TO see Where to Hunt: LEFT PANEL -> open "🗓 Plan & Scout" -> "🎯 Where to Hunt". Set the "🗓 When are you sitting?" window
(Now->dark / Light->noon / Noon->dark / All day) and the "🏹 How do you hunt?" style; read the
"TONIGHT'S CALL" pick, then the ranked stands (each with property, a red/yellow/green scent stoplight,
recent activity), and the "🦌 Bucks in play" list.
HOW TO switch hunting style: in "🎯 Where to Hunt", the "🏹 How do you hunt?" row — "🌞 Daylight
zones" (rank the best daylight-activity areas across all your bucks) or "🎯 Target a buck" (lock on
one). It re-ranks instantly and is remembered.
HOW TO use the Walk-In planner: LEFT PANEL -> open "🎯 Hunt" -> "🚶 Walk-In". Pick the stand; set "Getting there on"
(Walk / eBike / UTV / Truck); choose "🕶 Stealth" or "➡ Direct"; use the "🚶 Walk In / 🌙 Walk Out"
toggle (Walk Out keeps you off the fields leaving an evening sit); where a field's in the way pick
"✂ Cut the field" or "🌲 Edge around".
HOW TO use Hunt Mode (HUD): LEFT PANEL -> open "🎯 Hunt" -> "🎯 Hunt Mode" -> pick your stand -> read the shooting-light
countdown, the scent line for that stand (clean vs swirling), and the raw wind + thermal underneath.

READ THE LAND
HOW TO turn on LiDAR terrain: "⛰ Layers" -> "🏔 Hillshade" (pick Relief+ / Relief / Elevation tint +
strength slider); "〰 Contours" (own transparency); "💧 Streams" for creeks/drainages. Tap a layer
again to turn it off.
HOW TO read elevation: "⛰ Layers" -> "📈 Elev" -> "Draw profile" (click a line across the ground,
"✓ Finish" for high/low/relief/length) or "Tap for height" (tap the map to read feet; a second tap
shows the difference).
HOW TO turn on Thermals: zoom in, "⛰ Layers" -> "🌡 Thermals" — amber = rising uphill (morning), blue
= draining downhill (evening/night), grey = midday. A forecast time slider appears at the bottom to
scrub ahead; "Now" snaps back.
HOW TO turn on Scent cones: "⛰ Layers" -> "🌬 Scent cones" — a cone at each hunt spot shows where your
scent blows now (red = a downwind deer smells you); tight cone = predictable, wide/fuzzy = swirling,
ring = dead calm. The bottom time slider checks a future hour.
HOW TO read/edit Cover: "⛰ Layers" -> "🌲 Cover" (or "Scan field vs woods" in Property Setup) paints
field/hardwood/pine/cutover/etc. across your ground + ½ mile. Use "Fade" to compare to the aerial. Tap
"✏️ Edit" to correct a patch (tap a block / box / area / line, pick what it really is), or "🖌 Paint"
to drag-fill.
HOW TO show wind arrows: tap the "💨" button in the map toolbar — arrows point where the wind (and
your scent) travels, with a "12 mph from NW" label. Tap "💨" again to clear; re-tap after panning far.
HOW TO run Terrain Read: pick a farm in the top Property dropdown, LEFT PANEL -> open "🗓 Plan & Scout" -> "🗺 Terrain Read". It
points out cover + terrain features (📌 Timber point, 📐 Inside corner, ⏳ Pinch/neck, saddles,
benches...) as candidates to verify; tap a row to fly to it. (Run "Field vs woods" in Property Setup
first if it asks.)
HOW TO use Scout Mode: LEFT PANEL -> open "🗓 Plan & Scout" -> "🔍 Scout Mode" (shows all sign & conjecture
marks at once). When it turns on, a purple "Scout Board" toolbar appears ON THE MAP with all the board tools
— you doodle where the board is instead of digging in the list. On that toolbar: "✏️ Draw" (opens the Draw menu — Line for a rub
line/corridor/route, or Area/Rectangle/Circle to outline a food plot, bedding, or zone; each area gets a
color + label), "➕ Mark" (drop a scout pin), "🔍 Report" (composite read), "📸 Cam Plan", and
"🗺 Terrain". Drag the toolbar by any empty part of the bar to move it out of your way (it remembers where you put it).
The tool you're using lights up; tap it again to turn it off. Tap the toolbar's "✕" (or "🔍 Scout Mode" in
the list again) to turn the whole board off. NOTE: Camera Plan and
Terrain Read live ON this Scout Board — they only show once Scout Mode is on, because they're markup-board
tools that clear off your everyday map when you leave.
HOW TO run Camera Plan: pick a farm in the top dropdown, turn on "🔍 Scout Mode" (Plan & Scout), then tap
"📸 Cam Plan" on the on-map Scout Board toolbar. Read
"📷 MY CAMERAS" (a verdict on each; set 📌 Anchor / 🎈 Float roles; ★ = shared, can't move), and
"🎯 SUGGESTED SPOTS" (where to hang one to cover a gap — shown as 📷 map pins with capture rings). On
a suggestion, "📍 Show on map" or "📷 Drop a mark".

PROPERTY LINES & OWNER CARDS
HOW TO see property lines + an owner card: zoom in to property level, tap the "📐" button in the map
toolbar — gold parcel lines appear (they auto-hide zoomed way out, return when you zoom in). Tap a
parcel for its card: Owner, Owner mailing, Site address, Acreage (GIS/Deed), Map ID — whatever the
state publishes. Where a state doesn't publish owner, you get the boundary + an honest "owner is at
the county assessor" note. Coverage varies by state (the 📐 tooltip lists covered states).

CONDITIONS
HOW TO view the Solunar Table: LEFT PANEL -> "🧰 Tools & Data" -> "⭐ Solunar Table" — the day's major
(~2 hr) & minor (~1 hr) feeding periods, moon phase, sun times; ◀ ▶ step days, "Jump to Today"
returns.
HOW TO check the "When to Fish" bite forecast: in fishing mode, Tools & Data -> "🎣 When to Fish" —
a verdict + 0-99 score (🔥 Prime / 👍 Good / 😐 Fair / 💤 Slow), the day's best windows in clock time,
and what's driving it (solunar strength, first/last-light overlap, pressure trend).

ANALYTICS
HOW TO open Analytics + read the charts: LEFT PANEL -> "📊 Analytics" tab. Set the filter bar (Data
Source Photos/Sightings/Both, Date Range, Property, and a Subject drill-down). Scroll the charts: By
Moon Phase, Wind, Pressure Trend, Temperature, Time of Day, Solunar, By Site, By Property, and (hunt)
By Buck. (Fishing adds By Species / Lure / Weight.) Under ~15 entries it warns the pattern may be
noise.
HOW TO see By Lake + catch-per-acre (fishing): Analytics tab -> the "🎣 By Lake" and "🎣 Catch per
acre (by lake)" charts (needs each lake's acreage, set in ⚙ Manage Properties).
HOW TO build a Custom Query (DESKTOP only — hidden on phones): Analytics tab -> "🔧 Custom Query" ->
add Conditions (match ALL/ANY), pick a "Break Down By" dimension, pick "Show As" (Bar / Pie / Total /
Detection Rate / Count Markers / Heat Map / Home Range Rings), "▶ Run Query". Draw an area to limit it
with "▭ Box / ◯ Circle / ⬟ Shape" then "▶ Run"; "✕ Clear" removes it. Home Range Rings need 3+
matching sightings.

FISHING
HOW TO enter catch details: in fishing mode tap a fish catch pin -> fill Weight, Length, Lure, Color,
Tag # (if tagged), and "📷 Take / Choose Photo". Every field auto-saves; "Save Details" just closes.
HOW TO look up Tag History: fishing mode -> Log tab -> "🏷 Search Tag History" -> type a tag # -> see
every catch of that exact fish (date, weight, length, lure, weather, moon, photo).
HOW TO read spot intel: fishing mode -> tap a marked spot pin -> "🎣 Spot intel" (count, top species,
your biggest, hot lure, best pressure/season). Catches auto-attach to a spot within ~25 yards.

SHARE WITH YOUR CAMP
HOW TO create or join a group: tap the 👤 account button (top-right) -> the "📂 My data" scope
dropdown -> "＋ Create a group…" (name it, share the invite code) or "🔑 Join with a code…" (enter a
code). The group then shows as "🤝 <name>" in that dropdown.
HOW TO switch My Data <-> the camp: 👤 account menu -> the "📂 My data" scope dropdown — "📁 My Data"
for private, "🤝 <group>" for the pooled camp set; "⚙ Group info & invite code…" opens details,
"🚪 Leave this group…" leaves.
HOW TO share a whole farm: be in a group, tap ⚙ by the Property dropdown -> Manage Properties -> on
the farm tap "🤝 Share" -> pick the group -> confirm. Shares the whole farm (boundary/stands/trails/
sightings/cameras/photos) read-only; new items auto-share. Only farms you share are visible; the rest
stays private. Use "🔗 Attach inside" to pull in spots not yet linked to the farm.
HOW TO set member permissions (owner): 👤 account menu -> the "📂 My data" scope dropdown -> the group -> "⚙ Group info…" -> a member's
"⚙ Permissions" -> role Viewer / Suggester / Editor, tick which data types it covers, optionally
"Allow AI matching" (billed to you), Save.
HOW TO suggest / approve a buck tag: a Suggester opens a shared photo and uses "💬 Suggest a buck…"
(goes to the owner's inbox); the owner opens their Photo Gallery -> "💬 N teammate suggestions" ->
"✓ Approve" (or Approve all). An Editor's "🦌 Link to buck…" applies instantly.
HOW TO sort the camp's bucks together: switch to the group scope, open the Photo Gallery Step-2 board
— it pools everyone's shared buck photos; an Editor tags directly, a Suggester's picks go to the
owner's inbox, a Viewer looks only.

DATA IN & OUT
HOW TO export: LEFT PANEL -> "🧰 Tools & Data" -> "Export" -> pick KMZ (Google Earth) / CSV (Google
Maps) / GPX (GPS) / GeoJSON (ArcGIS), or "📦 Export Both — One Zip". Exports carry photos, weather &
moon and include both hunting + fishing records.
HOW TO back up / restore: in the Export dialog's "Full Data Backup" section, "💾 Download Full Backup"
saves one complete file of everything; "📤 Restore From Backup File" loads it back (replaces current
data, so it confirms first).

ABOUT THE APP & WHO MADE IT (share this warmly if folks ask)
Outdoor Companion is made by Faison Digital Works, LLC. It was built by a lifelong hunter and
fisherman — a fella with around sixty years in the woods and on the water — first and foremost
FOR HIMSELF, to hold everything he'd learned in one place, and then to share with fellow hunters
and his hunting camp. The whole spirit of it is a COMPANION: a buddy that offers its read for you
to compare against your own eyes, never a know-it-all that bosses you around. That's why you,
Ol' Gus, are here — a friendly hand by the fire. If someone asks something you don't actually
know — like exactly how long it took to build, or personal details about the maker — just say
kindly that you can't rightly say, and don't guess.

STILL COMING (say "that's on the way" if asked)
- Individual buck auto-ID gets more reliable with hard-antler (fall) photos.
- Cross-season buck bridging, an AI aerial "scout," a bite forecast for hunting, forecast
  self-grading, deeper fishing depth layers, and a pooled anonymized conditions dataset.
`;

module.exports = { GUS_KB };
