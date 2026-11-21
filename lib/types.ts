/** Shared domain types. A `Plant` is the full record from data/plants.json (DB columns + attrs merged). */

export type Region = "north" | "central" | "south";
export type Light = "full_sun" | "partial_shade" | "full_shade";
export type Level = "low" | "medium" | "high";
export type Soil = "sand" | "sandy_loam" | "loam" | "muck";
export type Drainage = "poor" | "moderate" | "fast";
export type Theme = "seaside" | "water" | "wildlife";
export type Irrigation = "none" | "drip" | "spray";
export type Category =
  | "palm" | "large_tree" | "small_tree" | "shrub" | "wildflower" | "grass" | "vine" | "fern" | "aquatic" | "vegetable" | "herb";
export type Form = "mounding" | "upright" | "palm" | "tree" | "grass" | "vine" | "fern" | "spreading";

export interface NamedColor { name: string; hex: string }

export interface Plant {
  id: string;
  common_name: string;
  scientific_name: string;
  origin: "native" | "non_native" | "edible";
  invasive_status: "none" | "invasive";
  native_alternatives: string[];
  category: Category;
  form: Form;
  regions: Region[];
  light: Light[];
  salt_tolerance: Level;
  water_need: Level;
  kc: number;
  root_depth_in: number;
  cold_hardy_f: number;
  wind_tolerance: Level;
  mature_height_ft: [number, number];
  mature_spread_ft: [number, number];
  planting_height_ft: number;
  growth_rate: "slow" | "medium" | "fast";
  spacing_ft: number;
  flower_colors: NamedColor[];
  fruit_colors: NamedColor[];
  foliage_color: string;
  bloom_months: number[];
  fruit_months: number[];
  bloom_trigger: "season" | "gdd";
  gdd_base_f: number;
  bloom_gdd: number | null;
  years_to_first_bloom: number;
  bud_to_bloom_days: [number, number];
  bloom_to_fruit_days: [number, number];
  dioecious: boolean;
  wildlife_value: string[];
  host_plant_for: string[];
  garden_themes: Theme[];
  common_issues: string[];
  establishment_months: number;
  habitat?: string | null;
  landscape_use?: string | null;
  /** Soil pH the plant grows well in, [min, max]. General knowledge, unverified. */
  ph_range: [number, number];
  verified: boolean;
  source_urls: string[];
  /** Phase 11.5: grows well in a pot. Missing = false. */
  container_ok?: boolean;
  min_container_gal?: number | null;
  dwarf_variety?: string | null;
  trellis?: boolean;
  /** Phase 11: edible crops only (origin "edible"). */
  edible?: EdibleInfo;
}

/** Month windows, inclusive, 1..12. [8, 3] wraps the new year (Aug to Mar). */
export type MonthWindow = [number, number];

/** Edible crop facts (data/edibles.json). Placeholders until checked against the UF/IFAS Florida Vegetable Gardening Guide. */
export interface EdibleInfo {
  planting_windows: Record<Region, MonthWindow[]>;
  days_to_harvest: [number, number];
  /** How many weeks a planting keeps producing once harvest starts. */
  harvest_weeks: number;
  spacing_in: number;
  /** FAO-56 style crop coefficients by stage: initial, mid-season, end; stage lengths (ini, development, mid, late) in days. */
  kc_stages: { ini: number; mid: number; end: number; stage_days: [number, number, number, number] };
  heavy_rain_sensitive: boolean;
  needs_staking: boolean;
  source_url: string;
}

export type SoilSource = "survey" | "user" | "lab" | "unknown";

/** Phase 10 soil facts on a site. All optional: a yard can have no survey data. */
export interface SoilFacts {
  soil_source?: SoilSource;
  survey_name?: string | null;
  component?: string | null;
  drainage_class?: string | null;
  sand_pct?: number | null;
  clay_pct?: number | null;
  om_pct?: number | null;
  ph?: number | null;
  awc?: number | null; // cm/cm
  is_fill?: boolean | null;
}

