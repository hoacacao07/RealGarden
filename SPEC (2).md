# NativeScape FL - Demo Build Spec for Claude Code (v3)

You are extending a **hackathon demo** that already works. Phases 0 to 8 are done and committed. This version adds Phases 10 to 12: soil, the Garden Starter flow with edible plants, Balcony mode for people with little or no yard, and real-time weather alerts that create tasks immediately. Read this whole file, check what already exists in the repo, then build the new phases in order. After each phase, run it, commit, and print a short summary of what works.

The app has a real database and a public URL, but nobody will maintain it after demo day. Optimize for a demo that looks great, works when judges open the link, and is easy to explain.

---

## 1. What the product does

A Floridian starts from "I want a garden" and the site gives them everything.

1. **Start** with goals (flowers, food, butterflies, low-care), time, budget and space.
2. **Site and soil** from their location, the USDA soil survey and quick home tests. People with no yard pick **Balcony mode** instead, where containers, sun from the balcony's direction, weight and wind matter more than soil.
3. **Design** a garden in a 2D sandbox. Native plants first for the landscape, plus an edible zone (tomatoes, peppers, herbs...).
4. **Prepare** with a soil decision (use existing, amend, or raised bed), a shopping list with quantities, and a task calendar.
5. **Preview** colors by month, growth by year, one plant at a time in 3D.
6. **Predict** watering, frost, storms, disease nearby, bloom, fruit and harvest dates.
7. **Act** on real-time alerts. When NWS issues a storm, flood, heavy rain or freeze alert, the site pushes a warning and a task list right away.

Demo personas
- **Maria**, a first-time homeowner in Tampa about 2 miles from the bay. She wants a butterfly garden and a small tomato bed.
- **Linh**, a USF student in a 4th-floor apartment with a west-facing balcony (10 × 5 ft). She wants herbs, cherry tomatoes and something that brings butterflies.

---

## 2. Principles (follow these over anything else)

- **One app, one deploy.** A single Next.js app on Vercel with Supabase (Postgres, Storage, Realtime). No separate backend.
- **No login.** Each garden has a shareable URL (`/garden/<id>`).
- **Demo mode.** `DEMO_MODE=true` serves saved responses for Pl@ntNet, Gemini, weather, soil and alerts. The real-time alert path must also work live when `DEMO_MODE=false`.
- **One background job only.** A single alert checker runs every 5 minutes (Section 7). Everything else runs on page load, on Refresh, or on scenario replay.
- **Rules decide, AI explains.** Tasks, thresholds and safety steps come from fixed rules in code. Gemini only rewrites them in plain language. If Gemini fails, use the rule text.
- **Safety first in storm tasks.** Garden tasks are for before the storm only. Every severe alert shows "Follow official instructions from your county. Don't go outside during the storm." Never tell anyone to stay for their garden.
- **Sample data is labeled.** Anything not real shows a "sample data" tag.
- **Tests only for the math and rules.** Vitest for `lib/engine/*`.
- **Not in scope.** Auth, accounts, SMS, hardware sensors, model training, BioCLIP, Prithvi, Earth Engine at runtime, payments, store integrations.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Database | Supabase Postgres via Prisma |
| Storage | Supabase Storage bucket `checkins` |
| Live updates | Supabase Realtime on the `alerts` and `tasks` tables |
| Push notifications | Web Push (service worker + VAPID keys, `web-push` npm) |
| Alert checker trigger | External free scheduler (cron-job.org or a GitHub Actions schedule) calling `/api/cron/check-alerts` every 5 minutes with `CRON_SECRET`. Vercel Hobby cron only runs once a day, so it is not used for this |
| Client state | Zustand for UI only |
| 2D canvas | `react-konva` |
| 3D Plant Inspector | `@react-three/fiber` + `@react-three/drei`, loaded on demand |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |
| Weather | Open-Meteo (daily + hourly forecast, ET0, archive) |
| Weather alerts | NWS `api.weather.gov/alerts/active?point=lat,lon` (no key, send `User-Agent`) |
| Tropical storms | NHC `https://www.nhc.noaa.gov/CurrentStorms.json` (empty array when no storms) |
| Soil | USDA Soil Data Access `https://sdmdataaccess.sc.egov.usda.gov/tabular/post.rest` |
| Plant ID / diagnosis | Pl@ntNet API, Gemini (model from `GEMINI_MODEL`) |
| Tests | Vitest |
| Hosting | Vercel + Supabase |

