/**
 * Example garden for the landing page hero: a made-up butterfly, rose and kitchen garden in the same style as a
 * real garden's "Your garden today" view. Built from the catalog JSON (no database), plants two years old so most
 * are blooming. Not a real user's garden.
 */
import { PLANTS } from "./catalog-data";
import { heightAt, spreadAt } from "./engine/growth";
import type { PlacedPlant } from "./predict";
import type { ZoneInput } from "./types";

export const SAMPLE_W = 30;
export const SAMPLE_H = 18;

export const SAMPLE_ZONES: (ZoneInput & { id: string })[] = [
  { id: "s_bed", name: "Butterfly bed", irrigation: "drip", kind: "landscape", polygon: [[1, 1], [19, 1], [19, 11], [1, 11]] },
  { id: "s_border", name: "Rose border", irrigation: "drip", kind: "landscape", polygon: [[21, 1], [29, 1], [29, 17], [21, 17]] },
  { id: "s_veg", name: "Kitchen bed", irrigation: "drip", kind: "edible", bed: "raised", depth_in: 10, polygon: [[3, 12.5], [17, 12.5], [17, 16.5], [3, 16.5]] },
];

// [plant id, x, y]: tall plants at the back (top), flowers up front, crops in the raised bed.
const LAYOUT: [string, number, number][] = [
  ["callicarpa_americana", 3.5, 3.5], ["hamelia_patens", 8, 3.2], ["hamelia_patens", 12.5, 3.5], ["stachytarpheta_jamaicensis", 16.5, 3.4],
  ["asclepias_tuberosa", 3, 7.5], ["salvia_coccinea", 5.5, 8.5], ["pentas", 7.8, 7], ["gaillardia_pulchella", 10, 8.8], ["zinnia", 12, 7.2],
  ["coreopsis_leavenworthii", 14, 8.8], ["asclepias_tuberosa", 16, 7.3], ["rudbeckia_hirta", 17.8, 9.2], ["salvia_coccinea", 9, 10], ["pentas", 15.2, 10.2],
  ["muhlenbergia_capillaris", 23, 3], ["plumbago", 27, 3.2], ["rose_knock_out", 23.2, 7], ["rose_louis_philippe", 27, 7.2],
  ["rose_knock_out", 23.2, 11], ["zinnia", 27, 10.8], ["muhlenbergia_capillaris", 23, 15], ["gaillardia_pulchella", 27, 15],
  ["cherry_tomato", 4.5, 14.5], ["cherry_tomato", 6.5, 14.5], ["basil", 8.6, 13.6], ["basil", 8.6, 15.4], ["lettuce", 10.5, 13.6],
  ["lettuce", 10.5, 15.4], ["lettuce", 12, 13.6], ["lettuce", 12, 15.4], ["parsley", 14, 14.5], ["strawberry", 15.8, 14.5],
];

const AGE_YEARS = 2;

export function samplePlaced(today: string): PlacedPlant[] {
  const byId = new Map(PLANTS.map((p) => [p.id, p]));
  const planted = new Date(Date.parse(today) - AGE_YEARS * 365 * 86400e3).toISOString().slice(0, 10);
  return LAYOUT.filter(([id]) => byId.has(id)).map(([id, x, y], i) => {
    const plant = byId.get(id)!;
    // Crops are a season old at most; perennials two years.
    const age = plant.edible ? 0.25 : AGE_YEARS;
    return { id: `sample_${i}`, plant, x_ft: x, y_ft: y, radius_ft: spreadAt(plant, age) / 2, height_ft: heightAt(plant, age), age_years: age, planted_on: planted };
  });
}
