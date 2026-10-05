import type { EventBookingRow } from "@/lib/repositories/booking.repository";

// Separatore `;` + BOM: si apre correttamente in Excel con locale italiano.
// Un prefisso `'` neutralizza le formule (=, +, -, @) in campi scelti dall'utente.
const escape = (value: string) =>
  `"${value.replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;

export const personName = (row: EventBookingRow) =>
  row.user.PersonalData
    ? `${row.user.PersonalData.firstName} ${row.user.PersonalData.lastName}`
    : row.user.name;

// La colonna "Quota" c'è solo se l'evento ha quote alternative (o se qualche
// iscritto ne ha scelta una poi rimossa dall'evento).
export function bookingsToCsv(
  rows: EventBookingRow[],
  hasPaymentOptions = false
): string {
  const showOption =
    hasPaymentOptions || rows.some(row => row.paymentOptionLabel);
  const header = [
    "Persona",
    "Personaggio",
    "Tipo",
    "Pagato (€)",
    ...(showOption ? ["Quota"] : []),
    "Iscritto il",
    "Note",
  ];
  // Prima lo staff, poi i giocatori; in ogni gruppo ordine alfabetico per persona.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.addedByStaff) - Number(a.addedByStaff) ||
      personName(a).localeCompare(personName(b), "it", { sensitivity: "base" })
  );
  const lines = sorted.map(row =>
    [
      personName(row),
      row.character?.name ?? "",
      row.addedByStaff ? "Staff" : "Giocatore",
      row.payment ? Number(row.payment.value).toFixed(2) : "0.00",
      ...(showOption
        ? [row.paymentOptionLabel ?? (row.payment ? "Quota base" : "")]
        : []),
      row.bookingDate.toISOString().slice(0, 10),
      row.note ?? "",
    ]
      .map(escape)
      .join(";")
  );
  return `﻿${[header.map(escape).join(";"), ...lines].join("\r\n")}`;
}