`.env.example`
```
DEMO_MODE=true
DATABASE_URL=
DIRECT_URL=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEMO_RESET_TOKEN=
CRON_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:team-email@example.com
NWS_USER_AGENT=NativeScapeFL demo (team-email@example.com)
PLANTNET_API_KEY=
PLANTNET_PROJECT=all
GEMINI_API_KEY=
GEMINI_MODEL=
```

---

## 4. Status of earlier phases (already built, do not rebuild)

| Phase | Scope | Status |
|---|---|---|
| 0 to 1 | App setup, database, plant data, catalog, engine tests | Done |
| 2 | Design studio, native-first suggestions, canvas, save/load | Done |
| 3 to 4 | Weather + 4 scenarios, watering plan, frost and storm alerts, dashboard | Done |
| 5 | Photo check-in, identify + diagnose, disease map | Done |
| 6 | Colors tab, bloom prediction, beauty timeline, bed fill, Coming up | Done |
| 7 | 3D Plant Inspector | Done |
| 8 | Presenter page, landing, DEMO_SCRIPT.md, run-through | Done |

Reuse existing engines (recommend, growth, water, frost, storm, phenology, beauty, color, spacing, disease, impact) and extend them. Don't rename existing routes.

---

## 5. Phase 10 - Soil

### 5.1 Data
Add to `Site`: `soil_source` (survey | user | lab | unknown), `survey_name`, `component`, `drainage`, `sand_pct`, `clay_pct`, `om_pct`, `ph`, `awc` (cm/cm), `is_fill` (bool, user answer). Add `ph_range: [min, max]` to every plant (`verified: false`).

### 5.2 Soil client (`lib/clients/soil.ts`)
POST to Soil Data Access with `{"query": <sql>, "format": "JSON+COLUMNNAME"}`, 6 s timeout.
```sql
SELECT TOP 1 mu.muname, c.compname, c.drainagecl, c.hydgrp,
       ch.sandtotal_r, ch.claytotal_r, ch.om_r, ch.ph1to1h2o_r, ch.awc_r
FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(<lon> <lat>)') AS k
JOIN mapunit mu   ON mu.mukey = k.mukey
JOIN component c  ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
JOIN chorizon ch  ON ch.cokey = c.cokey AND ch.hzdept_r = 0
ORDER BY c.comppct_r DESC
```
Note `point(lon lat)` order. Run it once live for Maria's point, then save the result as a fixture. If the map unit name contains "Urban land" or the values are null, return `soil_source: "unknown"`.

### 5.3 UI
- Wizard step "Your soil". Survey result card with Edit, a question "Was this yard built on fill dirt? (new construction)", and three how-to cards (jar test for texture, percolation test for drainage, pH kit). Optional form to enter UF/IFAS Extension Soil Testing Laboratory results (pH, organic matter).
- Dashboard Soil card showing type, pH, drainage, organic matter and a source badge.

### 5.4 Engine changes
- Water engine. If `awc` exists, TAW = 1000·awc·Zr (mm, Zr in m). Otherwise keep the soil-type table.
- Recommender. Hard filter if site pH is outside a plant's `ph_range` by more than 0.5. Within 0.5 of the edge, lower the score by 0.1 and add a reason.
- Tips. Low organic matter means a mulch tip. South Florida limestone (pH > 7.5) lowers acid-loving plants.

Tests. TAW from awc, pH filter.

---

## 6. Phase 11 - Garden Starter, edibles, soil plan, shopping list, task calendar

### 6.1 Starter flow `/start`
1. Goals (multi-select: flowers, food, butterflies, low-care).
2. Hours per week (1, 2 to 4, 5+), budget (optional number), space (yard, raised bed, containers, balcony).
3. Location and sun (reuse).
4. Soil (Phase 10).
5. Generated plan. A landscape zone with native picks and, if "food" was chosen, an edible zone. Opens in the Design studio.

