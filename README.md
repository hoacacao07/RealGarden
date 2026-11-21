# RealGarden (hackathon demo)

Plan a low-maintenance garden of Florida native plants, preview it through the year, and get early warnings
before problems happen. **Design → Preview → Predict → Act.**

One Next.js app (App Router, TypeScript, Tailwind, shadcn/ui) with Postgres on Supabase via Prisma, deployed to Vercel.
There is no login: every garden has a shareable link (`/garden/<id>`) and **anyone with the link can view and edit it**.
That is fine for a demo and not for real users.

## Run it

```bash
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL (Supabase), DEMO_RESET_TOKEN
npm install                 # also runs `prisma generate`
npm run db:setup            # prisma migrate deploy + seed (plants, Maria, sample reports). Safe to re-run.
npm run dev                 # http://localhost:3000
npm test                    # engine math tests (Vitest)
```

No Supabase yet? `npm run db:local` starts Prisma's local Postgres (`prisma dev`). It prints a `postgres://…` TCP URL:
put it in both `DATABASE_URL` and `DIRECT_URL`, then run `npm run db:setup`.

### Supabase + Vercel

1. Create a Supabase project. Copy the **pooled** connection string (port 6543, add `?pgbouncer=true`) to `DATABASE_URL`
   and the **direct** one (port 5432) to `DIRECT_URL`.
2. In Supabase Storage create a bucket named `checkins` (public read). Put the project URL in `SUPABASE_URL` and the
   service role key in `SUPABASE_SERVICE_ROLE_KEY` (server only; it is never sent to the browser).
3. Run `npm run db:setup` once from your laptop against Supabase.
4. Import the repo in Vercel, add the same env vars, deploy. The build runs `prisma generate && next build`.

### Environment

