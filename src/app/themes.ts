// ── Colore ───────────────────────────────────────────────────────────────────

export type ThemeColor =
  | "crimson"
  | "orange"
  | "gold"
  | "turquoise"
  | "cobalt"
  | "indigo"
  | "amethyst"
  | "silver";

interface IThemeColorOption {
  id: ThemeColor;
  label: string;
  swatch: string;
}

export const themeColors: IThemeColorOption[] = [
  { id: "crimson", label: "Cremisi", swatch: "#a4161a" },
  { id: "orange", label: "Corallo", swatch: "#e8590c" },
  { id: "gold", label: "Oro", swatch: "#c89116" },
  { id: "turquoise", label: "Turchese", swatch: "#0f9b8e" },
  { id: "cobalt", label: "Cobalto", swatch: "#0f62fe" },
  { id: "indigo", label: "Indaco", swatch: "#5b5bef" },
  { id: "amethyst", label: "Ametista", swatch: "#7c3aed" },
  { id: "silver", label: "Argento", swatch: "#9ca3af" },
];

// ── Texture ──────────────────────────────────────────────────────────────────

export type ThemeTexture =
  | "texture_cyberpunk"
  | "texture_fallout"
  | "texture_fantasy"
  | "texture_steampunk"
  | "none";

interface IThemeTextureOption {
  id: ThemeTexture;
  label: string;
  file?: string;
}

export const themeTextures: IThemeTextureOption[] = [
  {
    id: "texture_cyberpunk",
    label: "Cyberpunk",
    file: "/textures/cyberpunk.webp",
  },
  {
    id: "texture_fallout",
    label: "Fallout",
    file: "/textures/fallout.webp",
  },
  {
    id: "texture_fantasy",
    label: "Fantasy",
    file: "/textures/fantasy.webp",
  },
  {
    id: "texture_steampunk",
    label: "Steampunk",
    file: "/textures/steampunk.webp",
  },
  { id: "none", label: "Nessuna trama" },
];

// ── Default ──────────────────────────────────────────────────────────────────

export const defaultColor: ThemeColor = "crimson";
export const defaultTexture: ThemeTexture = "texture_fantasy";
