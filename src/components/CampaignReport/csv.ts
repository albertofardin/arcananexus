// CSV client-side, senza dipendenze (né xlsx né papaparse, vedi task): un
// CSV con escaping RFC4180 si apre nativamente in Excel, quindi copre il
// requisito "csv o xlsx" senza aggiungere una libreria.

// Un campo va tra virgolette se contiene il separatore, una virgoletta o un
// a-capo; le virgolette interne raddoppiano.
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// `\r\n` (non solo `\n`): riga di fine record CSV più compatibile con
// Excel su Windows, che è il target dichiarato dal task.
export function buildCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCsvField).join(",")).join("\r\n");
}

// Trigger di download client-side via Blob + `<a>` temporaneo: nessuna
// libreria, nessuna route server dedicata.
export function downloadCsv(filename: string, content: string): void {
  // BOM UTF-8: senza, Excel interpreta gli accenti italiani come caratteri
  // errati aprendo il CSV.
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
