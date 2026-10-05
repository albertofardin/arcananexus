/**
 * Formatta una data in italiano esteso, es. "15 ottobre 2025".
 */
const formatDate = (date: Date, withTime = false): string =>
  new Intl.DateTimeFormat("it-IT", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit" }),
  }).format(date);

export default formatDate;
