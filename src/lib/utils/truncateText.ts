// Anteprima breve di un testo multiriga (meta description).
export default function truncateText(
  text: string | null | undefined,
  max = 200
) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
