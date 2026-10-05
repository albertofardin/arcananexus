// L'SDK PayPal client-side (onError di PayPalButtons / PayPalCardFieldsProvider)
// passa un errore il cui `message` è il testo grezzo della risposta REST, es:
// ".../confirm-payment-source returned status 422 (Corr ID: xxx). {"name":...,"details":[{"field":"/payment_source/card/number","issue":"VALIDATION_ERROR","description":"Invalid card number"}]}"
// Qui estraiamo il JSON incorporato per mostrare un messaggio comprensibile.

const ISSUE_MESSAGES: Record<string, string> = {
  CARD_EXPIRED: "Carta scaduta",
  EXPIRED_CARD: "Carta scaduta",
  INVALID_CARD_NUMBER: "Numero di carta non valido",
  INVALID_EXPIRY: "Data di scadenza non valida",
  INVALID_SECURITY_CODE: "Codice di sicurezza (CVV) non valido",
  INSUFFICIENT_FUNDS: "Fondi insufficienti sulla carta",
  TRANSACTION_REFUSED:
    "Pagamento rifiutato dalla banca, riprova con un altro metodo",
  INSTRUMENT_DECLINED:
    "Carta rifiutata, riprova con un altro metodo di pagamento",
  CARD_TYPE_NOT_SUPPORTED: "Tipo di carta non supportato",
  PAYER_CANNOT_PAY:
    "Impossibile completare il pagamento con questo account PayPal",
};

// Quando l'issue è il generico VALIDATION_ERROR, il campo del payload indica
// quale dato non è valido (es. "/payment_source/card/number").
const FIELD_MESSAGES: Record<string, string> = {
  number: "Numero di carta non valido",
  security_code: "Codice di sicurezza (CVV) non valido",
  expiry: "Data di scadenza non valida",
  name: "Nome sulla carta non valido",
};

export const GENERIC_PAYPAL_ERROR =
  "Pagamento non riuscito, controlla i dati inseriti e riprova";

export function paypalErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return GENERIC_PAYPAL_ERROR;

  let body: { details?: { issue?: string; field?: string }[] };
  try {
    body = JSON.parse(raw.slice(jsonStart));
  } catch {
    return GENERIC_PAYPAL_ERROR;
  }

  const detail = body?.details?.[0];
  if (!detail) return GENERIC_PAYPAL_ERROR;

  if (detail.issue && ISSUE_MESSAGES[detail.issue]) {
    return ISSUE_MESSAGES[detail.issue];
  }
  const field = detail.field?.split("/").pop();
  return (field && FIELD_MESSAGES[field]) || GENERIC_PAYPAL_ERROR;
}
