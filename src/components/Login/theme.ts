import * as React from "react";

/**
 * Login design-token island.
 *
 * Il Login deve essere esente dai temi, il Login mostra sempre la stessa palette light.
 * Per ottenerlo ridefiniamo le CSS custom properties del tema: le variabili ereditano
 * lungo il DOM, quindi tutti i componenti core riusati (Btn, Text, FieldText,
 * Card, BtnCheckbox…) — che usano `var(--primary)` ecc. via Tailwind — vengono
 * automaticamente "riverniciati" con questi valori, senza riscriverli.
 */

/** Oro decorativo: bordi, angoli, diamanti, ring. */
export const LOGIN_GOLD = "#c9a66b";
/** Oro tenue per le sfumature dei divisori. */
export const LOGIN_GOLD_SOFT = "rgba(201, 166, 107, 0.7)";

/** Sfondo crema del workspace e del pannello. */
export const LOGIN_BG = "#faf6ef";
/** Superficie dei form / card. */
export const LOGIN_SURFACE = "#fffdf9";

/** Gradiente orizzontale per i divisori "—◇—". */
export const LOGIN_DIVIDER_GRADIENT = `linear-gradient(to right, transparent, ${LOGIN_GOLD_SOFT}, transparent)`;

/**
 * Alone dorato "magico" applicato dietro l'intera FormCard: più intenso in
 * alto (dietro al logo) e sfumato verso il basso, per dare profondità arcana.
 */
export const LOGIN_MAGIC_BG = `radial-gradient(130% 90% at 50% 0%, rgba(201, 166, 107, 0.22) 0%, rgba(201, 166, 107, 0.08) 38%, transparent 68%)`;

/**
 * Valori da applicare via `style` sulla radice del Login.
 * Sono tipizzati come CSSProperties con index signature per le CSS vars.
 */
export const loginTokens: React.CSSProperties = {
  // superfici
  ["--bg" as string]: LOGIN_BG,
  ["--card" as string]: LOGIN_SURFACE,
  // testo
  ["--fg" as string]: "#3b2a1a",
  ["--muted-fg" as string]: "#7a6a55",
  ["--primary" as string]: "#a4161a",
  ["--muted" as string]: "#f3ecde",
  ["--accent" as string]: "#f5ede0",
  // bordi / input / focus
  ["--border" as string]: "#d8c39a",
  // stati
  ["--fail" as string]: "#c0392b",
  ["--succ" as string]: "#2b6e4e",
  // tipografia (istanza unica di Hanken Grotesk caricata in src/app/layout.tsx)
  ["--font-family" as string]: "var(--font-hanken-grotesk), sans-serif",
};