### 6.2 Edible plants (`data/edibles.json`, seeded with `origin: "edible"`)
About 10 crops (tomato, pepper, eggplant, okra, lettuce, kale, basil, sweet potato, strawberry, bush beans).
```json
{
  "id": "tomato",
  "common_name": "Tomato",
  "origin": "edible",
  "planting_windows": {"north": [[2,4],[8,8]], "central": [[1,3],[8,9]], "south": [[8,3]]},
  "days_to_harvest": [60, 85],
  "spacing_in": 18,
  "kc": {"ini": 0.6, "mid": 1.15, "end": 0.8, "stage_days": [30, 40, 40, 25]},
  "cold_hardy_f": 33,
  "heavy_rain_sensitive": true,
  "needs_staking": true,
  "ph_range": [5.8, 6.8],
  "common_issues": ["early_blight", "late_blight", "blossom_end_rot", "hornworm"],
  "verified": false,
  "source_url": "https://edis.ifas.ufl.edu/publication/VH021"
}
```
The planting windows above are placeholders. The data person fills real values from the UF/IFAS Florida Vegetable Gardening Guide (Table 1). Kc values are FAO-56 style estimates to verify.

Rules
- Edibles never count toward native %. The native meter covers the landscape zone only.
- Invasive plants stay blocked everywhere.
- Suggest 2 or 3 native wildflowers next to any edible bed for pollinators.

### 6.3 Soil plan engine (`lib/engine/soilplan.ts`)
- **Native zone.** Use existing soil, mulch 2 to 3 in, no fertilizer by default. If `is_fill` is true or the soil is compacted, suggest loosening and adding organic matter.
- **Edible zone.**
  - pH 5.5 to 7.0 and not fill → in-ground with 1 to 4 in of compost worked in.
  - pH outside that range, fill dirt, `soil_source` unknown with very sandy soil, or South Florida limestone → raised bed.
  - Containers chosen → potting mix.
- Return the decision and 1 or 2 reasons.

### 6.4 Shopping list engine (`lib/engine/shopping.ts`)
- Plants by species and count (from placements).
- Raised bed fill V_ft3 = L·W·D_in/12, show cubic yards (V/27) and bags (ceil(V / bag_size), bag size editable, default 1.5 ft3). Mix option 1:1:1 compost, peat moss, vermiculite, or bagged raised-bed soil.
- Compost for in-ground edible beds = area × depth.
- Mulch = landscape area × 3 in.
- Fertilizer only for edibles (balanced slow-release, mixed into the top 6 in at planting). Follow the label, never give doses beyond "follow the product label and UF/IFAS guidance".
- Bed materials (boards or blocks) as an optional line.
- Prices. Optional, user-editable unit prices. Never invent store prices or links.
- Export CSV and a printable page.

### 6.5 Task calendar (`lib/engine/tasks.ts`)
Generates dated tasks for the next 12 months.
- Prep tasks (soil test, build bed, fill, mulch) before the first planting date.
- Planting dates from region windows. Back-calculate from a target harvest date: plant_date = harvest_date − days_to_harvest.
- Fertilizer tasks for edibles only, moved out of the local restricted window. Store rules in `data/fertilizer_rules.json` per city/county with `restricted: [[6,1],[9,30]]`, a `source_url`, and a note. Seed Tampa, Hillsborough, Pinellas, Manatee, Sarasota. Always show "Check your local fertilizer ordinance".
- Harvest windows from `days_to_harvest`.
- Tasks have `kind` (prep, plant, water, fertilize, harvest, protect, check), `due_at`, `priority` (normal, urgent), `source` (calendar, alert, checkin), `done`.

### 6.6 UI
- Design studio. Edible zone as a raised-bed rectangle, native meter labeled "Landscape native %".
- New page `/garden/[id]/plan` with tabs Soil plan, Shopping list, Calendar.
- Coming up card includes harvest predictions. Frost alerts apply to edibles. Water engine uses Kc by growth stage for edibles.

Tests. Volume and bags, back-calculated planting date, stage Kc, fertilizer task moved out of the restricted window.

---

## 6B. Phase 11.5 - Balcony mode (little or no yard)

