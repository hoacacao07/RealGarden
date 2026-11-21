# NativeScape FL - Demo Build Spec for Claude Code

You are building a **hackathon demo** from an empty folder. It must have a real database and be deployed at a public URL, but nobody will maintain it after demo day. Optimize for a demo that looks great, works reliably when judges open the link, and is easy to explain. Read this whole file first, then build phase by phase (Section 9). After each phase, run it, commit, and print a short summary of what works.

---

## 1. What the demo shows

NativeScape FL helps Florida residents plan a low-maintenance garden of Florida native plants, preview how it will look, and get early warnings before problems happen.

Demo loop
1. **Design** a garden in a 2D sandbox. Native plants are always suggested first.
2. **Preview** colors by month, growth by year, and one plant at a time in 3D.
3. **Predict** watering, frost and storm risk, disease spread nearby, and bloom dates.
4. **Act** on short, plant-specific instructions written by Gemini.

Persona for the demo is **Maria**, a first-time homeowner in Tampa about 2 miles from the bay, building a butterfly garden.

---

## 2. Demo-only principles (follow these over anything else)

- **One app, one deploy.** A single Next.js app deployed to Vercel, with a hosted Postgres database on Supabase. `npm install && npm run dev` runs it locally against the same database.
- **Real database, minimal setup.** Plants, gardens, placements, check-ins and disease reports live in Postgres. Photos go to Supabase Storage. Schema and seed come from Prisma, so `npm run db:setup` creates everything from scratch.
- **No login.** Each garden has a shareable URL (`/garden/<id>`). Anyone with the link can view and edit it. This is fine for a demo, say so in the README.
- **No background jobs.** Predictions run when a page loads, when the user clicks "Refresh", or when a scenario is replayed.
- **Offline-first.** Every external API has a saved response in `data/fixtures/`. `DEMO_MODE=true` (default) uses fixtures only, so AI and weather work with no keys. The database still needs a network connection, so also run once locally before the event. `DEMO_MODE=false` calls live APIs where keys exist and falls back to fixtures on any error.
- **Scripted, not scheduled.** There is no background refresh. Predictions run when the page loads, when the user clicks "Refresh", or when a scenario is replayed.
- **Sample data is labeled.** Seeded disease reports and anything not real show a small "sample data" tag.
- **Looks matter more than edge cases.** Spend time on polish and the demo path. Skip admin screens, settings, error pages beyond a friendly fallback, and anything Maria's story doesn't touch.
- **Tests only for the math.** A few Vitest tests for the engines in Section 5, nothing else.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Database | Supabase Postgres (free tier) via Prisma ORM |
| File storage | Supabase Storage bucket `checkins` for photos |
| Client state | Zustand for UI state only (editing session, sliders). Saved data always goes to the database |
| 2D garden canvas | `react-konva` |
| 3D Plant Inspector | `@react-three/fiber` + `@react-three/drei`, loaded with `next/dynamic` (`ssr: false`) |
| Maps | Leaflet via `react-leaflet`, OpenStreetMap tiles |
| Charts | Recharts |
| Server calls | Next.js route handlers in `app/api/*` (keeps API keys off the browser) |
| Weather + ET0 | Open-Meteo forecast and archive APIs (no key) |
| Weather alerts | NWS `api.weather.gov` (no key, send `User-Agent` from `NWS_USER_AGENT`) |
| Plant ID | Pl@ntNet API (`PLANTNET_API_KEY`) |
| Diagnosis + action text | Gemini (`GEMINI_API_KEY`, model name from `GEMINI_MODEL`; check current Gemini docs for a valid multimodal model and use structured JSON output) |
| Tests | Vitest for `lib/engine/*` only |
| Hosting | Vercel (app) + Supabase (database, storage). Deploy in Phase 0 and keep it deployed every phase. |

**Not in scope** (do not build) are auth, user accounts, roles, background schedulers, data backups, SMS or push notifications, hardware sensors, model training, BioCLIP, Prithvi, and admin tools.

---

## 4. Repo layout

