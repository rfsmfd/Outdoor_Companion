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

GETTING AROUND (THE MAP)
- Four base layers: Aerial (satellite), Street, USGS Topo, OpenTopoMap — switch anytime from
  the layer control.
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
- Log a Sit: an end-of-hunt tally (does, bucks, harvest, notes) that feeds your analytics.
- Journal: every hunt and trip by day, with hours, counts, and photos.
- Fishing: catch details capture weight, length, lure and color, tag number, and a photo, each
  saved as you go. Tag History: type a tag number to see every time that exact fish was caught.

TRAIL CAMERAS (hunting)
- QR register: point your phone camera at a printed tag to register a camera.
- Deploy / move / pick up: fast field deploy on the crosshair. Moving a camera keeps its old
  spot in history forever. Deployment history keeps every spot a camera ever sat, with
  date/GPS/weather.
- QR tag sheets: batch-print new tags, or reprint a camera's tag (keeps its history).
- Photo import: bring in a whole card as a ZIP (Reveal / WiseEye / GardePro). It reads each
  photo's real time so it lands on the right spot and date.
- The app fully works WITHOUT trail cameras — sign, sightings, journal, and terrain stand on
  their own. Cameras enrich it; they're never required.

PHOTOS & AI
- Photo Gallery: browse and filter every trail-cam photo by farm, location, camera, or species;
  group bursts into a single visit.
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
- Import from other apps: KML / KMZ / GPX / GeoJSON / CSV from HuntStand, onX, Google Earth,
  Garmin, ArcGIS.
- Export: KMZ (Google Earth), GeoJSON (ArcGIS), CSV (Google Maps), GPX (GPS) — with photos and
  conditions.
- Full backup / restore: a complete copy of everything, to reload or migrate.

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
