# NativeScape FL (hackathon demo)

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
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini diagnosis and action plans |

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

`DEMO_SCRIPT.md` has the 3-minute script with exact clicks. `/demo` (not in the nav) has one button per step and
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

## Known limits

- After a migration, **restart `npm run dev`**: the Prisma client is a hot-reload-proof singleton, so a running dev
  server keeps the old schema and saves fail with "Unknown argument".

- Building or running on a Windows machine with **no page file** can crash Node with
  "Zone Allocation failed - process out of memory" when memory spikes (e.g. `next build` uses one worker per CPU).
  A system-managed page file fixes it. Vercel builds are not affected.
