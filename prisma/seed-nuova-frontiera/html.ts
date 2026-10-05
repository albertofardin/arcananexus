import { JSDOM } from "jsdom";

// Alcuni campi dell'estrazione (es. `descrizione_completa` di
// `table_eventi.csv`/`table_dicerie.csv`) sono HTML esportato da Google Docs
// (tag di stile inline, entità come `&nbsp;`): il task vieta esplicitamente
// di salvarli grezzi (tag rimossi, entità decodificate). `jsdom` è già una
// devDependency della piattaforma (usata per l'ambiente dei test React) — la
// riusiamo qui invece di scrivere un decoder di entità a mano, che sarebbe
// solo una versione peggiore dello stesso problema già risolto da un parser
// HTML vero.
//
// Ogni blocco (`<p>`/`<div>`/`<li>`, il livello a cui Google Docs esporta un
// paragrafo) diventa una riga di testo; i blocchi sono uniti da una riga
// vuota per preservare la struttura a paragrafi. I tag inline dentro un
// blocco (`<span>`, `<b>`, ecc.) spariscono: `textContent` ne prende solo il
// testo, con le entità già decodificate dal parser HTML di jsdom.
export function cleanHtml(html: string): string {
  if (!html) return "";

  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const body = dom.window.document.body;

  const blocks = Array.from(body.querySelectorAll("p, div, li"))
    .map(el => (el.textContent ?? "").trim())
    .filter(text => text.length > 0);

  if (blocks.length > 0) {
    return blocks.join("\n\n");
  }

  // Nessun elemento di blocco (campo senza markup, o solo testo/entità
  // sciolte): il testo dell'intero body basta.
  return (body.textContent ?? "").trim();
}
