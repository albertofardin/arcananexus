/**
 * Token di design della landing pubblica "Arcana Domine".
 *
 * La home corporate è volutamente autonoma dal tema multi-dimensione della
 * dashboard, ma ne condivide il font: il corpo testo usa la stessa istanza di
 * Hanken Grotesk caricata in `src/app/layout.tsx` (`--font-hanken-grotesk`),
 * i titoli usano Georgia (font di sistema).
 *
 * Questo oggetto è la fonte unica della palette: `tailwind.config.ts` importa
 * `COLORS` per generare le utility `colors.ad.*` (usate dalle sezioni per le
 * classi), mentre qui resta disponibile per i pochi valori passati via
 * prop/JS (es. colore del logo o del rombo dell'occhiello) dove serve la
 * stringa del colore invece di una className. Il font body è applicato via
 * CSS in `corporate.module.css`.
 */
export const COLORS = {
  bg: "#FBFAF7",
  bgAlt: "#F4F1EB",
  ink: "#16130F",
  dark: "#141210",
  red: "#C8102E",
  redDark: "#9E0B22",
  redBright: "#E11839",
  pink: "#E8607A",
  border: "#E7E2D8",
  muted: "#6B655C",
  muted2: "#5A554C",
  ink2: "#3A352E",
} as const;
