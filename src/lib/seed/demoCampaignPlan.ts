// Numeri del PG d'esempio della campagna "Demo Metamodello" (T-023), estratti
// in un modulo condiviso così `prisma/seed.ts` (che li usa per costruire i
// `flags` delle `ReferenceData` e per l'assegnazione XP) e il test dedicato
// (`characterAssignment.test.ts`) non possono disallinearsi silenziosamente:
// se qui cambia un costo, cambia insieme per il seed e per l'asserzione di
// saldo, non in due punti scollegati.

// Razze con budget XP di partenza diverso (T-016 `ReferenceData.flags` per
// `kind: race`, campo `startingPx`).
export const RACE_STARTING_PX = {
  umano: 20,
  elfo: 15,
  nano: 25,
} as const;

// Talenti con costo XP (T-016 `ReferenceData.flags` per `kind: talent`).
export const TALENT_COSTS = {
  // Nessun prerequisito, acquistabile in creazione (`creationOnly: true`),
  // non ripetibile.
  lamaDelVeterano: 5,
  // `requires` "Lama del Veterano".
  fendenteImplacabile: 10,
  // Nascosto salvo appartenenza a fazione/religione (T-026,
  // `memberOfAnyFactionOrReligion`), ripetibile.
  codiceDegliIniziati: 3,
  // `requires` "Fede Incrollabile" (mai assegnata al PG): acquistabile solo
  // in deroga del master (`grantedByOverride`).
  donoProibitoDelSangueNero: 15,
} as const;

// Saldo XP atteso del PG demo "Aurelio delle Nebbie" al termine del seed:
// grant iniziale (razza Umano) meno i quattro acquisti, incluso quello in
// deroga del master che va comunque a debito anche senza XP sufficienti
// (`debitTalent` con `allowOverride: true` salta solo il check di
// disponibilità, non l'addebito) — il saldo finale negativo è intenzionale:
// dimostra che l'override del master può portare il PG sotto zero, cosa che
// il flusso normale (senza deroga) non permetterebbe mai.
export const DEMO_CHARACTER_EXPECTED_XP_BALANCE =
  RACE_STARTING_PX.umano -
  TALENT_COSTS.lamaDelVeterano -
  TALENT_COSTS.fendenteImplacabile -
  TALENT_COSTS.codiceDegliIniziati -
  TALENT_COSTS.donoProibitoDelSangueNero;