```
nativescape-fl/
├── SPEC.md
├── README.md                 # how to run, how to present, known limits
├── .env.example
├── data/
│   ├── plants.json           # 35 to 40 plants, seeded into the DB
│   ├── demo/maria.json       # Maria's site, garden, placements, seeded into the DB
│   ├── demo/reports.json     # sample disease reports near Tampa, seeded into the DB
│   ├── scenarios/            # cached weather for replay
│   │   ├── cold_snap.json
│   │   ├── hurricane.json
│   │   ├── rainy_week.json
│   │   └── normal_week.json
│   ├── fixtures/             # saved responses: plantnet, gemini, nws
│   └── ndvi/usf-garden.geojson   # optional, precomputed offline
├── prisma/
│   ├── schema.prisma
│   └── seed.ts               # loads plants.json, Maria, sample reports (idempotent upserts)
├── scripts/
│   └── fetch-scenarios.ts    # one-time script that pulls Open-Meteo archive data into data/scenarios
├── app/
│   ├── page.tsx              # landing
│   ├── design/page.tsx       # wizard + recommender + canvas + colors
│   ├── garden/[id]/page.tsx  # dashboard (shareable link)
│   ├── garden/[id]/checkin/page.tsx  # photo check-in
│   ├── map/page.tsx          # sample disease map
│   ├── plants/page.tsx       # catalog
│   ├── plants/[id]/page.tsx
│   ├── demo/page.tsx         # presenter controls
│   └── api/
│       ├── gardens/route.ts          # create garden
│       ├── gardens/[id]/route.ts     # read / update garden, placements, zones
│       ├── checkins/route.ts         # upload photo, identify, diagnose, save
│       ├── reports/route.ts          # disease reports for the map
│       ├── demo/reset/route.ts       # re-seed Maria (presenter only)
│       ├── weather/route.ts
│       ├── alerts/route.ts
│       ├── identify/route.ts
│       └── diagnose/route.ts
├── components/
└── lib/
    ├── engine/               # pure functions, tested
    │   ├── recommend.ts
    │   ├── growth.ts
    │   ├── water.ts
    │   ├── frost.ts
    │   ├── storm.ts
    │   ├── phenology.ts
    │   ├── beauty.ts
    │   ├── color.ts
    │   ├── spacing.ts
    │   ├── disease.ts
    │   └── impact.ts
    ├── clients/              # openmeteo, nws, plantnet, gemini (each with fixture fallback)
    ├── db.ts                 # Prisma client singleton
    ├── supabase.ts           # storage client (server only)
    ├── store.ts              # UI state
    └── types.ts
```

`.env.example`
```
DEMO_MODE=true
DATABASE_URL=            # Supabase pooled connection (port 6543, ?pgbouncer=true)
DIRECT_URL=              # Supabase direct connection (port 5432), used by Prisma migrate
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # server only, never sent to the browser
DEMO_RESET_TOKEN=        # protects /api/demo/reset
NWS_USER_AGENT=NativeScapeFL demo (team-email@example.com)
PLANTNET_API_KEY=
PLANTNET_PROJECT=all
GEMINI_API_KEY=
GEMINI_MODEL=
```

---

## 5. Data and engines

### 5.1 Plant record (`data/plants.json`)

```json
{
  "id": "hamelia_patens",
  "common_name": "Firebush",
  "scientific_name": "Hamelia patens",
  "origin": "native",
  "invasive_status": "none",
  "native_alternatives": [],
  "category": "shrub",
  "form": "mounding",
  "regions": ["central", "south"],
  "light": ["full_sun", "partial_shade"],
  "salt_tolerance": "medium",
  "water_need": "low",
  "kc": 0.5,
  "root_depth_in": 18,
  "cold_hardy_f": 32,
  "wind_tolerance": "medium",
  "mature_height_ft": [6, 12],
  "mature_spread_ft": [5, 8],
  "planting_height_ft": 1.5,
  "growth_rate": "fast",
  "spacing_ft": 4,
  "flower_colors": [{"name": "red-orange", "hex": "#E2512B"}],
  "fruit_colors": [{"name": "black", "hex": "#2B2B2B"}],
  "foliage_color": "#4F7A3A",
  "bloom_months": [4,5,6,7,8,9,10,11],
  "fruit_months": [7,8,9,10,11],
  "bloom_trigger": "season",
  "gdd_base_f": 50,
  "bloom_gdd": null,
  "years_to_first_bloom": 1,
  "bud_to_bloom_days": [7, 14],
  "bloom_to_fruit_days": [30, 60],
  "dioecious": false,
  "wildlife_value": ["butterflies", "hummingbirds", "birds"],
  "host_plant_for": [],
  "garden_themes": ["wildlife"],
  "common_issues": ["cold_damage", "mites"],
  "verified": false,
  "source_urls": []
}
```

