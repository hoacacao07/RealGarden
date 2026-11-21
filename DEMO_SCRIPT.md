# RealGarden – demo script (v6, about 4 minutes)

Personas: **Maria**, first-time homeowner in Tampa about 2 miles from the bay (butterfly garden, a small tomato bed,
a few roses), and **Linh**, a USF student with a 4th-floor west-facing balcony (10 × 5 ft).

## Before you present (5 minutes earlier)

1. Open `/demo` (presenter page; it is not in the main nav).
2. Paste the `DEMO_RESET_TOKEN` and click **Reset demo gardens**. This restores Maria's and Linh's gardens, their
   Garden AI chats and the sample disease reports. Shared check-ins from judges stay on the map.
3. Click **End sample alerts** so the dashboard starts calm.
4. Keep `/demo` open in one tab and present from a second tab. Zoom the browser to 110–125% for the projector.
5. `DEMO_MODE=true`: weather, soil, Pl@ntNet, NWS fixtures and the 4 Garden AI starter chips come from saved
   responses, so the main path works on bad Wi-Fi. Free-form Garden AI questions use live Gemini when a key is set.
   The database still needs a connection.
6. On the live URL, check the external scheduler (cron-job.org or the GitHub Actions schedule) is calling
   `/api/cron/check-alerts` every 5 minutes (its run history shows the last call and a 200 response).
7. Open every page once (the free-tier database wakes up on the first request).

## The run-through

| # | Time | Click | Say |
|---|------|-------|-----|
| 1 | 0:00 | `/` → **Start my garden**. Pick **Butterfly & pollinator** and **Salad garden**, add roses. Enter ZIP **33620**. | "Everyday people want a beautiful garden, not a soil science class. Pick a style and a place, that's it." |
| 2 | 0:30 | Show the suggestions: open **Why this plant** on one card and point at the zone badge. Turn on **Prefer native plants**. | "Plants picked for this ZIP, hardiness zone and sun. Natives are a preference, not a rule: turn it on and watch the list re-rank. Invasive plants never show up." |
| 3 | 1:00 | Open **Maria's garden**. Open **Learn more → Your soil**. | "Soil comes from the USDA survey in one sentence: sandy, drains fast. So the tomatoes get a raised bed." |
| 4 | 1:20 | **Shopping** in the top nav, then the **Calendar** tab. | "What to buy, with counts: bags of soil, mulch, every plant. The calendar back-calculates planting from a target harvest and moves fertilizer out of the summer ban to September." |
| 5 | 1:45 | On `/demo` click **Simulate NWS alert → Hurricane Warning**. Switch back to Maria's tab. | "A real NWS alert would arrive the same way, every 5 minutes. Here's the banner and the push, with pre-storm tasks and the safety line: follow official instructions from your county." |
| 6 | 2:10 | Click **Ask Garden AI** (bottom right). Tap **Is my garden ready for the storm?** | "The assistant checks her alerts, tasks and garden through tools (see the chips) and answers with steps, before the storm only." |
| 7 | 2:35 | In the same chat tap **Make me a salad garden for 4×8 ft**. Click **Add to my garden** on the lettuce card. | "It suggests, she confirms. Nothing is written until she taps the button." |
| 8 | 2:55 | **More → 🌱 Sustainable**. Under **Greener swaps** click **Apply** on the rain barrel and on converting lawn to a pollinator bed. Open **Eco report card**. | "All the environmental numbers live here, for people who want them. Two swaps and the score climbs. The report card compares year 1, 5 and 10 against a typical lawn." |
| 9 | 3:25 | Open `/garden/linh`. | "No yard? Linh's west balcony: the sun strip, container picks like cherry tomato, basil and tropical sage, water daily in summer, and the weight estimate. The same hurricane alert now starts with: bring every pot inside." |
| 10 | 3:50 | Back to `/demo` → **End sample alerts**. | "Style, place, a beautiful garden, what to buy, simple care. That's RealGarden." |

## Garden AI tips

- The 4 starter chips are scripted in `DEMO_MODE` (tagged "sample answer") and always answer the same way.
- Anything else goes to live Gemini, and answers in the user's language (try Spanish or Vietnamese).
- A camera button in the chat attaches a leaf photo. It runs the same diagnose pipeline as Photo check-in.
- If Gemini is down or slow (20 s timeout) the chat says "The assistant is unavailable right now". Use the starter
  chips, which never call Gemini in demo mode.
- 30 messages per hour per IP. Thumbs up/down are saved with each answer.

## If something goes wrong

- **Page is slow the first time.** The free-tier database wakes up on the first request. Open every page once before presenting.
- **No banner after Simulate alert.** Reload the dashboard. Realtime pushes it, and a reload always shows it.
- **3D panel is blank.** Click **2D** in the panel's corner. The SVG fallback shows the same growth and stages.
- **Garden looks edited by someone else.** Use **Reset demo gardens** on `/demo`.
- **Check-in error "too many uploads".** It's the per-IP limit. Use the `/demo` buttons, which run the same check-in.

## Extras (if a judge asks)

- **Colors and harmony**: **Design → Colors**, brush **Purple**, click **Dense Blazing Star**, then **Harmony partners → Complementary** (Leavenworth's Tickseed, bloom together Aug to Oct). Drag the month slider Jan to Dec.
- **3D Plant Inspector**: in Design, double-click a firebush and press **Play** to grow it to year 3.
- **Photo check-in**: **Firebush, spotted leaves** → **Check this plant**, then the **Disease map**.
- **Weather replays**: `/garden/maria?scenario=hurricane` (Milton), **Rainy week**, **Cold snap** (Jan 2025 frost plan with times).
- **Native-swap photo** (`/garden/maria/checkin?demo=mexican_petunia`): the check-in recognizes an invasive and suggests a native swap.
- **Share link**: dashboard → **Copy share link**. Anyone with the link can view and edit (no login, by design for the demo).
