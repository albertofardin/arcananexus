import {
  DataCardinality,
  DataTypeAssignability,
  DataVisibility,
  RequirementType,
  type Character,
  type CharacterData,
  type PrismaClient,
  type Prisma,
  type ReferenceData,
  type XpTransaction,
} from "@prisma/client";
import {
  listIncomingRequirements,
  listOutgoingRequirements,
  listOutgoingRequirementsForDefinitions,
} from "@/lib/repositories/dataRequirement.repository";
import {
  createCharacterData,
  deleteCharacterDataByDataType,
  countCharacterDataByCharacterAndReferenceData,
  listCharacterDataForCharacter,
} from "@/lib/repositories/characterData.repository";
import { grantCharacterPointBonus } from "@/lib/repositories/character.repository";
import type { ReferenceDataWithDataType } from "@/lib/repositories/referenceData.repository";
import { debitTalent, getXpBalance } from "@/lib/services/xp.service";
import type { PrismaTransactionClient } from "@/lib/repositories/types";

// Servizio di assegnazione dati-personaggio (T-017): il cuore delle regole
// di scheda PG, riusato dalla creazione PG (T-018), dalla concessione
// manuale del master, e dall'esecuzione azioni approvate (T-019, es.
// downtime "apprendi talento").

// Legge un flag opzionale da `ReferenceData.flags` (JSON libero per-`kind`,
// validato a monte dallo Zod di T-016) senza mai lanciare: a differenza di
// `readNumericFlag` in `xp.service.ts` (che pretende il flag, es. il
// `startingPx` di una razza), qui il flag può legittimamente non esistere
// per il `kind` corrente (es. `cost`/`repeatable`/`creationOnly` esistono
// solo per `talent`) — l'assenza è "nessuna soglia/regola dichiarata", non
// un errore.
function readOptionalNumericFlag(
  flags: Prisma.JsonValue,
  key: string
): number | undefined {
  const value =
    flags && typeof flags === "object" && !Array.isArray(flags)
      ? (flags as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "number" ? value : undefined;
}

function readOptionalBooleanFlag(
  flags: Prisma.JsonValue,
  key: string
): boolean | undefined {
  const value =
    flags && typeof flags === "object" && !Array.isArray(flags)
      ? (flags as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "boolean" ? value : undefined;
}

export interface RequirementEvaluation {
  // Definizioni `requires` senza `groupId` (individuali, AND) che il PG non
  // possiede ancora — ciascuna obbligatoria per conto proprio.
  missingRequires: ReferenceData[];
  // OR-group `requires` (righe che condividono lo stesso `groupId` sulla
  // stessa `definition`, vedi `DataRequirement.groupId` in schema.prisma)
  // di cui il PG non possiede ALMENO UNA voce: un array per gruppo non
  // soddisfatto, con le definizioni alternative di quel gruppo (per poter
  // mostrare "serve X oppure Y oppure Z"). Un gruppo con almeno una voce
  // posseduta non compare qui.
  missingRequirementGroups: ReferenceData[][];
  // Definizioni possedute dal PG in mutua esclusione (`blocks`) con questa
  // voce, in entrambe le direzioni dell'arco (uscente: questa voce blocca
  // quella posseduta; entrante: quella posseduta blocca questa voce).
  blockingConflicts: ReferenceData[];
  // Soglia XP dichiarata in `flags.cost` (solo `talent`); `null` se la
  // definizione non ne ha una.
  xpCost: number | null;
  // Saldo XP disponibile del PG al momento della valutazione (`available`,
  // via `xp.service.getXpBalance`).
  xpAvailable: number;
  xpSufficient: boolean;
  // `true` solo se grafo requisiti (requires + blocks) e soglia XP sono
  // entrambi soddisfatti.
  satisfied: boolean;
}

// Valuta se un PG soddisfa i requisiti "soft" di una definizione di
// catalogo: il grafo `DataRequirement` (`requires`/`blocks`, contro le
// `CharacterData` già possedute) *e* la soglia numerica XP nei `flags`
// (`cost`, confrontato con il saldo disponibile via T-025). Non lancia mai:
// ritorna sempre una valutazione completa, è `assignReferenceDataToCharacter`
// a decidere se rifiutare (self-assign) o accettare con override (master).
//
// `blocks` è un'esclusione simmetrica (commento su `listIncomingRequirements`
// in `dataRequirement.repository.ts`, T-016): un arco `A blocks B` deve
// bloccare l'assegnazione sia di B mentre si possiede A, sia di A mentre si
// possiede B, indipendentemente da quale dei due lati è "uscente" nell'arco.
// Per questo qui si uniscono sia gli archi uscenti da `definition`
// (`listOutgoingRequirements`, che coprono anche `requires`) sia quelli
// entranti (`listIncomingRequirements`, solo `blocks`): un arco uscente
// bloccante rileva il caso "definition blocca X, il PG possiede X"; un arco
// entrante bloccante rileva il caso simmetrico "Y blocca definition, il PG
// possiede Y". `requires` resta intenzionalmente solo outgoing: è
// unidirezionale per natura (nessun caso simmetrico da coprire).
//
// Lettura componibile dentro `prisma.$transaction` (T-018: `listOutgoing/
// IncomingRequirements` accettano `PrismaTransactionClient` come `listCharacter
// DataForCharacter`/`getXpBalance`) — ma resta comunque chiamata anche
// *fuori* da una transazione dal path self-assign "sola valutazione" di
// `assignReferenceDataToCharacter` sotto (pre-check prima di aprire/riusare
// la transazione di scrittura). La finestra TOCTOU fra quel pre-check e il
// commit della transazione di scrittura è la stessa accettata da
// `debitTalent`/`getXpBalance` (T-025): mitigata (non eliminata) dal
// ricontrollo interno di `debitTalent` quando l'addebito non è in override.
export async function evaluateRequirements(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  definition: ReferenceDataWithDataType
): Promise<RequirementEvaluation> {
  const [outgoingEdges, incomingEdges, owned, balance] = await Promise.all([
    listOutgoingRequirements(prisma, definition.id),
    listIncomingRequirements(prisma, definition.id),
    listCharacterDataForCharacter(prisma, character.id),
    getXpBalance(prisma, character.id),
  ]);

  const ownedReferenceDataIds = new Set(owned.map(cd => cd.referenceDataId));

  const requiresEdges = outgoingEdges.filter(
    edge => edge.type === RequirementType.requires
  );

  // Righe senza `groupId`: requisito individuale, invariato (AND) — ciascuna
  // obbligatoria per conto proprio, indipendentemente dalle altre. `== null`
  // (non `===`) copre sia `null` (valore reale da Prisma) sia `undefined`
  // (fixture di test più vecchie di questo campo, T-0xx OR-group).
  const missingRequires = requiresEdges
    .filter(
      edge =>
        edge.groupId == null &&
        !ownedReferenceDataIds.has(edge.requiredDefinitionId)
    )
    .map(edge => edge.requiredDefinition);

  // Righe con `groupId`: raggruppate per (`groupId`) — la `definitionId` è
  // già fissa (tutti gli `outgoingEdges` partono dalla stessa `definition`,
  // vedi `listOutgoingRequirements`), quindi `groupId` da solo è già la
  // chiave del gruppo in questo contesto. Un gruppo è soddisfatto se il PG
  // possiede ALMENO UNA delle voci richieste (OR); altrimenti l'intero
  // gruppo (tutte le sue alternative) finisce in `missingRequirementGroups`
  // per poter mostrare "serve X oppure Y" al chiamante.
  const groupedRequiresEdges = new Map<number, typeof requiresEdges>();
  for (const edge of requiresEdges) {
    if (edge.groupId == null) continue;
    const group = groupedRequiresEdges.get(edge.groupId) ?? [];
    group.push(edge);
    groupedRequiresEdges.set(edge.groupId, group);
  }
  const missingRequirementGroups: ReferenceData[][] = [];
  for (const group of groupedRequiresEdges.values()) {
    const groupSatisfied = group.some(edge =>
      ownedReferenceDataIds.has(edge.requiredDefinitionId)
    );
    if (!groupSatisfied) {
      missingRequirementGroups.push(group.map(edge => edge.requiredDefinition));
    }
  }

  const outgoingBlockingConflicts = outgoingEdges
    .filter(
      edge =>
        edge.type === RequirementType.blocks &&
        ownedReferenceDataIds.has(edge.requiredDefinitionId)
    )
    .map(edge => edge.requiredDefinition);

  // Simmetrico agli outgoing sopra: un arco entrante `Y blocks definition`
  // (`edge.definition` = Y) blocca l'assegnazione se il PG possiede Y.
  const incomingBlockingConflicts = incomingEdges
    .filter(
      edge =>
        edge.type === RequirementType.blocks &&
        ownedReferenceDataIds.has(edge.definitionId)
    )
    .map(edge => edge.definition);

  // Dedup by id: un catalogo potrebbe (in teoria, non impedito a monte)
  // avere sia `A blocks B` sia `B blocks A` per la stessa coppia — evita di
  // riportare due volte la stessa definizione in conflitto.
  const seenBlockingIds = new Set<number>();
  const blockingConflicts: ReferenceData[] = [];
  for (const conflict of [
    ...outgoingBlockingConflicts,
    ...incomingBlockingConflicts,
  ]) {
    if (!seenBlockingIds.has(conflict.id)) {
      seenBlockingIds.add(conflict.id);
      blockingConflicts.push(conflict);
    }
  }

  const xpCost = readOptionalNumericFlag(definition.flags, "cost") ?? null;
  const xpSufficient = xpCost === null || balance.available >= xpCost;

  return {
    missingRequires,
    missingRequirementGroups,
    blockingConflicts,
    xpCost,
    xpAvailable: balance.available,
    xpSufficient,
    satisfied:
      missingRequires.length === 0 &&
      missingRequirementGroups.length === 0 &&
      blockingConflicts.length === 0 &&
      xpSufficient,
  };
}

// Rifiuto esplicito (T-042) quando `sortAssignmentsByRequirements` non
// riesce a piazzare tutte le voci del batch in nessun ordine: un ciclo
// *interno al batch* (es. A richiede B, B richiede A, nessuna delle due già
// posseduta) non è risolvibile riordinando. Distinto da
// `RequirementsNotSatisfiedError` (che riguarda una singola voce contro i
// dati già posseduti dal PG, con la valutazione completa allegata): qui il
// problema è strutturale al batch selezionato, non c'è un'unica voce da
// puntare.
export class RequirementBatchCycleError extends Error {
  constructor() {
    super(
      "Il gruppo di voci selezionate contiene una dipendenza circolare tra requisiti, non risolvibile in nessun ordine di assegnazione."
    );
    this.name = "RequirementBatchCycleError";
  }
}

// Ordina `assignments` (T-042) in un ordine topologico rispetto al grafo
// `requires` (AND individuali + OR-group), così che un chiamante che
// assegna voce per voce dentro un'unica transazione (`characters/route.ts`,
// creazione PG) non dipenda dall'ordine di arrivo dal client — che segue
// l'ordine di selezione/click dell'utente in UI, non un ordine topologico
// (diagnosi completa in `.task/042-ordine-assegnazione-batch-creazione-pg.md`).
//
// Riusa la stessa semantica AND/OR di `evaluateRequirements` (non la
// reimplementa): una voce è "pronta" quando ogni suo requisito individuale
// (`groupId` nullo) è già posseduto dal PG *oppure* già ordinata prima nel
// batch, e ogni suo OR-group (`groupId` non nullo) ha almeno un'alternativa
// già posseduta o già ordinata prima. Un requisito che non fa parte del
// batch e che il PG non possiede non può diventare vero riordinando: non
// blocca l'ordinamento (altrimenti un batch con un requisito genuinamente
// mancante verrebbe scambiato per un ciclo) — la voce viene comunque
// piazzata, e sarà poi `assignReferenceDataToCharacter` a rifiutarla con il
// consueto `RequirementsNotSatisfiedError` informativo quando la valuta per
// davvero.
//
// Implementazione: Kahn "a passate" — ad ogni passata piazza tutte le voci
// pronte (finché il set `remaining` non è vuoto); se una passata intera non
// piazza nulla, il residuo è un ciclo *interno al batch* non risolvibile →
// `RequirementBatchCycleError` invece di un loop infinito.
export async function sortAssignmentsByRequirements<
  T extends { definition: ReferenceDataWithDataType },
>(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  assignments: readonly T[]
): Promise<T[]> {
  if (assignments.length <= 1) return [...assignments];

  const definitionIds = assignments.map(a => a.definition.id);
  const batchIds = new Set(definitionIds);

  const [edges, owned] = await Promise.all([
    listOutgoingRequirementsForDefinitions(prisma, definitionIds),
    listCharacterDataForCharacter(prisma, character.id),
  ]);
  const ownedIds = new Set(owned.map(cd => cd.referenceDataId));

  // Requisiti individuali (AND, `groupId` nullo) per `definitionId`.
  const individualRequires = new Map<number, number[]>();
  // OR-group per `definitionId`: un array di gruppi, ciascuno le sue
  // alternative (`requiredDefinitionId` che condividono lo stesso `groupId`
  // sulla stessa voce, stessa chiave usata da `evaluateRequirements`).
  const orGroupsByDefinition = new Map<number, number[][]>();
  const orGroupAlternativesByKey = new Map<string, number[]>();

  for (const edge of edges) {
    if (edge.type !== RequirementType.requires) continue;
    if (edge.groupId == null) {
      const list = individualRequires.get(edge.definitionId) ?? [];
      list.push(edge.requiredDefinitionId);
      individualRequires.set(edge.definitionId, list);
    } else {
      const key = `${edge.definitionId}:${edge.groupId}`;
      const list = orGroupAlternativesByKey.get(key) ?? [];
      list.push(edge.requiredDefinitionId);
      orGroupAlternativesByKey.set(key, list);
    }
  }
  for (const [key, alternatives] of orGroupAlternativesByKey) {
    const definitionId = Number(key.slice(0, key.indexOf(":")));
    const groups = orGroupsByDefinition.get(definitionId) ?? [];
    groups.push(alternatives);
    orGroupsByDefinition.set(definitionId, groups);
  }

  // Array (non una `Map` per `definition.id`): un talento ripetibile scelto
  // più di una volta produce più voci con lo STESSO `definition.id` nello
  // stesso batch (T-0xx), e una `Map` le collasserebbe silenziosamente in
  // una sola, perdendo le assegnazioni successive.
  let remaining: T[] = [...assignments];
  const placedIds = new Set<number>();
  const sorted: T[] = [];

  const isReady = (definitionId: number): boolean => {
    for (const requiredId of individualRequires.get(definitionId) ?? []) {
      if (ownedIds.has(requiredId) || placedIds.has(requiredId)) continue;
      // Ancora nel batch e non ancora piazzato: blocca finché non lo è.
      if (batchIds.has(requiredId)) return false;
      // Fuori dal batch e non posseduto: nessun riordino lo risolve, non è
      // un motivo per bloccare l'ordinamento (vedi commento sopra).
    }
    for (const alternatives of orGroupsByDefinition.get(definitionId) ?? []) {
      const groupSatisfied = alternatives.some(
        id => ownedIds.has(id) || placedIds.has(id)
      );
      if (groupSatisfied) continue;
      const hasPendingBatchAlternative = alternatives.some(id =>
        batchIds.has(id)
      );
      if (hasPendingBatchAlternative) return false;
    }
    return true;
  };

  while (remaining.length > 0) {
    const ready: T[] = [];
    const notReady: T[] = [];
    for (const assignment of remaining) {
      (isReady(assignment.definition.id) ? ready : notReady).push(assignment);
    }
    if (ready.length === 0) {
      throw new RequirementBatchCycleError();
    }
    for (const assignment of ready) {
      sorted.push(assignment);
      placedIds.add(assignment.definition.id);
    }
    remaining = notReady;
  }

  return sorted;
}

// Invariante cross-tenant (fondamentale, T-017): la definizione deve
// appartenere alla stessa campagna del PG. Dedicata (non un `Error` generico
// come altri invarianti di `xp.service.ts`) perché il chiamante HTTP (T-018)
// la mappa su 404 — stesso trattamento di `getReferenceDataByIdScoped`, che
// non fa trapelare l'esistenza di voci di altre campagne.
export class CrossCampaignAssignmentError extends Error {
  constructor() {
    super("La voce di catalogo non appartiene alla campagna del personaggio.");
    this.name = "CrossCampaignAssignmentError";
  }
}

// Rifiuto self-assign: il `DataType` non è `assignability: "always" |
// "creationOnly"` (solo il master può assegnarlo — `"none"`/`"masterOnly"`).
export class PlayerAssignmentNotAllowedError extends Error {
  constructor() {
    super("Questa voce di catalogo non è assegnabile dal giocatore.");
    this.name = "PlayerAssignmentNotAllowedError";
  }
}

// Rifiuto strutturale (T-035, entrambi i percorsi — self-assign e master):
// `dataType.cardinality` è `null`, cioè `assignability: "none"` per
// l'invariante applicata in `validations/dataType.ts` (fisso per `kind:
// "generic"`) — questa categoria non è mai assegnabile a un personaggio, a
// prescindere da chi tenta l'assegnazione. A differenza di
// `PlayerAssignmentNotAllowedError` (un gate di permesso, bypassato dal
// master), questo è un vincolo di modellazione: non c'è una regola di
// cardinalità da applicare (single sostituisce / multi accumula), quindi
// nessuna assegnazione ha senso, nemmeno in deroga.
export class NotAssignableDataTypeError extends Error {
  constructor() {
    super(
      "Questa categoria di dato non è assegnabile a un personaggio (nessuna cardinalità configurata)."
    );
    this.name = "NotAssignableDataTypeError";
  }
}

// Rifiuto self-assign (T-047/T-048): `dataType.assignability ===
// "creationOnly"` (fisso per `kind: "origins"`, scelto dall'admin per
// `kind: "assignable"`/`"talent"`), ma il PG non è in fase di creazione —
// stesso rifiuto, riusato anche per `flags.creationOnly` (talent, per-voce)
// sotto.
export class CreationOnlyAssignmentError extends Error {
  constructor() {
    super("Questa voce di catalogo è assegnabile solo in creazione del PG.");
    this.name = "CreationOnlyAssignmentError";
  }
}

// Rifiuto self-assign: `evaluateRequirements` non è soddisfatta (grafo
// requisiti e/o soglia XP). Porta con sé la valutazione completa, così il
// chiamante HTTP può riportare al giocatore cosa manca.
export class RequirementsNotSatisfiedError extends Error {
  readonly evaluation: RequirementEvaluation;

  constructor(evaluation: RequirementEvaluation) {
    super("I requisiti per questa voce di catalogo non sono soddisfatti.");
    this.name = "RequirementsNotSatisfiedError";
    this.evaluation = evaluation;
  }
}

// Rifiuto strutturale (entrambi i percorsi, self-assign e master): il PG ha
// già raggiunto il tetto di istanze consentite della stessa definizione
// (solo cardinalità `multi` — `single` sostituisce sempre, non "duplica").
// Tetto = 1 quando `flags.repeatable` è `false`, altrimenti
// `flags.maxRepetitions` (se dichiarato).
export class NonRepeatableAssignmentError extends Error {
  constructor(repeatable = false) {
    super(
      repeatable
        ? "Hai raggiunto il numero massimo di apprendimenti per questa voce di catalogo."
        : "Questa voce di catalogo non è ripetibile: il PG la possiede già."
    );
    this.name = "NonRepeatableAssignmentError";
  }
}

export interface AssignReferenceDataOptions {
  // `true` = concessione del master: bypassa `assignability`,
  // `creationOnly` e i requisiti (grafo + soglia XP); richiede
  // `grantedById`. `false`/omesso = self-assign del giocatore, soggetto a
  // tutti i gate.
  isMaster?: boolean;
  // Id dell'utente master che concede — obbligatorio quando `isMaster`.
  // Salvato su `CharacterData.grantedById` solo per le concessioni master
  // (mai per il self-assign).
  grantedById?: string;
  // Contesto "PG in creazione": sblocca l'assegnazione di voci
  // `creationOnly` per il self-assign. Ignorato per le concessioni master
  // (sempre consentite).
  isCreation?: boolean;
  // Specifiche scelte dal giocatore/master per questa istanza (es. risposte
  // di un form), salvate su `CharacterData.value`.
  value?: Prisma.InputJsonValue | null;
  // Azione di workflow (T-019) a cui agganciare sia la `CharacterData` sia
  // l'eventuale addebito XP.
  actionId?: number;
  // Visibilità dell'istanza creata (T-038, default rivisto T-0xx). Rilevante
  // solo per le concessioni master (`isMaster: true`): se il master non
  // specifica nulla, si usa `DataType.visibility` (vedi
  // `resolveAssignmentVisibility` sotto) — non più un `hidden` fisso via
  // codice, ma una scelta per categoria fatta dal master in
  // `DataTypeManager`. Ignorato per il self-assign (creazione PG, esecuzione
  // azione feature), che assegna sempre `visible`: il giocatore ha già
  // dichiarato/scelto lui stesso quel dato, non ha senso nasconderglielo.
  visibility?: DataVisibility;
  // Concessione master "a costo zero" (T-0xx): sovrascrive a `0` l'addebito
  // XP dichiarato in `definition.flags.cost`, invece del costo reale — la
  // riga resta comunque in cronologia (con una `note`, vedi
  // `debitTalent`/`xp.service.ts`), non viene semplicemente saltata.
  // Ignorato se `definition.flags.cost` non è definito (nessun addebito da
  // sovrascrivere). Rilevante solo per le concessioni master (`isMaster`):
  // non ha senso per il self-assign, che deve sempre pagare il costo reale.
  freeOfCharge?: boolean;
  // `true` = assegnazione automatica di sistema via un arco `grants` (vedi
  // cascata sotto `performWrite`): bypassa assignability/creationOnly/
  // requisiti come una concessione master, ma NON è una concessione di
  // qualcuno — niente `grantedById`/`grantedByOverride` (che restano `null`/
  // `false`). Mai passato da un chiamante esterno, solo dalla ricorsione
  // interna di questa stessa funzione.
  isGranted?: boolean;
}

export interface AssignReferenceDataResult {
  characterData: CharacterData;
  // `null` quando la definizione non ha `flags.cost` (nessun addebito).
  xpTransaction: XpTransaction | null;
}

// Distingue un `PrismaClient` "vero" (ha `$transaction`) da un
// `Prisma.TransactionClient` già innestato in una transazione del chiamante
// (T-018: la route di creazione PG passa il proprio `tx` per comporre
// Character + grant iniziale + N assegnazioni in un'unica transazione
// atomica). Solo nel primo caso questa funzione apre una nuova transazione:
// Prisma non supporta transazioni innestate sulla stessa connessione, e un
// `Prisma.TransactionClient` non espone comunque `$transaction`.
function isFullPrismaClient(
  client: PrismaTransactionClient
): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === "function";
}

// Decisione di design (T-038, presa con l'utente — vedi Log del task file;
// default rivisto T-0xx, sempre con l'utente): il self-assign (creazione PG,
// esecuzione azione feature — `isMaster` false) assegna sempre `visible`,
// non negoziabile: il giocatore ha già dichiarato/scelto lui stesso quel
// dato. Solo la concessione master (`isMaster` true) espone la scelta
// esplicita di `options.visibility`; se non specificata, NON si assume più
// `hidden` di default per ogni concessione — un dato non deve "nascere"
// nascosto solo perché è il master ad assegnarlo. Il default è invece
// `dataType.visibility`, configurabile per categoria in `DataTypeManager`
// (es. "Razza" può restare sempre `visible` di default, mentre una
// categoria pensata per reveal narrativi può avere `visibility: hidden`) —
// il master mantiene comunque il controllo puntuale per-assegnazione via il
// "reveal"/nascondi (`updateCharacterData`, l'icona occhio sulla scheda).
// Un chiamante che vuole SEMPRE `visible` anche in un flusso master (es. la
// creazione PG per conto di un altro utente, T-018) deve passare
// `visibility: DataVisibility.visible` esplicitamente: non è questa
// funzione a poterlo dedurre dal solo `isMaster`.
function resolveAssignmentVisibility(
  isMaster: boolean,
  requestedVisibility: DataVisibility | undefined,
  dataTypeVisibility: DataVisibility
): DataVisibility {
  if (!isMaster) return DataVisibility.visible;
  return requestedVisibility ?? dataTypeVisibility;
}

// Assegna una `ReferenceData` a un PG: valuta i gate (assignability,
// creationOnly, requisiti — bypassati dal master), applica la cardinalità
// del `DataType` (`single` sostituisce, `multi` accumula salvo
// `repeatable = false`), e persiste `CharacterData` + l'eventuale addebito
// XP (`flags.cost`). Atomico rispetto al chiamante: se riceve un
// `PrismaClient` apre una propria transazione (comportamento storico, T-017);
// se riceve un `Prisma.TransactionClient` (T-018, es. creazione PG) scrive
// direttamente su di esso, così l'atomicità si estende all'intera
// transazione del chiamante (niente nesting di `$transaction`).
export async function assignReferenceDataToCharacter(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id" | "campaignId">,
  definition: ReferenceDataWithDataType,
  options: AssignReferenceDataOptions = {},
  // Parametro interno (non in `options`, per non sporcare il contratto
  // pubblico): traccia la catena di voci già attraversate in QUESTA cascata
  // `grants`, per il check anti-ciclo a runtime sotto — difesa in profondità,
  // il check preventivo in fase di creazione dell'arco (route requisiti)
  // dovrebbe già impedire di arrivare qui con un ciclo. Nessun chiamante
  // esterno lo passa mai.
  _grantChain: Set<number> = new Set()
): Promise<AssignReferenceDataResult> {
  const {
    isMaster = false,
    grantedById,
    isCreation = false,
    value,
    actionId,
    freeOfCharge = false,
    isGranted = false,
  } = options;

  // Invariante cross-tenant: controllata per prima, prima di qualunque
  // lettura/valutazione ulteriore — non ha senso valutare requisiti di una
  // definizione di un'altra campagna.
  if (definition.dataType.campaignId !== character.campaignId) {
    throw new CrossCampaignAssignmentError();
  }

  // Vincolo strutturale (T-035), controllato prima di qualunque gate di
  // permesso: `cardinality: null` significa "mai assegnabile a un PG" per
  // costruzione (invariante con `assignability: "none"`), non bypassabile
  // nemmeno dal master (a differenza di `assignability`/`creationOnly`/
  // requisiti, che il master può forzare).
  if (definition.dataType.cardinality === null) {
    throw new NotAssignableDataTypeError();
  }

  if (isMaster && !grantedById) {
    throw new Error("grantedById è obbligatorio quando isMaster è true");
  }

  const evaluation = await evaluateRequirements(prisma, character, definition);

  let grantedByOverride = false;

  if (isMaster) {
    // Master: sempre consentito. Se i requisiti non erano soddisfatti,
    // l'assegnazione è marcata come deroga (`grantedByOverride`).
    grantedByOverride = !evaluation.satisfied;
  } else if (isGranted) {
    // Assegnazione di sistema via `grants` (vedi cascata sotto): bypassa
    // ogni gate come il master, ma non è una deroga di qualcuno — resta
    // `grantedByOverride: false`.
  } else {
    // T-047/T-048: unico campo `assignability` governa il self-assign per
    // ogni `kind` (fisso `"creationOnly"` per `origins`, libero per
    // `assignable`/`talent`, sempre `"none"` per `generic`) — nessun
    // controllo aggiuntivo su `kind` necessario qui, il master bypassa
    // comunque tutto questo branch.
    switch (definition.dataType.assignability) {
      case DataTypeAssignability.none:
      case DataTypeAssignability.masterOnly:
        throw new PlayerAssignmentNotAllowedError();
      case DataTypeAssignability.creationOnly:
        if (!isCreation) throw new CreationOnlyAssignmentError();
        break;
      case DataTypeAssignability.always:
        break;
    }
    if (
      readOptionalBooleanFlag(definition.flags, "creationOnly") &&
      !isCreation
    ) {
      throw new CreationOnlyAssignmentError();
    }
    if (!evaluation.satisfied) {
      throw new RequirementsNotSatisfiedError(evaluation);
    }
  }

  const performWrite = async (
    tx: PrismaTransactionClient
  ): Promise<AssignReferenceDataResult> => {
    // `cardinality` è garantito non-null qui: il branch `null` (T-035) è già
    // stato rifiutato con `NotAssignableDataTypeError` sopra, prima di questo
    // punto.
    if (definition.dataType.cardinality === DataCardinality.single) {
      // `single`: sostituisce sempre l'assegnazione esistente per questo
      // `DataType`, a prescindere da `repeatable` (che governa solo
      // l'accumulo sotto `multi`).
      await deleteCharacterDataByDataType(
        tx,
        character.id,
        definition.dataTypeId
      );
    } else {
      const repeatable =
        readOptionalBooleanFlag(definition.flags, "repeatable") ?? true;
      const maxRepetitions = readOptionalNumericFlag(
        definition.flags,
        "maxRepetitions"
      );
      // Tetto applicabile: 1 se non ripetibile, `maxRepetitions` se
      // ripetibile con un tetto dichiarato, altrimenti nessuno (ripetibile
      // senza limite, comportamento pre-esistente — niente query in più).
      const cap = repeatable ? maxRepetitions : 1;
      if (cap !== undefined) {
        const owned = await countCharacterDataByCharacterAndReferenceData(
          tx,
          character.id,
          definition.id
        );
        if (owned >= cap) {
          throw new NonRepeatableAssignmentError(repeatable);
        }
      }
    }

    const characterData = await createCharacterData(tx, {
      characterId: character.id,
      referenceDataId: definition.id,
      dataTypeId: definition.dataTypeId,
      value: value ?? null,
      visibility: resolveAssignmentVisibility(
        isMaster,
        options.visibility,
        definition.dataType.visibility
      ),
      grantedById: isMaster ? (grantedById ?? null) : null,
      grantedByOverride,
      actionId: actionId ?? null,
    });

    let xpTransaction: XpTransaction | null = null;
    if (readOptionalNumericFlag(definition.flags, "cost") !== undefined) {
      // Il master forza l'addebito anche sotto budget (`allowOverride`):
      // stessa deroga già applicata sopra ai requisiti. Il giocatore è già
      // passato dal gate `evaluation.satisfied` (che include `xpSufficient`)
      // sopra, ma `debitTalent` ricontrolla comunque il saldo dentro la
      // transazione (stessa garanzia di `xp.service`, nessuna duplicazione
      // di logica qui).
      xpTransaction = await debitTalent(tx, character, definition, {
        actionId,
        allowOverride: isMaster || isGranted,
        cost: freeOfCharge ? 0 : undefined,
        note: freeOfCharge ? "Concesso dal master" : undefined,
      });
    }

    // `isMissivePointBonus`/`isDowntimePointBonus` (solo `kind: talent`,
    // assente per gli altri `kind` — `readOptionalBooleanFlag` torna
    // `undefined` senza errori): +1 punto subito utilizzabile e +1 sul
    // massimale personale, vedi `grantCharacterPointBonus`.
    // ponytail: un `DataType` talent a cardinalità `single` che sostituisce
    // (ramo sopra, `deleteCharacterDataByDataType`) un talento con questi
    // flag non ne revoca il bonus — nessun talento single-cardinality li usa
    // oggi; se servisse, applicare qui lo stesso fetch+revoke della DELETE
    // route prima della sostituzione.
    if (readOptionalBooleanFlag(definition.flags, "isMissivePointBonus")) {
      await grantCharacterPointBonus(tx, character.id, "missivePoints");
    }
    if (readOptionalBooleanFlag(definition.flags, "isDowntimePointBonus")) {
      await grantCharacterPointBonus(tx, character.id, "downtimePoints");
    }

    // Cascata `grants` (piano approvato): ottenere `definition` assegna
    // automaticamente anche ogni voce bersaglio dei suoi archi `grants`,
    // sempre gratis, ricorsivamente. `_grantChain` traccia le voci già
    // attraversate in QUESTA cascata: un ciclo che il check preventivo in
    // fase di creazione dell'arco (route requisiti) non avesse impedito
    // viene qui rilevato e SALTATO (log, non un crash che farebbe fallire
    // l'intera transazione — difesa in profondità, non il percorso atteso).
    const grantChain = new Set(_grantChain).add(definition.id);
    const grantEdges = (
      await listOutgoingRequirements(tx, definition.id)
    ).filter(edge => edge.type === RequirementType.grants);
    for (const edge of grantEdges) {
      const target = edge.requiredDefinition;
      if (grantChain.has(target.id)) {
        console.error(
          `Ciclo 'grants' rilevato e ignorato: ${definition.id} -> ${target.id}`
        );
        continue;
      }
      const alreadyOwned =
        (await countCharacterDataByCharacterAndReferenceData(
          tx,
          character.id,
          target.id
        )) > 0;
      if (alreadyOwned) continue;
      await assignReferenceDataToCharacter(
        tx,
        character,
        target,
        { isGranted: true, freeOfCharge: true, actionId, isCreation },
        grantChain
      );
    }

    return { characterData, xpTransaction };
  };

  return isFullPrismaClient(prisma)
    ? prisma.$transaction(performWrite)
    : performWrite(prisma);
}