Chosen in `/start` when space = balcony, patio or containers. Everything else in the app (alerts, check-ins, Coming up, calendar) keeps working; the garden simply has `kind: "balcony"`.

### 6B.1 Balcony profile (wizard steps replacing the soil step)
- Facing direction (N, NE, E, SE, S, SW, W, NW).
- Floor level (ground, 2 to 3, 4 to 9, 10+). Higher floors mean more wind.
- Floor size (L × W ft) and railing length.
- Overhang above (none, or depth in ft and height above the floor).
- Distance to the coast (reuse), for salt spray.
- Building rules checkboxes ("pots allowed on the railing", "hanging baskets allowed", "no water dripping onto lower balconies"). Default all unknown and remind the user to check with their HOA or landlord.

Store on `Site`: `kind`, `facing_deg`, `floor_level`, `balcony_l_ft`, `balcony_w_ft`, `railing_ft`, `overhang_depth_ft`, `overhang_height_ft`, `rules Json`.

### 6B.2 Sun hours engine (`lib/engine/balconySun.ts`)
Use `suncalc` for sun azimuth A and altitude h every 15 minutes on the 15th of each month at the site's lat/lon.
A pot at distance d from the balcony edge, with the overhang edge a height H above the top of the pot, gets direct sun when
- the sun is in front of the balcony, |A − facing| < 90°, and
- the sun is low enough to get under the overhang, tan(h) < H / d (no overhang means always true when h > 0), and
- h > 5° (ignore the sun right at the horizon, where buildings and trees usually block it).

Direct sun hours per month = count of passing 15-minute steps / 4. Map to the plant light categories: ≥ 6 h full sun, 3 to 6 h partial shade, < 3 h shade. Show a 12-month strip ("West balcony: 4 to 5 h of hot afternoon sun most of the year"). Tests with hand-checked cases (south vs north facing, deep overhang in June).

### 6B.3 Container plants
Add to plants and edibles: `container_ok` (bool), `min_container_gal`, `dwarf_variety` (text, optional), `trellis` (bool), `wind_tolerance` (reuse).
Seed at least 8 container-friendly natives (e.g. tropical sage, blanket flower, beach sunflower, muhly grass, coontie, wild petunia, coral honeysuckle on a trellis, dwarf firebush) and the edibles that work in pots (cherry tomato, pepper, basil, other herbs, lettuce, strawberry). All values `verified: false`.

Recommender in balcony mode
- Light from the sun hours engine, not the wizard's sun question.
- Hard filter `container_ok = false`.
- Floor 4+ lowers plants with low wind tolerance; floor 10+ filters them out.
- Coastal (< 1 mi) keeps the existing salt filter.
- Prefer a mix of 1 or 2 pollinator natives with the edibles ("a pot of tropical sage next to the tomatoes brings pollinators").

### 6B.4 Container water model (`lib/engine/containerWater.ts`)
Containers dry much faster than the ground and get no help from deeper soil.
- Available water in a pot, AW = V_pot × θ_avail, where V_pot is in liters and θ_avail is the potting mix's available water fraction (config default, labeled estimate).
- Daily use = Kc × ET0 × A_canopy, with A_canopy the plant's canopy area in m², and ET0 multiplied by 1.2 for west or south walls on hot afternoons (config, labeled estimate).
- Rain only counts if the pot is outside the overhang.
- Recommend watering when the pot falls below 50% of AW. Typical output is "water daily in summer, every 2 to 3 days in winter", shown per pot.
- Always remind "use saucers so water doesn't drip onto balconies below" when that rule is checked.

### 6B.5 Weight check (`lib/engine/weight.ts`)
Wet potting mix is heavy. Total estimated load = Σ (V_pot × wet_mix_density) + pot weights + water in saucers. `wet_mix_density` is a config constant labeled "estimate, verify". Show the total in lb and kg and a gentle note "Ask your building manager about balcony weight limits" when the total passes a configurable threshold. Never claim a balcony is safe.

### 6B.6 Balcony canvas
The Design studio shows the balcony as a small rectangle with a railing edge, a compass arrow for facing, and the overhang shaded. Pots are circles sized by container diameter; railing planters and hanging baskets snap to the railing. The month slider also shades where direct sun falls at 3 PM.