- 30 natives covering every category, at least 5 per theme (seaside, water, wildlife), plus enough yellow and purple bloomers to demo color pairing (e.g. tickseed, beach sunflower, black-eyed Susan, goldenrod; blazing star, lyreleaf sage, Stokes' aster, porterweed, wild petunia).
- 6 to 8 popular non-natives (e.g. Mexican petunia, Lantana camara, hibiscus, ixora, bougainvillea) only for the native-swap demo.
- Values from general knowledge stay `"verified": false`. Teammates will check the ~12 plants used in the demo against UF/IFAS Extension and the Florida Native Plant Society. Do not copy text from copyrighted books.

### 5.2 Database (Prisma models)

Keep it small. Store the plant fields above as columns where they are filtered on (category, origin, invasive_status, regions, light, salt_tolerance, water_need) and the rest in a `Json` column.

- `Plant` id (slug), common_name, scientific_name, category, form, origin, invasive_status, regions[], light[], salt_tolerance, water_need, attrs Json, verified
- `Site` id, name, lat, lon, zip, region, sun, soil, drainage, coastal_distance_mi, area_sqft, native_target_pct?
- `Garden` id (short random, used in the URL), site_id, name, theme, planted_on, canvas_w_ft, canvas_h_ft, is_demo, created_at, updated_at
- `Zone` id, garden_id, name, polygon Json, irrigation (none, drip, spray)
- `Placement` id, garden_id, plant_id, zone_id?, x_ft, y_ft, group_id?, planted_on
- `Checkin` id, garden_id, placement_id?, image_url, identify Json, matched_plant_id?, diagnosis Json, height_ft?, created_at
- `Report` id, issue_key, label, host_plant_id?, lat_rounded, lon_rounded, is_sample, created_at, checkin_id?

Rules
- Check-ins can add a `Report` only when the user turns on "share anonymously". Round to 2 decimals (about 1 km) and strip EXIF before upload.
- Weather is never stored. It comes from the API route (with fixtures) on each request, cached in memory for 30 minutes.
- `npm run db:setup` runs `prisma migrate deploy` then `prisma db seed`. Seeding is idempotent.
- `POST /api/demo/reset` (needs `DEMO_RESET_TOKEN`) restores Maria's garden to its seeded state before each presentation.
- Add a basic rate limit on check-in uploads (e.g. 20 per hour per IP) and a 5 MB size cap, because the link is public.

### 5.3 Engines (`lib/engine/`, pure functions, units in comments)

**Region.** north if lat ≥ 29.6, central if 27.0 ≤ lat < 29.6, south if lat < 27.0 (approximation, say so in the UI).

**Recommender.** S = 0.30·light + 0.25·salt + 0.20·water + 0.15·region + 0.10·space, each term 0 to 1. Hard filters set S = 0 (not native to region, salt-sensitive within 0.5 mi of the coast, too big for the space, invasive). +0.1 if it matches the chosen theme. Each result includes 1 or 2 plain-language reasons.

**Growth (logistic).** h(t) = H / (1 + ((H − h0)/h0)·e^(−r·t)), r = 0.35 / 0.6 / 0.9 for slow / medium / fast. Spread scales the same way. Return shade warnings for sun-only plants under a larger canopy at year t.

**Water balance (FAO-56 style, per zone, daily).**
- Soil table (θ_fc, θ_wp) sand 0.10/0.04, sandy_loam 0.18/0.08, loam 0.27/0.12, muck 0.45/0.20.
- TAW = 1000·(θ_fc − θ_wp)·Zr (Zr in m), RAW = 0.5·TAW.
- Kc_zone = canopy-weighted mean of plant kc, ×1.3 for plants in their first 12 months.
- Dr_t = clamp(Dr_(t−1) − P_eff − I + Kc·ET0, 0, TAW), P_eff = 0 if rain < 2 mm else 0.8·rain.
- Simulate 7 days ahead. If Dr would pass RAW on day k, recommend water on day k−1 unless ≥ 6 mm rain is forecast on day k or k+1, then recommend skip.
- Water saved vs a turf baseline (Kc 0.8, watered twice a week). 1 inch over 1 sq ft = 0.623 gal.

**Frost.** high if forecast low ≤ cold_hardy_f, medium if within 3°F (6°F for plants under 12 months), else low.

**Storm.** On a tropical storm, hurricane, or high wind alert, rank plants by height_now × (1 low, 0.5 medium, 0.2 high wind tolerance) and add fixed checklist items (stake young trees, move pots, pause watering, clear drains).

**Phenology (bloom and fruit dates).**
- Too young (age < years_to_first_bloom) → "first bloom around <month year>".
- `season` trigger → next month in bloom_months, or "in season now".
- `gdd` trigger → GDD_d = max(0, (Tmax + Tmin)/2 − T_base). Accumulate from last bloom end, use forecast days then daily normals from the scenario file. Range from normals ± 1 std.
- A photo showing buds overrides with bud_to_bloom_days. Flowering predicts fruit with bloom_to_fruit_days.
- Return `{event, earliest, latest, confidence, basis}`.

**Beauty timeline.** For each month, Beauty = 100·(0.4·fill + 0.4·bloom + 0.2·color), where fill = canopy/bed area (cap 1), bloom = share of canopy in bloom, color = distinct flower color families in bloom / 4 (cap 1). Report peak months and the weakest month with 2 native suggestions that bloom then.

**Color.** Convert hex to CIELAB, ΔE = √(ΔL² + Δa² + Δb²), match c = max(0, 1 − ΔE/50). Nativeness N = 1.0 native to region, 0.85 other Florida native, 0.6 non-invasive non-native, 0 invasive. S_color = S_site·(0.5 + 0.5c)·N. Harmony partners by hue angle (complementary +180°, analogous ±30°, triadic ±120°). Bloom overlap = months both plants bloom.

**Spacing.** Square grid n ≈ A/s², offset grid n ≈ A/(s²·√3/2). Overcrowding if spacing < 0.8·spacing_ft.

**Disease.** Group sample reports by issue within 5 km and 21 days. A cluster of ≥ 3 within 10 km warns if the garden has a plant listing that issue.

**Impact.** Native % (count and canopy area), gallons saved, pollinator score 0 to 100, bloom months, maintenance level.

Write Vitest tests with hand-computed numbers for growth, water, frost, phenology GDD, color ΔE, spacing.

---

## 6. External calls (route handlers + `lib/clients/`)

Every client follows the same pattern. If `DEMO_MODE=true` or the key is missing, return the fixture. Otherwise call live with a 6-second timeout and return the fixture on any error. Log which one was used.

- `GET /api/weather?lat&lon&scenario` returns 7-day daily Tmin, Tmax, precipitation, ET0, wind gust. With `scenario`, read `data/scenarios/<name>.json` instead.
- `GET /api/alerts?lat&lon&scenario` returns NWS active alerts, or the scenario's synthetic alert.
- `POST /api/identify` (image) calls Pl@ntNet, top 5 species.
- `POST /api/diagnose` (image + plant context + weather) calls Gemini with this output schema
  ```json
  {
    "overall_health": "healthy | mild_stress | moderate_problem | severe_problem | unclear",
    "phenology_stage": "vegetative | budding | flowering | fruiting | dormant | unclear",
    "candidates": [{"issue_key": "string", "label": "string", "confidence": 0.0, "evidence": "string"}],
    "actions": ["string"],
    "see_expert": true
  }
  ```
  Rules in the system prompt. At most 3 candidates. Prefer "unclear" over guessing. Suggest confirming serious issues with the local UF/IFAS Extension office. Never name pesticide products or doses.
- `POST /api/action-plan` turns a frost, storm, water, or disease alert into 3 to 6 short steps with times. If Gemini is unavailable, use a template.

**Fixtures to create.** Pl@ntNet and Gemini responses for 3 demo photos (healthy firebush, firebush with leaf spots, a Mexican petunia for the native-swap moment). Put the 3 photos in `public/demo-photos/` using free-license images or team photos, and note the source in the README.

**Scenarios.** `scripts/fetch-scenarios.ts` pulls Open-Meteo archive data for a Tampa point once and saves it.
- `cold_snap` January 19 to 25, 2025
- `hurricane` October 6 to 12, 2024 (Hurricane Milton) plus a synthetic Hurricane Warning alert
- `rainy_week` a wet summer week (pick from the data)
- `normal_week` a typical spring week
Also store 10-year daily climate normals for the Tampa point for phenology.

---

## 7. Pages

**Visual direction.** Calm and natural. Deep green, sand, sky blue, coral for alerts. Rounded cards, generous spacing, mobile-friendly but designed to look best on a laptop projector. Simple original SVG icons per plant category. No copyrighted images.

1. **Landing `/`.** Pitch, the Design → Preview → Predict → Act strip, 3 headline stats from Maria's garden, buttons "Design a garden" and "Open Maria's garden".
2. **Design `/design`.** Tabs Plan, Colors, Timeline.
   - Wizard. Location (ZIP or map pin), sun, soil, drainage, distance to coast, yard size, theme.
   - Recommender list with fit bars, reasons, and badges (Native to your area, Florida native, Non-native, Invasive). Natives first, non-natives collapsed, invasives never.
   - Search box. Searching a non-native shows a native swap card ("Mexican petunia is invasive in Florida. Try wild petunia for the same purple.").
   - Plan tab. Konva grid (1 cell = 1 ft), drag-and-drop plants sized by canopy, bed fill tool with quantity stepper, overcrowding and shade warnings, year slider 0 to 10, theme templates.
   - Colors tab. Month slider recolors plants (flower color in bloom, fruit color when fruiting, foliage otherwise). Color brush with suggestions, harmony partners, bloom overlap. Side-by-side compare of two versions.
   - Timeline tab. 12-month beauty strip with peak and weakest month.
   - Native % meter always visible.
3. **Garden dashboard `/garden/[id]`.** Includes a "Copy share link" button. Impact tiles, "Coming up" card (bloom and fruit predictions), alerts with Gemini steps, 7-day watering calendar per zone with a depletion chart, mini canvas. Buttons Refresh and "Replay scenario".
4. **3D Plant Inspector** (side panel when a plant is clicked anywhere). One plant only. Procedural low-poly geometry by `form` (start with mounding shrub and upright wildflower, then palm, tree, grass, vine, fern). Age slider 0 to 10 years with Play, month slider for stages (leaves, buds, flowers, fruit), predicted date range under it. Budget ≤ 5,000 triangles, `InstancedMesh` for leaves/flowers, `frameloop="demand"`, `dpr={[1, 1.5]}`, no live shadows, 2D SVG fallback. **Time-box to 6 hours total.**
5. **Check-in `/garden/[id]/checkin`.** Upload or pick a demo photo, optional plant picker, result card with matched plant, health, stage, candidates with confidence bars, actions, expert note.
6. **Map `/map`.** Leaflet map of all reports from the database. Seeded ones are tagged "sample data". Shared check-ins from anyone (including judges trying the link) appear live. Optional NDVI overlay from `data/ndvi/usf-garden.geojson` with a note that satellites only work for large areas.
7. **Plants `/plants`, `/plants/[id]`.** Search, filters, profile with bloom/fruit calendar swatches and an "unverified" badge where relevant.
8. **Presenter `/demo`.** One-click buttons for each demo step. Open Maria, replay cold snap, replay hurricane, replay rainy week, run check-in with demo photo, reset Maria (calls the reset route). Hidden from the main nav.

Footer note says predictions are estimates and users should confirm with their local UF/IFAS Extension office.

---

## 8. Demo script the app must support (3 minutes)

1. Landing, hook line.
2. Open Maria's garden in Design. Ask for yellow next to purple, pick tickseed + blazing star, show bloom overlap.
3. Search Mexican petunia, show the native swap.
4. Month slider to show colors through the year, then the Timeline peak.
5. Click firebush, 3D Inspector, press Play to grow it to year 3.
6. Dashboard. Replay rainy week, watering skipped, gallons saved.
7. Replay cold snap, frost alert with a 9 PM plan.
8. Check-in with the spotted-leaf demo photo, diagnosis, map shows nearby sample reports.
9. Close on the "Coming up" card.

Write this as `DEMO_SCRIPT.md` with exact clicks.

---

## 9. Build phases (commit after each)

| Phase | Scope |
|---|---|
| 0 | Next.js app, Tailwind, shadcn/ui, layout and nav, Prisma + Supabase connection, `.env.example`, README, **first deploy to Vercel** |
| 1 | Prisma schema, migration, seed (`plants.json`, Maria, sample reports), catalog pages reading from the DB, engine skeletons, Vitest |
| 2 | Wizard, recommender with native-first ranking and swap, 2D canvas, templates, growth slider, save/load garden via API |
| 3 | Weather client + scenarios script, water engine, dashboard calendar and impact tiles |
| 4 | Frost, storm, action plans, alerts on the dashboard, scenario replay |
| 5 | Check-in upload to Supabase Storage, identify + diagnose with fixtures, save check-ins and reports, map from the DB |
| 6 | Colors tab, phenology, beauty timeline, bed fill and spacing, Coming up card |
| 7 | 3D Plant Inspector (6-hour cap) |
| 8 | Presenter page with reset, landing polish, `DEMO_SCRIPT.md`, full run-through on the deployed URL and once locally |
| 9 (optional) | NDVI overlay, custom domain |

If a phase runs long, cut scope inside it rather than skipping the run-through in Phase 8.

---

## 10. When unsure

Pick the simplest option that keeps the demo path working, note it in `README.md` under "Demo shortcuts", and keep going. Ask the team only for API keys, Supabase project credentials, demo photos, or a decision that changes the demo story.
