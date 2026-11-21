/** Fixed marker colors per issue so the legend and map agree. Unknown issues get a neutral slate. */
const COLORS: Record<string, string> = {
  leaf_spot: "#b5542f",
  powdery_mildew: "#7a8aa0",
  mites: "#c9a227",
  oleander_aphids: "#e08a1e",
  scale: "#6b4f8a",
  cold_damage: "#3f7fbf",
  root_rot: "#5a3a22",
};

export const ISSUE_COLOR = (key: string) => COLORS[key] ?? "#56606b";