### 6B.7 Shopping list in balcony mode
Containers (count by size in gallons), potting mix bags (never garden soil), saucers, trellis, railing planters, slow-release fertilizer for edibles only, optional self-watering pots. Same rules as 6.4 (no invented prices).

### 6B.8 Alerts in balcony mode (extends Section 7.3)
Balcony items can become dangerous in high wind. For Tropical Storm or Hurricane Watch/Warning, High Wind, and Severe Thunderstorm alerts, the first task is always "Bring every pot, basket and trellis inside before the wind starts", ahead of all other tasks, with the safety line. Heavy rain alerts add "empty saucers after the rain to stop mosquitoes".

Tests. Sun hours cases, container water days-between-watering, weight total, balcony alert task order.

---

## 7. Phase 12 - Real-time weather alerts and instant tasks

### 7.1 Sources
- **NWS active alerts** for each garden point, `GET https://api.weather.gov/alerts/active?point={lat},{lon}`. Use `properties.id`, `event`, `severity`, `urgency`, `certainty`, `onset`, `ends`, `headline`, `instruction`.
- **Open-Meteo hourly forecast** (precipitation, gusts, temperature) for heavy rain and wind that may not have an NWS alert yet.
- **NHC CurrentStorms.json** for active tropical storms. Compute distance from each storm center to the garden with the haversine formula. Show a "Tropical storm watch" banner when a storm is within 500 km, as context only (NWS alerts remain the trigger for urgent tasks).

### 7.2 Alert checker `/api/cron/check-alerts`
- Protected by `Authorization: Bearer <CRON_SECRET>`.
- Group gardens by rounded point (2 decimals) to limit calls. NWS calls once per point, NHC once per run.
- For each new or updated alert (dedupe by NWS `id` + `sent`), insert into `alerts`, generate tasks (7.3), send Web Push to subscribers of that garden.
- Cancelled or expired alerts are marked inactive and their open tasks closed with "Alert ended".
- Also callable from the dashboard (Refresh) and every page load with a 60 s server cache.

### 7.3 Alert → task rules (`lib/engine/alertTasks.ts`)
Deterministic rules keyed by NWS `event`. Each rule returns tasks with deadlines relative to `onset` (or now if missing), priority, and which plants they apply to.

| Trigger | Priority | Tasks (before onset) |
|---|---|---|
| Hurricane Watch / Tropical Storm Watch | urgent | Stake young trees, move pots and hanging baskets inside, harvest ripe vegetables, clear drains and gutters, pause irrigation, don't fertilize or prune now |
| Hurricane Warning / Tropical Storm Warning | urgent | Same, due within hours, plus "secure loose garden items that could fly". Top banner with the safety line |
| Flood Warning / Flash Flood Warning / Flood Watch | urgent | Pause irrigation, move containers to higher ground, protect low beds, don't fertilize (runoff), check after for standing water |
| Heavy rain (no NWS alert): forecast ≥ 50 mm in the next 24 h from Open-Meteo hourly | normal | Pause irrigation, cover seedlings, postpone any fertilizer task, check drainage after |
| Severe Thunderstorm Warning | urgent | Bring in pots and light items, nothing else outdoors |
| Any wind, tropical or severe storm alert on a balcony garden | urgent | First task always "Bring every pot, basket and trellis inside" (Section 6B.8) |
| High Wind Warning / Wind Advisory | normal | Stake tall plants, move pots |
| Freeze Warning / Frost Advisory / Hard Freeze Warning | urgent | Existing frost engine tasks (water soil in the afternoon, cover tender plants, remove covers in the morning) |
| Heat Advisory / Excessive Heat Warning | normal | Water edibles early morning, shade seedlings |

After the alert ends, add follow-up tasks (check for damage, standing water, broken branches, photo check-in).

Also
- Pause all "water" recommendations while a rain, flood or tropical alert is active.
- Move any fertilizer task falling inside an active alert or within 48 h of heavy rain.
- Every urgent task list starts with the safety line.
- Gemini may rewrite task text for clarity but cannot add, remove or reorder tasks.

