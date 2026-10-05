import z from "zod";
import { characterEditableFields } from "./character";

// Un'assegnazione di catalogo scelta dal richiedente per il nuovo PG
// (razza, religione, talento di creazione…). `value` è la forma libera che
// `assignReferenceDataToCharacter` (T-017) salva su `CharacterData.value`
// (es. risposte di un form) — validata qui solo come "JSON qualsiasi",
// il servizio non ne conosce la shape specifica.
export const characterAssignmentInputSchema = z
  .object({
    referenceDataId: z.number().int().positive(),
    value: z.unknown().optional(),
  })
  .strict();

export type CharacterAssignmentInput = z.infer<
  typeof characterAssignmentInputSchema
>;

// Payload di `POST /api/campaigns/[campaignSlug]/characters` (T-018): dati
// base del PG (stessi campi editabili di `character.ts`, tutti opzionali
// tranne `name`) + lista di assegnazioni di catalogo. `userId` è riservato
// allo staff (master/head_master) che crea un PG per conto di un altro
// utente — la route lo ignora/rifiuta per il self-assign del giocatore.
//
// `referenceDataId` duplicati nella stessa richiesta sono rifiutati SOLO se
// almeno una delle occorrenze porta un `value` esplicito: in quel caso resta
// ambiguo quale `value` vince. Senza `value` (il caso di ogni talento, incluso
// uno ripetibile scelto più volte in creazione, T-0xx) i duplicati sono
// legittimi — ogni occorrenza è una richiesta di apprendimento indipendente,
// e il tetto reale (`repeatable`/`maxRepetitions`) è imposto da
// `assignReferenceDataToCharacter` una voce alla volta, nello stesso ordine.
//
// Nota (T-018): questo schema valida solo la *forma* del payload, non la
// validità delle singole `referenceDataId` rispetto al catalogo — nessuno dei
// vincoli (`assignability`, `cardinality`, `creationOnly`, requisiti/XP) è
// verificabile in uno Zod schema puramente sincrono, senza accesso al DB.
// Sono tutti applicati lato route/servizio
// (`assignReferenceDataToCharacter`), non qui.
export const createCharacterWithCatalogSchema = characterEditableFields
  .partial()
  .extend({
    name: z.string().trim().min(1).max(200),
    // Sovrascrive `background` (opzionale via `.partial()` sopra) solo per
    // questa route di creazione via catalogo: obbligatorio come nome/kind
    // identitari `mandatory` (validazione di form base, non un vincolo di
    // gioco bypassabile). `/api/characters` e l'update del PG restano su
    // `characterEditableFields.background` (opzionale), fuori scope.
    background: z
      .string()
      .trim()
      .min(1, "Il background del personaggio è obbligatorio")
      .max(20000),
    userId: z.string().min(1).optional(),
    assignments: z.array(characterAssignmentInputSchema).default([]),
    // Aggiornamento XP del master in fase di creazione (T-0xx):
    // non è un campo `Character`, registra
    // una `XpTransaction` (`reason: update`) sul PG appena creato. Solo il
    // master può inviarlo (`isMasterOrAbove`, verificato lato route).
    xpUpdate: z.number().int().optional(),
  })
  .strict()
  .refine(
    data => {
      const idsWithValue = new Set<number>();
      for (const assignment of data.assignments) {
        if (assignment.value !== undefined) {
          idsWithValue.add(assignment.referenceDataId);
        }
      }
      const counts = new Map<number, number>();
      for (const assignment of data.assignments) {
        counts.set(
          assignment.referenceDataId,
          (counts.get(assignment.referenceDataId) ?? 0) + 1
        );
      }
      for (const [id, count] of counts) {
        if (count > 1 && idsWithValue.has(id)) return false;
      }
      return true;
    },
    {
      message: "Voci di catalogo duplicate nella stessa richiesta",
      path: ["assignments"],
    }
  );

export type CreateCharacterWithCatalogInput = z.infer<
  typeof createCharacterWithCatalogSchema
>;
