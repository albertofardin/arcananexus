/**
 * Formatta un importo (stringa decimale) in euro, es. "25,00 €".
 */
const formatCurrency = (value: string): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(parseFloat(value));

export default formatCurrency;