### 7.4 Delivery
- **In-app.** Dashboard subscribes to Supabase Realtime on `alerts` and `tasks` for its garden. A new alert shows a red banner at the top of every page and the task list opens.
- **Web Push.** A service worker plus a "Turn on alerts" button that stores the subscription in `push_subscriptions (garden_id, endpoint, keys, created_at)`. Push payload = alert headline + first task + link to the garden. On iPhone, push only works when the site is added to the Home Screen, so show that hint.
- **Alerts page** `/garden/[id]/alerts` with active and past alerts, source ("National Weather Service", link to the alert), issued time, and the task checklist.

### 7.5 Demo support
- Presenter page gets "Simulate NWS alert" with choices (Hurricane Warning, Flash Flood Warning, Freeze Warning, Heavy rain). It inserts a synthetic alert marked `is_sample: true` and runs the same pipeline, so judges see the banner and the push arrive live.
- Saved fixtures for each alert type in `data/fixtures/nws/`.

### 7.6 Schema additions
- `Alert` id, garden_id, source (nws | openmeteo | nhc | sample), external_id, event, severity, urgency, headline, instruction, onset, ends, active, is_sample, raw Json, created_at.
- `Task` id, garden_id, alert_id?, kind, title, detail, due_at, priority, source, done, created_at.
- `PushSubscription` id, garden_id, endpoint (unique), p256dh, auth, created_at.

Tests. Each rule in the table, dedupe, heavy-rain threshold, fertilizer task moved by an alert, tasks closed when an alert ends.

---

## 8. Pages after this version

| Route | What it shows |
|---|---|
| `/` | Landing with a "Start my garden" button to `/start` |
| `/start` | Garden Starter flow |
| `/design` | Design studio with landscape and edible zones, or the balcony canvas |
| `/garden/[id]` | Dashboard with alert banner, tasks due today, Coming up, soil card, watering |
| `/garden/[id]/plan` | Soil plan, shopping list, calendar |
| `/garden/[id]/alerts` | Live and past alerts with task checklists |
| `/garden/[id]/checkin` | Photo check-in |
| `/map` | Disease reports |
| `/plants`, `/plants/[id]` | Catalog, natives and edibles |
| `/demo` | Presenter controls including Simulate NWS alert |

Footer on every page says "Predictions are estimates. Confirm plant problems with your local UF/IFAS Extension office. Weather alerts from the National Weather Service. Follow official instructions in an emergency."

---

## 9. Build order

| Phase | Scope |
|---|---|
| 10 | Soil client + fixture, schema, wizard soil step, soil card, AWC in water engine, pH filter |
| 11 | `/start`, edibles data and seed, soil plan, shopping list, task calendar, fertilizer rules, plan page, edible zone, stage Kc |
| 11.5 | Balcony mode (Section 6B): balcony profile, sun hours, container picks, container water model, weight and wind checks, balcony canvas, Linh seed |
| 12 | Alert sources, cron route, alert → task rules, Realtime banner, Web Push, alerts page, Simulate alert on presenter page |
| 13 | Update DEMO_SCRIPT.md, full run-through on the live URL with the external scheduler on |

Commit after each phase. If a phase runs long, cut scope inside it rather than skip Phase 13.

## 10. Demo script additions

1. Start at `/start`, choose butterflies + food, see the plan with a native bed and a tomato bed.
2. Show the soil card from the USDA survey and the raised-bed decision for tomatoes.
3. Open the shopping list (bags of soil, mulch, plant counts) and the calendar (planting date back-calculated from a target harvest, fertilizer moved out of June to September).
4. On the presenter page click "Simulate NWS alert → Hurricane Warning". The banner and push appear on the dashboard, with the safety line and pre-storm tasks.
5. Switch to Linh's balcony. Show the west-facing sun strip, container picks (cherry tomato, basil, tropical sage), "water daily in summer", the weight estimate, and the same hurricane alert now starting with "Bring every pot inside".

## 11. When unsure

Pick the simplest option that keeps the demo path working, note it in `README.md` under "Demo shortcuts", and keep going. Ask the team only for keys, credentials, demo photos, edible planting dates, container plant values, or a decision that changes the demo story.
