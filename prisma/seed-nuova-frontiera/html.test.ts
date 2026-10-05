import { describe, it, expect } from "vitest";
import { cleanHtml } from "./html";

describe("cleanHtml (T-040)", () => {
  it("rimuove i tag e unisce i paragrafi con una riga vuota", () => {
    const html = "<p>Primo paragrafo.</p><p>Secondo paragrafo.</p>";
    expect(cleanHtml(html)).toBe("Primo paragrafo.\n\nSecondo paragrafo.");
  });

  it("decodifica le entità HTML (es. &nbsp;) invece di lasciarle grezze", () => {
    const html = '<p><span style="font-size:8pt;">Prima&nbsp;Dopo</span></p>';
    // `&nbsp;` decodificata in U+00A0 (non la stringa letterale "&nbsp;"),
    // qui in mezzo alla parola cosi' non viene rimossa dal `.trim()` finale.
    expect(cleanHtml(html)).toBe("Prima Dopo");
  });

  it("rimuove i tag inline (span/b/i) mantenendone solo il testo", () => {
    const html =
      '<p><b style="font-weight:normal;">Titolo</b> testo <i>corsivo</i></p>';
    expect(cleanHtml(html)).toBe("Titolo testo corsivo");
  });

  it("ignora i paragrafi vuoti (es. <p><br></p> di Google Docs)", () => {
    const html = "<p>Prima.</p><p><br></p><p>Dopo.</p>";
    expect(cleanHtml(html)).toBe("Prima.\n\nDopo.");
  });

  it("gestisce un campo senza markup (solo testo)", () => {
    expect(cleanHtml("Solo testo semplice")).toBe("Solo testo semplice");
  });

  it("restituisce stringa vuota per input vuoto", () => {
    expect(cleanHtml("")).toBe("");
  });
});
