import { describe, it, expect } from "vitest";
import { bookingsToCsv } from "./eventBookingsCsv";
import type { EventBookingRow } from "@/lib/repositories/booking.repository";

const row = (overrides: Partial<EventBookingRow> = {}): EventBookingRow =>
  ({
    id: 1,
    addedByStaff: false,
    bookingDate: new Date("2026-07-01T10:00:00Z"),
    user: {
      id: "u1",
      name: "mario",
      email: "mario@example.it",
      PersonalData: { firstName: "Mario", lastName: "Rossi" },
    },
    character: { id: 1, name: "Gandalf" },
    payment: { value: 12.5 },
    note: null,
    ...overrides,
  }) as unknown as EventBookingRow;

describe("bookingsToCsv", () => {
  it("una riga per iscritto con persona e personaggio", () => {
    const csv = bookingsToCsv([row()]);
    const lines = csv.replace("﻿", "").split("\r\n");

    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"Mario Rossi";"Gandalf";"Giocatore";"12.50";"2026-07-01";""'
    );
  });

  it("include la nota del giocatore", () => {
    const csv = bookingsToCsv([row({ note: "solo gluten free" })]);

    expect(csv).toContain('"2026-07-01";"solo gluten free"');
  });

  it("neutralizza le formule e gli apici nei campi scelti dall'utente", () => {
    const csv = bookingsToCsv([
      row({ character: { id: 1, name: '=HYPERLINK("x")' } } as never),
    ]);

    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("prima lo staff, poi i giocatori, ciascuno in ordine alfabetico", () => {
    const person = (firstName: string, addedByStaff: boolean) =>
      row({
        addedByStaff,
        user: {
          id: firstName,
          name: firstName,
          email: "",
          PersonalData: { firstName, lastName: "X" },
        },
      } as never);
    const csv = bookingsToCsv([
      person("zoe", false),
      person("Bruno", true),
      person("anna", false),
      person("Aldo", true),
    ]);
    const names = csv
      .replace("﻿", "")
      .split("\r\n")
      .slice(1)
      .map(line => line.split(";")[0]);

    expect(names).toEqual(['"Aldo X"', '"Bruno X"', '"anna X"', '"zoe X"']);
  });

  it("staff senza personaggio né pagamento", () => {
    const csv = bookingsToCsv([
      row({ addedByStaff: true, character: null, payment: null }),
    ]);

    expect(csv).toContain('"";"Staff";"0.00"');
  });

  it("colonna Quota solo se l'evento ha quote alternative", () => {
    const csv = bookingsToCsv(
      [
        row(),
        row({ paymentOptionLabel: "gioco solo la domenica" }),
        row({ addedByStaff: true, payment: null }),
      ],
      true
    );
    const lines = csv.replace("\ufeff", "").split("\r\n");

    expect(lines[0]).toContain('"Pagato (€)";"Quota";"Iscritto il"');
    expect(lines[1]).toContain('"0.00";"";"2026-07-01"');
    expect(lines[2]).toContain('"12.50";"Quota base";"2026-07-01"');
    expect(lines[3]).toContain('"12.50";"gioco solo la domenica";"2026-07-01"');
    expect(bookingsToCsv([row()])).not.toContain("Quota");
  });
});
