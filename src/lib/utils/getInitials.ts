/**
 * Ricava le iniziali (max 2 lettere) da un nome completo.
 * Ritorna stringa vuota se il nome non contiene lettere: spetta al
 * chiamante decidere l'eventuale fallback (es. `getInitials(name) || "?"`).
 */
const getInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default getInitials;
