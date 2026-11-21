# NativeScape FL – 3-minute demo script

Persona: **Maria**, first-time homeowner in South Tampa, about 2 miles from the bay, building a butterfly garden.

## Before you present (5 minutes earlier)

1. Open `/demo` (presenter page; it is not in the main nav).
2. Paste the `DEMO_RESET_TOKEN` and click **Reset Maria**. You should see "Maria reset at …".
   This restores Maria's garden and the sample disease reports. Shared check-ins from judges stay on the map.
3. Keep `/demo` open in one tab and present from a second tab. Zoom the browser to 110–125% for the projector.
4. `DEMO_MODE=true` means weather, Pl@ntNet and Gemini all come from saved responses, so the demo works on bad Wi-Fi.
   The database still needs a connection.

Every step below has a matching button on `/demo` if you get lost.

## The 3 minutes

| # | Time | Click | Say |
|---|------|-------|-----|
| 1 | 0:00 | Open `/` | "Florida yards waste water on plants that don't belong here. NativeScape helps you **design** a native garden, **preview** it, **predict** problems, and **act** before they happen." Point at Maria's three numbers. |
| 2 | 0:20 | **Open Maria's garden** → **Edit design** → **Colors** tab. In **Color brush** click **Purple**, then click **Dense Blazing Star** in the list. Under **Harmony partners → Complementary**, point at **Leavenworth's Tickseed** and its "Bloom together Aug, Sep, Oct" strip. | "Maria wants purple next to yellow. Blazing star and tickseed are both native, opposite on the color wheel, and here's exactly which months they bloom together." |
| 3 | 0:45 | Go to the **Plan** tab. In the search box type `Mexican petunia`. | "She almost bought Mexican petunia. It's invasive in Florida, so we never suggest it, and we offer wild petunia for the same purple." |
| 4 | 1:00 | **Colors** tab: drag the **month slider** from Jan to Dec. Then the **Timeline** tab. | "Here's her garden color month by month. The timeline shows the peak, and the weakest month with two natives that would fill it." |
| 5 | 1:20 | **Plan** tab: **double-click a firebush** (red-orange) on the canvas. In the inspector press **Play**. | "One plant in 3D. Play grows it to year 3. The 6-foot stake shows the scale. Below are the predicted bloom and fruit dates." Close the panel. |
| 6 | 1:40 | Click **Dashboard** (or `/garden/maria`). Under **Replay scenario** click **Rainy week**. | "Rain is in the forecast, so the soil model says skip watering. That's the gallons saved versus a lawn on a timer." |
| 7 | 2:00 | Click **Cold snap**. Scroll to the second frost card (**Cold night Sat Jan 25**). | "January 2025's real cold snap. Porterweed and the young firebush are frost-tender, so she gets a plan with times: water in the afternoon, cover them by 9 PM, uncover at 10 AM." |
| 8 | 2:20 | Click **Photo check-in**. The **Firebush, spotted leaves** photo is selected. Leave **Share anonymously** on and click **Check this plant**. Then open **Disease map** in the nav. | "A photo of spotted leaves: identified, diagnosed with confidence bars, and steps, with a note to confirm with UF/IFAS. Her anonymous report joins the sample reports nearby. Three leaf-spot reports within 10 km trigger a warning on her dashboard." |
| 9 | 2:45 | Back to **Maria's garden**, click **Back to live**, point at **Coming up**. | "And this is what's coming up next in her garden. That's NativeScape FL." |

## If something goes wrong

- **Page is slow the first time.** The free-tier database wakes up on the first request. Open every page once before presenting.
- **3D panel is blank.** Click **2D** in the panel's corner. The SVG fallback shows the same growth and stages.
- **Garden looks edited by someone else.** Use **Reset demo gardens** on `/demo`.
- **Check-in error "too many uploads".** It's the 20-per-hour per-IP limit. Use the `/demo` buttons, which run the same check-in.

## Extras (if a judge asks)

- **Balcony mode, Linh** (`/garden/linh`, also on `/demo`): can replace step 5. A 4th-floor west balcony: the sun strip (4 to 5 h of hot afternoon sun), container picks (cherry tomato, basil, tropical sage), "water daily in summer" per pot, and the weight estimate. Then **Replay scenario → Hurricane**: the same alert now starts with "Bring every pot, basket and trellis inside before the wind starts".

- **Hurricane Milton replay** (`/garden/maria?scenario=hurricane`): synthetic Hurricane Warning, plants ranked by wind risk, and a storm checklist.
- **Native-swap photo** (`/garden/maria/checkin?demo=mexican_petunia`): the check-in recognizes an invasive and suggests a native swap.
- **Share link**: dashboard → **Copy share link**. Anyone with the link can view and edit (no login, by design for the demo).
