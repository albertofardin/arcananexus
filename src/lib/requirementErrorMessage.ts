// Formattazione condivisa del dettaglio di `RequirementsNotSatisfiedError`
// (T-017/T-039, `characterData.service.ts`) per i toast di errore lato
// client. Entrambe le route che possono rifiutare per requisiti non
// soddisfatti (`characters/route.ts`, creazione PG, e
// `characters/[characterId]/actions/route.ts`, azioni feature) serializzano
// `error.evaluation` come `details` sulla risposta 422 con la stessa forma —
// vedi `RequirementEvaluation` in `characterData.service.ts`. Estratto da
// `CharacterCreationForm.mapSubmitErrorMessage` (T-043) e riusato anche da
// `ModalTalentsLearn`, per evitare di duplicare questa logica nei
// componenti che possono ricevere un 422 di requisiti.
export interface RequirementEvaluationErrorDetails {
  missingRequires?: { name: string }[];
  // OR-group non soddisfatti (T-039): stessa forma di
  // `RequirementEvaluation.missingRequirementGroups`.
  missingRequirementGroups?: { name: string }[][];
  blockingConflicts?: { name: string }[];
  // Soglia XP e saldo disponibile (T-044): stessi campi di
  // `RequirementEvaluation.xpCost`/`xpAvailable`/`xpSufficient`
  // (`characterData.service.ts`) — il rifiuto server può essere dovuto
  // *solo* a `xpSufficient === false` (requisiti/conflitti già tutti
  // soddisfatti), quindi vanno letti allo stesso titolo degli altri campi,
  // non solo quando accompagnano un requisito mancante.
  xpCost?: number | null;
  xpAvailable?: number;
  xpSufficient?: boolean;
}

export function isEvaluationErrorDetails(
  details: unknown
): details is RequirementEvaluationErrorDetails {
  return (
    !!details &&
    typeof details === "object" &&
    ("missingRequires" in details ||
      "missingRequirementGroups" in details ||
      "blockingConflicts" in details ||
      "xpSufficient" in details)
  );
}

// Costruisce il messaggio completo per il toast a partire dal messaggio base
// (già in italiano lato server) e dal dettaglio dei requisiti: elenca i nomi
// dei requisiti individuali mancanti, i gruppi OR mancanti in forma "almeno
// una tra: X, Y", gli eventuali conflitti bloccanti già posseduti (solo in
// assenza di requisiti mancanti, stessa scelta di T-039) e, in coda,
// un'indicazione esplicita quando `xpSufficient === false` (T-044): quel
// campo può essere l'unico problema (tutti gli altri vuoti — lo scenario
// originale di questo task) o comparire insieme a requisiti/conflitti
// mancanti, quindi si accoda invece di sostituire il resto del messaggio.
// Stesso stile testuale già usato per `InsufficientXpError` in
// `mapSubmitErrorMessage` ("disponibili X XP, richiesti Y XP"), ma qui la
// fonte è `RequirementEvaluation` (percorso self-assign), non l'eccezione
// dedicata (percorso master/`debitTalent` con override).
export function formatRequirementEvaluationMessage(
  base: string,
  details: RequirementEvaluationErrorDetails
): string {
  const parts: string[] = [];
  const missing = details.missingRequires?.map(r => r.name).join(", ");
  if (missing) parts.push(`manca "${missing}"`);
  // Il rifiuto server può essere dovuto solo a un OR-group insoddisfatto
  // (T-039, criterio #4 review round 1): senza questo, `parts` resterebbe
  // vuoto e il messaggio non direbbe nulla di utile.
  for (const group of details.missingRequirementGroups ?? []) {
    const alternatives = group.map(r => r.name).join(", ");
    if (alternatives) parts.push(`almeno una tra: ${alternatives}`);
  }
  if (parts.length === 0) {
    const blocking = details.blockingConflicts?.map(r => r.name).join(", ");
    if (blocking) parts.push(`in conflitto con "${blocking}"`);
  }
  if (details.xpSufficient === false) {
    parts.push(
      `XP insufficienti (disponibili ${details.xpAvailable} XP, richiesti ${details.xpCost} XP)`
    );
  }
  if (parts.length === 0) return base;
  return `${base}: ${parts.join("; ")}`;
}
