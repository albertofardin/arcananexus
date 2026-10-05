import { describe, it, expect } from "vitest";
import { parseCsvRows, parseCsvRecords, parseIdList } from "./csv";

describe("parseCsvRows (RFC4180, T-040)", () => {
  it("divide righe e campi semplici separati da virgola", () => {
    expect(parseCsvRows("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("gestisce un campo quotato con virgole interne", () => {
    expect(parseCsvRows('"id","nome"\n"1","Mario, il Rosso"\n')).toEqual([
      ["id", "nome"],
      ["1", "Mario, il Rosso"],
    ]);
  });

  it("gestisce virgolette raddoppiate (escape RFC4180) dentro un campo quotato", () => {
    // Caso reale: table_fazioni.csv, descrizione = """Fede è Fortezza"""
    expect(parseCsvRows('"d"\n"""Fede è Fortezza"""\n')).toEqual([
      ["d"],
      ['"Fede è Fortezza"'],
    ]);
  });

  it("gestisce un newline reale dentro un campo quotato (contenuto HTML multi-riga)", () => {
    const content = '"id","html"\n"1","<p>riga uno\nriga due</p>"\n';
    expect(parseCsvRows(content)).toEqual([
      ["id", "html"],
      ["1", "<p>riga uno\nriga due</p>"],
    ]);
  });

  it("non produce una riga vuota finale quando il file termina con newline", () => {
    expect(parseCsvRows("a,b\n1,2\n")).toHaveLength(2);
  });

  it("recupera l'ultimo record anche senza newline finale", () => {
    expect(parseCsvRows("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("mappa le righe sull'header in oggetti chiave/valore", () => {
    const records = parseCsvRecords('"id","nome"\n"1","Umano"\n"2","Elfo"\n');
    expect(records).toEqual([
      { id: "1", nome: "Umano" },
      { id: "2", nome: "Elfo" },
    ]);
  });

  it("normalizza la sentinella letterale NULL a stringa vuota", () => {
    const records = parseCsvRecords('"id","note"\n"1","NULL"\n"2","null"\n');
    expect(records).toEqual([
      { id: "1", note: "" },
      { id: "2", note: "" },
    ]);
  });

  it("segnala un mismatch di colonne come errore esplicito, non un troncamento silenzioso", () => {
    expect(() => parseCsvRecords('"a","b"\n"1"\n')).toThrow(
      /2 campi, attesi 2|attesi 2/i
    );
  });

  it("restituisce un array vuoto per un file senza righe dati (solo header)", () => {
    expect(parseCsvRecords('"a","b"\n')).toEqual([]);
  });
});

describe("parseIdList", () => {
  it("estrae una lista di interi da un campo comma-separated", () => {
    expect(parseIdList("127,16")).toEqual([127, 16]);
  });

  it("restituisce array vuoto per stringa vuota", () => {
    expect(parseIdList("")).toEqual([]);
  });

  it("ignora spazi attorno a virgole", () => {
    expect(parseIdList(" 24, 30 ,21")).toEqual([24, 30, 21]);
  });
});