| Var | What |
|---|---|
| `DEMO_MODE` | `true` (default): every external API uses the saved responses in `data/fixtures/`. `false`: live calls where keys exist, fixtures on any error. |
| `DATABASE_URL`, `DIRECT_URL` | Supabase pooled / direct Postgres connections |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Photo storage (bucket `checkins`) |
| `DEMO_RESET_TOKEN` | Protects `POST /api/demo/reset` |
| `NWS_USER_AGENT` | Required by api.weather.gov |
| `PLANTNET_API_KEY`, `PLANTNET_PROJECT` | Pl@ntNet plant ID |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_LITE` | Gemini (diagnosis, suggestions, rewrites, Garden AI chat). Model ids come from env only. Pick a model that answers fast: chat makes 2–3 calls per question under `GEMINI_TIMEOUT_MS` (20 s) each |
| `PP_KEY_ID`, `PP_KEY_SECRET` | Permapeople keys, only for `npm run pp:import` (offline, never used by the app) |

### Garden AI (Phase 13)

- Floating **Ask Garden AI** button on every page, and the full page `/garden/<id>/assistant`.
- `POST /api/chat` (multipart `garden_id`, `message`, optional `image`) streams NDJSON events: `text`, `tool` (chips),
  `proposal` (cards), `done`, `error`. `GET`/`DELETE /api/chat?garden_id=` load or clear the history.
- Tools live in `lib/ai/assistantTools.ts`, bound to the open garden. Writes (`propose_task`, `propose_add_plant`) are
  never run by the model: `POST /api/chat/confirm` reads the proposal from the stored answer and performs it once.
- Thumbs up/down: `POST /api/chat/feedback`. Rate limit 30 messages per hour per IP.

### Permapeople plant data → Supabase

Permapeople is read once, offline. The app only ever reads the `Plant` table.

```bash
npm run pp:import   # needs PP_KEY_ID + PP_KEY_SECRET in .env → data/import_permapeople.json + data/import_review.csv
npm run pp:merge    # no keys → data/permapeople_overlay.json (generic fields per plant; review the git diff)
npm run db:seed     # catalog + overlay → Supabase Plant table
```

- Only generic fields are applied: mature height and spread, light, water need, pH range, growth rate
  (`OVERLAY_FIELDS` in `lib/engine/permapeople.ts`). Florida fields (regions, zones, cold hardiness, salt and wind
  tolerance, chill hours, Florida notes) and the **life cycle** always stay as the team wrote them: Permapeople gives
  the botanical life cycle (eggplant "perennial"), but the frost and zone checks need how it's grown in Florida.
- Permapeople sizes are bare numbers in **meters**; the import converts them to feet.
- `pp:merge` skips search hits for a different species (wrong match), any height or width flagged in
  `data/import_review.csv`, and holds back sizes more than 2× off the team's value (it prints them as "held"; often a
  vine's length or a pole variety). Edit or delete overlay entries by hand before committing.
- Water: "Dry" or "Dry, Moist" → low, "Moist" → medium, "Wet" or "Moist, Wet" → high, dry-to-wet → medium.
- `lib/catalog-data.ts` applies the overlay on top of `data/plants.json`, `edibles.json` and `catalog_extra.json`;
  the source files are never rewritten. Data is CC BY-SA 4.0 and credited on plant pages and in the footer.

### Plants for a garden type and sun

`GET /api/plants/match?types=vegetable,fruit&sun=full_sun&zip=33620` reads the `Plant` table and returns the plants
that fit (`lib/engine/plantMatch.ts`): `types` = vegetable (with kitchen herbs), fruit, herb, flower; `sun` =
full_sun, partial_shade, full_shade; `zip` (optional) adds the hardiness-zone filter. Plants that thrive come before
plants that only tolerate the sun; invasives never appear.

## Data

- `data/plants.json`: 33 Florida natives and 7 popular non-natives (for the native-swap demo). Every record is
  `"verified": false` until a teammate checks it against UF/IFAS Extension and the Florida Native Plant Society.
- `data/edibles.json`: 12 vegetables and herbs (`origin: "edible"`), seeded with the plants. Planting windows, days to harvest
  and stage Kc are **placeholders** (`verified: false`) until the data person fills them from the UF/IFAS Florida Vegetable
  Gardening Guide (VH021, Table 1).
- `data/fertilizer_rules.json`: summer fertilizer restrictions for Tampa, Hillsborough, Pinellas, Manatee and Sarasota
  (rough bounding boxes, `verified: false`). Anywhere else falls back to a conservative June to September window.
- `data/demo/maria.json`: Maria's site and butterfly garden in South Tampa, about 2 miles from the bay, plus a small
  raised tomato bed.
- `data/demo/linh.json`: Linh's 4th-floor, west-facing 10 × 5 ft balcony near USF (balcony mode, Phase 11.5): the balcony
  upstairs is a 5 ft overhang at 8.5 ft, no dripping allowed, and eight pots (cherry tomatoes, basil, parsley, pepper,
  strawberry on the railing, two scarlet (tropical) sage).
- Balcony fields on plants (`container_ok`, `min_container_gal`, `dwarf_variety`, `trellis`) are **placeholders** to verify,
  like the rest of the catalog. Garden-center "dwarf firebush" is often a non-native; the record says so.
- `data/demo/reports.json`: **sample** disease reports near Tampa (tagged "sample data" in the UI).
- `public/demo-photos/*.jpg`: the 3 check-in demo photos are **original illustrations** drawn by
  `scripts/make-demo-photos.ts` (`npm run demo-photos`), so there are no license questions. Replace them with team photos
  using the same file names; the saved Pl@ntNet/Gemini fixtures are keyed by name.
- `data/scenarios/*.json`: real Open-Meteo archive weather for Tampa (`npm run fetch-scenarios` re-pulls them) plus
  10-year daily climate normals used for bloom predictions.

## Presenting

`DEMO_SCRIPT.md` has the 4-minute v6 script with exact clicks (style → place → garden → shopping → alert → Garden AI → Sustainable → balcony). `/demo` (not in the nav) has one button per step and
**Reset demo gardens**, which calls `POST /api/demo/reset` with `DEMO_RESET_TOKEN` to restore Maria's and Linh's gardens and
the sample reports.
Real shared check-in reports are kept.

## Demo shortcuts

Simplifications made to keep the demo path reliable:

- **Region by latitude.** north ≥ 29.6°N, central 27.0–29.6°N, south < 27.0°N. An approximation, labeled in the UI.
- **Sample report dates are re-based.** Sample reports are shifted so the newest is two days old, so the 21-day
  disease cluster still shows up weeks after seeding. Real shared check-ins keep their real dates.
- **Plant ages use today's date** even when a scenario replays 2024/2025 weather, so Maria's plants stay "young".
- **Only Tampa normals** are bundled for growing-degree-day bloom predictions.
- **Complementary colors** use a ±50° hue window in CIELAB LCh (yellow sits ~88°, blue-violet ~300°).
- **3D inspector camera follows the plant.** It zooms to the plant's current size; a fixed 6 ft stake shows scale.
  If WebGL is missing or fails, the panel falls back to the 2D drawing.
- **Harmony partners show the top 4** per harmony, ranked by shared bloom months, then site fit.
- **Stage Kc lives in `edible.kc_stages`.** The spec calls it `kc`, but `kc` is already the single number the water engine
  uses, so edibles keep `kc` = mid-season value and the stage curve under `edible.kc_stages`.
- **Calendar tasks are generated on page load** (deterministic, from the layout and the region). Ticks and shopping
  prices are saved in the browser only; Phase 12 adds stored alert tasks.
- **Back-calculated planting uses the upper days-to-harvest**, so the crop is ready by the target date at the latest.
- **Starter crops** are compact crops (spread ≤ 3 ft) that can be planted within about 4 months, tomato first.
- **Fertilizer ordinance lookup** uses rough city/county boxes, city first. Every calendar shows "Check your local
  fertilizer ordinance".

- **Sun position is computed in `lib/engine/sunpos.ts`** (NOAA-style low-precision formulas, about 0.5° accuracy) instead of
  the suncalc package, so no new dependency was added. Tampa's December solstice noon altitude checks out at 38.6°.
- **Balcony sun hours** count every 15 minutes on the 15th of each month, ignoring the sun below 5°. The sun must be within
  90° of the facing; the overhang check uses the pot's distance from the overhang edge projected along the sun's
  direction (cos ΔA). Side walls, neighbors and trees are not modeled. The site's light is the median month for a pot
  halfway back; sun lovers with 5+ h at the railing still rank, with "put it at the railing".
- **Container water model** uses estimates to verify (`BALCONY_CONFIG` in `lib/engine/containerWater.ts`): a quarter of the
  pot volume is usable water, west/south walls use 20% more, water below half. The typical summer and winter line uses a
  rounded monthly Tampa ET0 table; the 7-day plan uses the forecast.
- **Weight** is wet mix at 1 kg/L plus pot and saucer water. It is an estimate and never says a balcony is safe.
- **Garden AI starter chips are scripted in `DEMO_MODE`** (matched by text, so typing the same question works too) and
  tagged "sample answer". Everything else is live Gemini.
- **Plants added from the chat** go into the first bed of the matching kind (edible or landscape) in an even grid, and
  may overlap existing plants. On a balcony each one gets a 5 gal floor pot. Move them in Design.
- **Chat tasks** are stored as `Task` rows with `source: "chat"` and shown to the assistant by `get_tasks`.
- **Chat photos** go through the check-in diagnose pipeline and only the result is sent to the chat model. The photo
  itself is not stored.
- **Main Gemini model.** On 2026-11-21, `gemini-3.8-flash` hung for over 40 s and `gemini-3.5-flash` took about 15 s per
  call on the team key, so the local `.env` uses `gemini-3.5-flash-lite` (under 1 s, tool calling works). Re-test before
  demo day.

## Known limits

- **Local database = 1 connection.** `prisma dev` (PGlite) handles one connection at a time, so `lib/db.ts` uses a pool
  of 1 when `DATABASE_URL` points at localhost (5 otherwise; `DB_POOL_MAX` overrides). More than one connection made
  pages and Garden AI fail at random with `P1017 ConnectionClosed`.
- **Phones on the same Wi-Fi** can open the dev server at `http://<this computer's IP>:3000`: `next.config.ts` allows the
  machine's own network addresses (`allowedDevOrigins`). Without that, Next 16 leaves the page un-clickable.

- After a migration, **restart `npm run dev`**: the Prisma client is a hot-reload-proof singleton, so a running dev
  server keeps the old schema and saves fail with "Unknown argument".

- Building or running on a Windows machine with **no page file** can crash Node with
  "Zone Allocation failed - process out of memory" when memory spikes (e.g. `next build` uses one worker per CPU).
  A system-managed page file fixes it. Vercel builds are not affected.
