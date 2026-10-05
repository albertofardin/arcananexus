export const FT_MISSIVE = "missive";
export const FT_DOWNTIME = "downtime";
export const FT_PROGRESS = "progress";

const ICONS_FT = {
  [FT_DOWNTIME]: "downtime",
  [FT_MISSIVE]: "mail",
  [FT_PROGRESS]: "stars",
};
export const getFeatureIcon = (ft: string): string => {
  const icon = ICONS_FT[ft];
  if (icon) return icon;
  return "tune";
};
