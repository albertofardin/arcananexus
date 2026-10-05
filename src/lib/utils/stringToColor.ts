/**
 * Deriva una tonalità (0–359) in modo deterministico da una stringa.
 * Lo stesso input produce sempre lo stesso valore, input diversi tendono
 * a distribuirsi su tutto il cerchio cromatico.
 */
const stringToHue = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // forza a intero a 32 bit
  }
  return Math.abs(hash) % 360;
};

/**
 * Colore di sfondo univoco e stabile per una stringa (es. il nome utente).
 * Saturazione e luminosità sono fisse e scelte perché il testo bianco
 * risulti sempre leggibile sopra il colore generato.
 */
const stringToColor = (str: string): string =>
  `hsl(${stringToHue(str)}, 60%, 42%)`;

export default stringToColor;
