import { describe, expect, it } from "vitest";
import { GENERIC_PAYPAL_ERROR, paypalErrorMessage } from "./paypal-errors";

describe("paypalErrorMessage", () => {
  it("mappa un issue noto", () => {
    const error = new Error(
      '.../confirm-payment-source returned status 422 (Corr ID: x). {"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"CARD_EXPIRED"}]}'
    );
    expect(paypalErrorMessage(error)).toBe("Carta scaduta");
  });

  it("ricava il messaggio dal campo quando l'issue è generico", () => {
    const error = new Error(
      '... {"details":[{"field":"/payment_source/card/number","issue":"VALIDATION_ERROR","description":"Invalid card number"}]}'
    );
    expect(paypalErrorMessage(error)).toBe("Numero di carta non valido");
  });

  it("torna al messaggio generico se non c'è JSON incorporato", () => {
    expect(paypalErrorMessage(new Error("popup closed"))).toBe(
      GENERIC_PAYPAL_ERROR
    );
  });

  it("torna al messaggio generico su JSON malformato o non-Error", () => {
    expect(paypalErrorMessage(new Error("status 500. {not json"))).toBe(
      GENERIC_PAYPAL_ERROR
    );
    expect(paypalErrorMessage("qualcosa")).toBe(GENERIC_PAYPAL_ERROR);
  });
});