/** Building rules for a balcony: true = allowed / applies, false = not allowed, null = unknown (check with HOA or landlord). */
export interface BalconyRules {
  railing_pots: boolean | null;
  hanging_baskets: boolean | null;
  no_drip: boolean | null;
}

/** Phase 11.5 balcony profile. Distances in ft; facing_deg is the compass bearing the balcony looks toward (270 = west). */
export interface BalconyFacts {
  kind?: "yard" | "balcony";
  facing_deg?: number | null;
  floor_level?: number | null;
  balcony_l_ft?: number | null;
  balcony_w_ft?: number | null;
  railing_ft?: number | null;
  overhang_depth_ft?: number | null;
  overhang_height_ft?: number | null;
  rules?: BalconyRules | null;
}

export interface SiteInput extends SoilFacts, BalconyFacts {
  name?: string;
  lat: number;
  lon: number;
  zip?: string | null;
  region: Region;
  sun: Light;
  soil: Soil;
  drainage: Drainage;
  coastal_distance_mi: number;
  area_sqft: number;
  native_target_pct?: number | null;
}

export type ZoneKind = "landscape" | "edible";
export type BedType = "in_ground" | "raised" | "container";

export interface ZoneInput {
  id?: string;
  name: string;
  polygon: [number, number][];
  irrigation: Irrigation;
  /** Phase 11: "edible" zones hold crops; the native meter covers landscape zones only. */
  kind?: ZoneKind;
  bed?: BedType | null;
  depth_in?: number | null; // raised bed fill depth
}

export type Goal = "flowers" | "food" | "butterflies" | "low_care";
export type HoursWeek = "1" | "2-4" | "5+";
export type Space = "yard" | "raised_bed" | "containers" | "balcony" | "patio";

/** Phase 11 Garden Starter answers, stored on the garden. */
export interface StarterAnswers {
  goals: Goal[];
  hours_week: HoursWeek | null;
  budget_usd: number | null;
  space: Space | null;
  target_harvest: string | null; // YYYY-MM-DD, optional back-calculation target
}

export const NO_STARTER: StarterAnswers = { goals: [], hours_week: null, budget_usd: null, space: null, target_harvest: null };

export interface PlacementInput {
  id?: string;
  plant_id: string;
  zone_id?: string | null;
  x_ft: number;
  y_ft: number;
  group_id?: string | null;
  planted_on: string; // YYYY-MM-DD
  /** Phase 11.5 balcony pots: size in gallons and where it sits. */
  container_gal?: number | null;
  mount?: Mount | null;
}

export type Mount = "floor" | "railing" | "hanging";

export interface GardenDoc {
  id: string;
  name: string;
  theme: Theme | null;
  planted_on: string;
  canvas_w_ft: number;
  canvas_h_ft: number;
  is_demo: boolean;
  updated_at: string;
  starter: StarterAnswers;
  site: SiteInput & { id: string; name: string };
  zones: (ZoneInput & { id: string })[];
  placements: (PlacementInput & { id: string })[];
}

/** One day of weather. Temperatures °F, rain and ET0 mm, gust mph. */
export interface WeatherDay {
  date: string;
  tmin_f: number;
  tmax_f: number;
  rain_mm: number;
  et0_mm: number;
  gust_mph: number;
}

export interface WeatherBundle {
  today: string;
  history: WeatherDay[];
  forecast: WeatherDay[];
  source: string;
  scenario: string | null;
}

export interface NwsAlert {
  event: string;
  headline: string;
  description?: string;
  severity?: string;
  synthetic?: boolean;
}

export interface Diagnosis {
  overall_health: "healthy" | "mild_stress" | "moderate_problem" | "severe_problem" | "unclear";
  phenology_stage: "vegetative" | "budding" | "flowering" | "fruiting" | "dormant" | "unclear";
  candidates: { issue_key: string; label: string; confidence: number; evidence: string }[];
  actions: string[];
  see_expert: boolean;
}

export interface ActionStep { when: string; text: string }

export interface ReportPoint {
  id: string;
  issue_key: string;
  label: string;
  host_plant_id: string | null;
  lat: number;
  lon: number;
  is_sample: boolean;
  created_at: string;
}

export type Source = "live" | "fixture";
