import {
  CharacterType,
  NotificationType,
  type Feature,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";
import { registerFeatureHandler, ActionDataValidationError } from "../registry";
import type { FeatureHandlerContext, FeatureHandlerResult } from "../types";
import { FT_MISSIVE } from "../featuresName";
import { spendDowntimePoint } from "../downtimePoints";
import { spendMissivePoint } from "../missivePoints";
import { downtimeActionSchema } from "./downtimeAction";
import { missiveFeatureSchema } from "./missive.schema";
import { createAction } from "@/lib/repositories/action.repository";
import {
  getCharacterInCampaign,
  listCampaignCharacters,
} from "@/lib/repositories/character.repository";
import {
  createNotification,
  createNotifications,
} from "@/lib/repositories/notification.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
// Import circolare deliberato con `missive.repository.ts` (che a sua volta
// importa `isCommunicationMissive`/`isFreeReceiverMissive`/
// `missiveActionSchema` da questo modulo): sicuro perché entrambi i lati
// usano i simboli importati SOLO dentro corpi di funzione invocati a runtime
// (mai in cima al modulo), quindi il grafo di moduli è già completamente
// inizializzato al primo utilizzo reale — stesso principio già documentato
// per l'hook di `registerDowntimeCustomHandler` in `../registry.ts`, ma qui
// non serve un workaround perché non c'è alcun side-effect a import-time che
// dipenda dall'ordine di valutazione.
import { getReplyEligibility } from "@/lib/repositories/missive.repository";

// Ri-esportati per non rompere gli importatori server-side esistenti (zero
// import server-only in `missive.schema.ts`, vedi commento lì): i Client
// Component (`CharacterEditor.tsx`, `ModalFeatureMissive.tsx`) importano
// direttamente da `missive.schema.ts`, MAI da qui — un import client di
// questo file trascinerebbe l'intera catena `notification.repository.ts` ->
// `webpush.ts` -> `web-push` (Node-only) nel bundle browser.
export {
  missiveFeatureSchema,
  type MissiveFeatureData,
} from "./missive.schema";

export const missiveActionSchema = downtimeActionSchema
  .extend({
    // Titolo della missiva (T-0xx): mostrato in lista al posto del contenuto
    // completo, stesso stile Zod di `description` (`downtimeActionSchema`).
    subject: z.string().trim().min(1),
    // FK reale (Character.id) del destinatario, non un nome libero: il form
    // risolve sempre un Character reale, quindi salvare l'id evita il
    // matching per nome fragile (rinomina/omonimia) usato in precedenza.
    // Niente `receiverType` qui: sarebbe un valore dichiarato dal client
    // senza alcuna verifica contro il `Character.type` reale del
    // destinatario — il gate `pngCountsAsDowntime` sotto deciderebbe quale
    // pool di punti scalare fidandosi ciecamente dell'input. Il tipo va
    // sempre risolto dal `Character` reale (vedi `handler`/
    // `createMasterMissiveAction` sotto), mai salvato in `actionData`.
    // `.optional()` (T-0xx, missive "a nome del master" rispondibili): una
    // RISPOSTA di un PG rivolta al master non ha un `Character` destinatario
    // — vedi `receiverUserId` sotto, mutuamente esclusivo con questo campo
    // (`.refine()` sotto). Su una missiva nuova (mai una risposta) resta
    // invece sempre valorizzato: il mittente sceglie sempre un Character
    // reale in compilazione.
    receiverCharacterId: z.coerce.number().int().positive().optional(),
    // FK reale (`User.id`) del destinatario, presente SOLO su una risposta
    // rivolta al master (T-0xx): l'altro capo dello scambio non è un
    // `Character` ma l'utente master che ha diritto al turno, risolto
    // SEMPRE server-side (`getReplyEligibility`, mai dichiarato dal
    // client — vedi `handler` sotto, che lo calcola e lo scrive lui stesso).
    receiverUserId: z.string().optional(),
    // Timestamp di lettura da parte del destinatario (T-0xx, badge Ricevuto/
    // Letto in `MissiveRow.tsx`): sempre `null` alla creazione (il client non
    // lo invia mai, vedi `.default(null)`), impostato in un secondo momento
    // dalla route dedicata `PATCH .../missive/[id]/read` — non dall'handler
    // di creazione, che non ha modo di sapere se qualcuno l'ha già aperta.
    readDate: z.coerce.date().nullable().default(null),
    // Presente SOLO su un messaggio di RISPOSTA (mai sulla missiva radice):
    // punta SEMPRE all'id della missiva radice del thread, mai al messaggio
    // immediatamente precedente — un semplice filtro
    // `actionData.threadRootId == rootId` recupera così l'intero thread in una
    // sola query (`getThreadReplies`), senza dover risalire una catena di
    // riferimenti. Il valore dichiarato dal client viene sempre riverificato
    // server-side (`getReplyEligibility`), mai preso per buono da solo.
    threadRootId: z.coerce.number().int().positive().optional(),
    // Vincolo PER-MESSAGGIO (T-0xx, non per-thread): chi scrive QUESTO
    // messaggio (radice o risposta) decide se chi lo riceve può a sua volta
    // rispondERGLI — se lo disattiva, il thread si chiude a QUESTO
    // messaggio specifico, a prescindere dai flag di campagna
    // `canAnswer`/`canAnswerThread` (`getReplyEligibility` in
    // `missive.repository.ts` guarda sempre l'ULTIMO messaggio del thread,
    // mai la radice). Non è quindi un "chiudi l'intero thread per sempre":
    // se il messaggio con `allowReply: false` non è l'ultimo, un successivo
    // scambio resta comunque possibile finché il gate di campagna lo
    // consente. Default `true`: il comportamento pre-esistente (rispondibile
    // se la campagna lo permette) resta invariato per chi non tocca mai
    // questo checkbox.
    allowReply: z.boolean().default(true),
  })
  .refine(
    data => {
      const hasReceiverCharacter = data.receiverCharacterId !== undefined;
      const hasReceiverUser = data.receiverUserId !== undefined;
      // Una RISPOSTA (`threadRootId` presente): il vero destinatario si
      // risolve sempre server-side (`getReplyEligibility`), mai dal payload
      // del client (vedi `handler`/`createMasterMissiveAction`) — un client
      // aggiornato non dichiara NESSUNO dei due per una risposta rivolta al
      // master (`MissiveWriter.handleSubmit`), quindi qui basta escludere
      // che li dichiari ENTRAMBI insieme (dato malformato/manomesso).
      if (data.threadRootId !== undefined) {
        return !(hasReceiverCharacter && hasReceiverUser);
      }
      // Una missiva NUOVA (mai una risposta): il mittente sceglie sempre un
      // Character reale in compilazione, mai un utente master — qui serve
      // ESATTAMENTE uno dei due, mai entrambi né nessuno.
      return hasReceiverCharacter !== hasReceiverUser;
    },
    {
      message: "Specificare esattamente un destinatario (personaggio o master)",
      path: ["receiverCharacterId"],
    }
  );

// Missiva "Comunicazione" (T-0xx): a differenza di `missiveActionSchema` non
// ha un `receiverCharacterId` — è una singola `Action` (`characterId: null`,
// sempre "a nome del master") visibile a TUTTI i PG attivi della campagna
// (vedi `buildVisibilityWhere` in `missive.repository.ts`), non N copie
// duplicate una per destinatario. `communication: z.literal(true)` è il
// discriminante esplicito fra i rami di `anyMissiveActionSchema` sotto —
// niente euristiche sulle chiavi presenti/assenti. `readByCharacterIds`
// sostituisce il singolo `readDate`: non c'è un destinatario unico, quindi
// il tracking "letta" è per-PG (vedi `markCommunicationMissiveAsRead`).
export const missiveCommunicationActionSchema = z
  .object({
    subject: z.string().trim().min(1),
    description: z.string().trim().min(1),
    communication: z.literal(true),
    readByCharacterIds: z.array(z.number().int().positive()).default([]),
  })
  .strict();

// Missiva "Campo libero" (T-0xx): come `missiveActionSchema`, ma il
// destinatario non è un `Character` reale della campagna (es. un PNG non
// modellato in scheda) — chi scrive digita una stringa libera invece di
// scegliere un PG/PNG. Per il costo scala come una missiva a PNG (vedi
// `handler` sotto, gate su `config.pngCountsAsDowntime` senza risolvere
// alcun `Character`). Non essendoci un destinatario reale è visibile a TUTTI
// i master della campagna (già garantito da `buildVisibilityWhere`, nessuna
// modifica lì necessaria) e il suo `readDate` — a differenza della
// Comunicazione — resta un timestamp SINGOLO: si valorizza al primo master
// che la apre, non al mittente che la riapre (vedi
// `markFreeReceiverMissiveAsRead` in `missive.repository.ts`).
export const missiveFreeReceiverActionSchema = downtimeActionSchema.extend({
  subject: z.string().trim().min(1),
  receiverFreeText: z.string().trim().min(1),
  readDate: z.coerce.date().nullable().default(null),
});

// Union usata per la REGISTRAZIONE dell'handler (`registerFeatureHandler`
// sotto): i due rami "diretti", con un `Character` mittente reale che scala
// punti — la Comunicazione non ne fa parte, ha il proprio percorso dedicato
// (`createCommunicationMissiveAction`, mai un `character` da cui scalare).
export const missiveDirectActionSchema = z.union([
  missiveActionSchema,
  missiveFreeReceiverActionSchema,
]);

// Union usata per il PARSING generico di un `actionData` di cui non si sa
// ancora quale dei tre rami sia (letture da DB, dati grezzi non ancora
// discriminati): `missiveCommunicationActionSchema`/
// `missiveFreeReceiverActionSchema` prima di `missiveActionSchema`, così un
// payload con `communication: true`/`receiverFreeText` non tenta mai di
// combaciare col ramo reale (che comunque lo rifiuterebbe, essendo
// `.strict()` e senza quelle chiavi, ma l'ordine rende esplicito l'intento).
export const anyMissiveActionSchema = z.union([
  missiveCommunicationActionSchema,
  missiveFreeReceiverActionSchema,
  missiveActionSchema,
]);

export type MissiveActionData = z.infer<typeof anyMissiveActionSchema>;

// Discrimina una comunicazione senza ri-validare con Zod: usata dal
// repository/route su `actionData` grezzo (`Prisma.JsonValue`, non ancora
// parsato) dove rifare un parse completo ad ogni riga sarebbe superfluo —
// serve solo sapere QUALE dei tre rami si sta guardando.
export function isCommunicationMissive(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).communication === true
  );
}

// Discrimina una missiva "Campo libero" senza ri-validare con Zod, stesso
// pattern di `isCommunicationMissive`: `receiverFreeText` è una chiave che
// non compare mai né sul ramo reale (`receiverCharacterId`) né sulla
// Comunicazione (nessun destinatario), quindi basta un controllo di tipo.
export function isFreeReceiverMissive(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).receiverFreeText === "string"
  );
}

// Discrimina una risposta rivolta al master (T-0xx, "a nome del master"
// rispondibili) senza ri-validare con Zod, stesso pattern di
// `isCommunicationMissive`/`isFreeReceiverMissive`: `receiverUserId` è una
// chiave che compare SOLO su questo ramo (mai sulla missiva radice, mai su
// una risposta rivolta a un Character reale), quindi basta un controllo di
// tipo.
export function isMasterTargetedReply(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).receiverUserId === "string"
  );
}

export function parseMissiveActionData(actionData: unknown): MissiveActionData {
  return anyMissiveActionSchema.parse(actionData);
}

// Il destinatario scelto non esiste (più) come `Character` in QUESTA
// campagna: sia perché eliminato dopo che il form l'ha proposto, sia perché
// un client malevolo ha inviato l'id di un `Character` di un'altra campagna
// — `getCharacterInCampaign` scopa la query su `campaignId`, quindi
// quest'ultimo caso ritorna comunque `null`, mai un `Character` cross-tenant.
export class MissiveReceiverNotFoundError extends Error {
  constructor() {
    super("Il destinatario scelto non esiste in questa campagna.");
    this.name = "MissiveReceiverNotFoundError";
  }
}

// Una risposta (`actionData.threadRootId` presente) che non supera il gate
// server-side di `getReplyEligibility` (`missive.repository.ts`): la feature
// ha `canAnswer`/`canAnswerThread` spenta, la missiva radice non è
// rispondibile (Comunicazione/"a nome del master"/"Campo libero", o il
// mittente ha spento il checkbox in compilazione), oppure chi sta scrivendo
// non è il personaggio che ha davvero diritto al turno — mai fidarsi del
// solo fatto che il client abbia inviato un `threadRootId` valido.
export class MissiveReplyNotAllowedError extends Error {
  constructor() {
    super("Non puoi rispondere a questa missiva.");
    this.name = "MissiveReplyNotAllowedError";
  }
}

async function handler(
  prisma: PrismaClient,
  // L'union "diretta" (`missiveDirectActionSchema`, sotto): questo handler è
  // registrato con quello schema, quindi riceve sia il ramo "missiva a un PG
  // reale" sia il ramo "Campo libero" — la Comunicazione passa da un
  // percorso dedicato (`createCommunicationMissiveAction`), mai da qui
  // (nessun `Character` mittente da cui scalare punti).
  context: FeatureHandlerContext<z.infer<typeof missiveDirectActionSchema>>
): Promise<FeatureHandlerResult> {
  const { character, feature, actionData, campaign, bypassLimits } = context;
  const config = missiveFeatureSchema.parse(feature.featureData);

  // Campo libero: nessun `Character` destinatario da risolvere, quindi
  // nessun lookup DB e nessun `MissiveReceiverNotFoundError` possibile su
  // questo ramo — il costo dipende solo dalla configurazione di campagna
  // (stesso trattamento di una missiva a PNG). Non esiste un concetto di
  // "risposta" su questo ramo (`threadRootId` non fa parte di
  // `missiveFreeReceiverActionSchema`): non c'è mai un Character
  // destinatario reale a cui rispondere.
  if ("receiverFreeText" in actionData) {
    const countsAsDowntime = config.pngCountsAsDowntime;
    return prisma.$transaction(async tx => {
      if (!bypassLimits) {
        if (countsAsDowntime) {
          await spendDowntimePoint(tx, character);
        } else {
          await spendMissivePoint(tx, character);
        }
      }

      const action = await createAction(tx, {
        characterId: character.id,
        featureId: feature.id,
        actionData,
      });

      // Notifica (T-0xx, pannello notifiche): il destinatario "Campo libero"
      // non è un utente reale, quindi si notificano invece gli utenti
      // esplicitamente configurati per la campagna (`config.notifyUserIds`,
      // stesso principio di `notifyUserIds` sul contenitore `FT_DOWNTIME`).
      await createNotifications(
        tx,
        config.notifyUserIds.map(userId => ({
          userId,
          campaignId: campaign.id,
          type: NotificationType.missive,
          entityId: action.id,
        }))
      );

      return { action };
    });
  }

  // Ramo reale: una RISPOSTA (`threadRootId` presente) ha il proprio
  // `receiverCharacterId` dichiarato dal client, ma va sempre ignorato — il
  // vero destinatario è quello che ha diritto al turno (l'ultimo mittente del
  // thread), risolto da `getReplyEligibility`. Per una missiva "normale"
  // (non risposta) resta il comportamento originale: il destinatario è
  // quello scelto dal mittente in compilazione.
  const isReply = "threadRootId" in actionData;

  return prisma.$transaction(async tx => {
    let receiverCharacterId = actionData.receiverCharacterId;

    // L'eligibility check va fatto DENTRO la transazione, non prima in sola
    // lettura: due risposte quasi simultanee allo stesso thread altrimenti
    // potrebbero superare entrambe il gate leggendo lo stesso "ultimo
    // messaggio" prima che la prima abbia scritto la propria `Action`,
    // producendo due risposte per lo stesso turno invece di rifiutarne una.
    if (isReply) {
      const eligibility = await getReplyEligibility(tx, {
        campaignId: campaign.id,
        rootActionId: actionData.threadRootId as number,
        config,
      });
      // Sia "non è possibile rispondere a questa missiva" sia "chi sta
      // scrivendo non è chi ha diritto al turno" collassano sullo stesso
      // errore: non deve trapelare al client SE il problema è il turno o
      // l'eligibilità del thread, un dettaglio che non gli spetta. Questo
      // handler è raggiunto SOLO dalla route character-scoped, quindi chi
      // risponde è sempre un PG — il confronto resta sempre
      // `expectedSenderCharacterId`, mai un `expectedSenderUserId` (quello è
      // per l'altra route, vedi `createMasterMissiveAction` sotto).
      if (
        !eligibility.allowed ||
        eligibility.expectedSenderCharacterId !== character.id
      ) {
        throw new MissiveReplyNotAllowedError();
      }

      // Risposta rivolta al master (T-0xx, missive "a nome del master"
      // rispondibili): il destinatario di QUESTA risposta è l'utente master
      // che ha diritto al turno, non un `Character` — nessun lookup
      // `getCharacterInCampaign`, nessuna distinzione PNG/downtime (il
      // master non ha un `Character.type`): il costo è SEMPRE un punto
      // missiva pieno, salvo `canAnswerFree`. Ramo interamente separato dal
      // resto della funzione (mai un `receiver` Character da risolvere).
      if (eligibility.expectedReceiverUserId !== undefined) {
        const isFreeReply = config.canAnswerFree;
        if (!bypassLimits && !isFreeReply) {
          await spendMissivePoint(tx, character);
        }

        const finalActionData = {
          subject: actionData.subject,
          description: actionData.description,
          threadRootId: actionData.threadRootId,
          receiverUserId: eligibility.expectedReceiverUserId,
          // Propagato esplicitamente (non uno spread di `actionData`, che
          // qui porterebbe anche il `receiverCharacterId` scartato sopra):
          // senza questo, il checkbox "Permetti al destinatario di
          // rispondere" del mittente andrebbe perso alla scrittura per
          // QUESTO ramo, l'unico che ricostruisce `finalActionData` a mano
          // invece di fare spread.
          allowReply: actionData.allowReply,
        };

        const action = await createAction(tx, {
          characterId: character.id,
          featureId: feature.id,
          actionData: finalActionData,
        });

        // Notifica (T-0xx, pannello notifiche): il destinatario di QUESTA
        // risposta è l'utente master risolto sopra, non un `Character` —
        // stesso `userId` appena scritto in `receiverUserId`.
        await createNotification(tx, {
          userId: eligibility.expectedReceiverUserId,
          campaignId: campaign.id,
          type: NotificationType.missive,
          entityId: action.id,
        });

        return { action };
      }

      // Mai fidarsi del `receiverCharacterId` dichiarato dal client per una
      // risposta (stesso principio già applicato al `Character.type`, vedi
      // il commento su `missiveActionSchema`): sovrascritto con quello
      // risolto server-side PRIMA di risolvere il tipo (PG/PNG, sotto) e di
      // creare l'`Action`.
      receiverCharacterId = eligibility.expectedReceiverCharacterId as number;
    }

    const receiver = await getCharacterInCampaign(
      tx,
      receiverCharacterId,
      campaign.id
    );
    if (!receiver) {
      throw new MissiveReceiverNotFoundError();
    }
    const countsAsDowntime =
      receiver.type === CharacterType.png && config.pngCountsAsDowntime;

    // Risposta gratuita (`canAnswerFree`): salta interamente lo spend, a
    // prescindere dal saldo — stessa struttura del bypass master/
    // head_master/super-admin sotto, ma condizionata alla configurazione di
    // campagna invece che al ruolo di chi scrive.
    const isFreeReply = isReply && config.canAnswerFree;

    // Master/head_master/super-admin (`bypassLimits`, propagato dalla route
    // — vedi `types.ts`): non si spende MAI un punto, a prescindere dal
    // personaggio scelto come mittente. Vale anche quando il mittente è un
    // PG reale (non solo l'invio "a nome del master", quello passa dal path
    // dedicato `createMasterMissiveAction` sotto, che non ha nemmeno un
    // `character` da cui scalare).
    if (!bypassLimits && !isFreeReply) {
      if (countsAsDowntime) {
        await spendDowntimePoint(tx, character);
      } else {
        await spendMissivePoint(tx, character);
      }
    }

    const finalActionData = isReply
      ? { ...actionData, receiverCharacterId }
      : actionData;

    const action = await createAction(tx, {
      characterId: character.id,
      featureId: feature.id,
      actionData: finalActionData,
    });

    // Notifica (T-0xx, pannello notifiche): il proprietario del `Character`
    // destinatario reale appena risolto — mai il ramo "Campo libero" sopra,
    // che non ha alcun destinatario reale a cui indirizzarla.
    await createNotification(tx, {
      userId: receiver.userId,
      campaignId: campaign.id,
      type: NotificationType.missive,
      entityId: action.id,
    });

    return { action };
  });
}

registerFeatureHandler({
  featureName: "Missive",
  functionName: FT_MISSIVE,
  actionSchema: missiveDirectActionSchema,
  featureSchema: missiveFeatureSchema,
  handler,
});

// Comunicazione (T-0xx, `communication: true`): stesso "a nome del master"
// di `createMasterMissiveAction` sotto — nessun `Character` mittente,
// nessuno spending di punti (il master non consuma mai risorse) — ma senza
// alcun `receiverCharacterId` da risolvere: è visibile a TUTTI i PG attivi
// della campagna (enforced server-side in `buildVisibilityWhere`, mai
// filtrato lato client), un'unica `Action` condivisa, non N copie.
async function createCommunicationMissiveAction(
  prisma: PrismaClient,
  input: { feature: Feature; actionData: unknown }
): Promise<FeatureHandlerResult> {
  const parsed = missiveCommunicationActionSchema.safeParse(input.actionData);
  if (!parsed.success) {
    throw new ActionDataValidationError(FT_MISSIVE, parsed.error);
  }

  // Avvolta in transazione (T-0xx, pannello notifiche): il fan-out sotto è
  // una seconda scrittura (`createNotifications`), non più un singolo
  // `createAction` isolato come nel commento originale di questa funzione —
  // senza transazione, un fallimento del fan-out lascerebbe la Comunicazione
  // creata ma nessun destinatario notificato.
  return prisma.$transaction(async tx => {
    const action = await createAction(tx, {
      characterId: null,
      featureId: input.feature.id,
      actionData: parsed.data,
    });

    // Notifica: fan-out a ogni PG attivo della campagna — PG o PNG
    // indifferentemente, stesso identico filtro (`getCharacterStatus(character)
    // === "approved"`) già usato da `missive/new/page.tsx`/
    // `characters/[id]/[actionType]/page.tsx` — dedup per `userId`
    // (`createNotifications` non dedupa da sola): un utente con più
    // personaggi attivi nella stessa campagna riceve UNA sola notifica.
    // Nessun `NotificationType` dedicato per la Comunicazione (riusa
    // `missive`, distinta a lettura via `isCommunicationMissive`, vedi
    // `notification.repository.ts`).
    const campaignCharacters = await listCampaignCharacters(
      tx,
      input.feature.campaignId
    );
    const activeUserIds = new Set(
      campaignCharacters
        .filter(character => getCharacterStatus(character) === "approved")
        .map(character => character.userId)
    );
    await createNotifications(
      tx,
      Array.from(activeUserIds).map(userId => ({
        userId,
        campaignId: input.feature.campaignId,
        type: NotificationType.missive,
        entityId: action.id,
      }))
    );

    return { action };
  });
}

// Campo libero (T-0xx, `receiverFreeText`) inviata "a nome del master":
// stesso "nessun Character mittente" delle altre due varianti sopra, ma a
// differenza della Comunicazione conserva `subject`/`description`/
// `readDate` singoli (è una missiva a UN destinatario, solo non modellato
// come Character) — e a differenza del ramo reale non risolve/valida alcun
// `receiverCharacterId`, il destinatario è testo libero così com'è.
async function createFreeReceiverMissiveAction(
  prisma: PrismaClient,
  input: { feature: Feature; actionData: unknown; masterUserId: string }
): Promise<FeatureHandlerResult> {
  const parsed = missiveFreeReceiverActionSchema.safeParse(input.actionData);
  if (!parsed.success) {
    throw new ActionDataValidationError(FT_MISSIVE, parsed.error);
  }

  const action = await createAction(prisma, {
    characterId: null,
    featureId: input.feature.id,
    actionData: parsed.data,
    // Autore reale (T-0xx, tab "Inviate"): QUALE master ha scritto questa
    // missiva "a nome del master" — vedi `Action.authorUserId`.
    authorUserId: input.masterUserId,
  });

  // Notifica (T-0xx, pannello notifiche): il destinatario "Campo libero" non
  // è un utente reale, quindi si notificano invece gli utenti esplicitamente
  // configurati per la campagna (`notifyUserIds`), stesso ramo gemello in
  // `handler()` sopra.
  const { notifyUserIds } = missiveFeatureSchema.parse(
    input.feature.featureData
  );
  await createNotifications(
    prisma,
    notifyUserIds.map(userId => ({
      userId,
      campaignId: input.feature.campaignId,
      type: NotificationType.missive,
      entityId: action.id,
    }))
  );

  return { action };
}

// Percorso dedicato per l'invio "a nome del master" (T-0xx, nessun PG reale
// come mittente — `POST /api/campaigns/[campaignSlug]/actions`, non lo
// stesso endpoint scoped al personaggio): non passa dal registry generico
// (`executeFeatureAction`/`FeatureHandlerContext.character`, sempre
// richiesto) perché qui non c'è alcun `Character` da cui scalare punti o su
// cui appendere l'`Action` — il bypass non è un caso particolare del gate,
// è l'assenza stessa del concetto "punti di un personaggio". Nessuna
// transazione: un'unica scrittura (`createAction`), niente da far
// coincidere atomicamente.
// Smista fra i tre rami in base al discriminante esplicito
// (`communication: true` / `receiverFreeText` presente, mai un'euristica
// sulle altre chiavi): la route chiamante (`POST .../actions`) non conosce
// la differenza, passa sempre da qui. `masterUserId` (T-0xx, tab "Inviate"
// per un viewer master): l'id dell'utente master che sta dichiarando
// l'azione (`session.user.id` risolto dalla route chiamante, mai dal
// payload) — propagato come `authorUserId` ai due rami che scrivono
// davvero una missiva "a nome del master" con un mittente-master
// (reale/"Campo libero"). Deliberatamente NON propagato al ramo
// Comunicazione (`createCommunicationMissiveAction`): sta sempre in
// "Posta in arrivo" per chiunque, non partecipa mai al filtro "Inviate",
// quindi tracciarne l'autore non serve oggi.
export async function createMasterMissiveAction(
  prisma: PrismaClient,
  input: { feature: Feature; actionData: unknown; masterUserId: string }
): Promise<FeatureHandlerResult> {
  if (isCommunicationMissive(input.actionData)) {
    return createCommunicationMissiveAction(prisma, input);
  }

  if (isFreeReceiverMissive(input.actionData)) {
    return createFreeReceiverMissiveAction(prisma, {
      feature: input.feature,
      actionData: input.actionData,
      masterUserId: input.masterUserId,
    });
  }

  const parsed = missiveActionSchema.safeParse(input.actionData);
  if (!parsed.success) {
    throw new ActionDataValidationError(FT_MISSIVE, parsed.error);
  }

  // Risposta "a nome del master" (T-0xx, missive "a nome del master"
  // rispondibili): SOLO lo stesso master che ha scritto la radice del
  // thread può raccogliere il turno — mai un master diverso della stessa
  // campagna. L'eligibility check va fatto DENTRO la transazione della
  // scrittura, non prima in sola lettura (stesso principio già applicato in
  // `handler()` sopra): due risposte quasi simultanee sullo stesso thread
  // altrimenti potrebbero superare entrambe il gate leggendo lo stesso
  // "ultimo messaggio" prima che la prima abbia scritto la propria `Action`.
  // La missiva "da zero" (senza `threadRootId`) resta invece fuori
  // transazione: un'unica scrittura, niente da far coincidere atomicamente.
  if (parsed.data.threadRootId !== undefined) {
    const config = missiveFeatureSchema.parse(input.feature.featureData);
    return prisma.$transaction(async tx => {
      const eligibility = await getReplyEligibility(tx, {
        campaignId: input.feature.campaignId,
        rootActionId: parsed.data.threadRootId as number,
        config,
      });
      // Sia "non è possibile rispondere a questa missiva" sia "chi sta
      // scrivendo non è il master che ha diritto al turno" collassano sullo
      // stesso errore, stesso principio di `handler()` sopra.
      if (
        !eligibility.allowed ||
        eligibility.expectedSenderUserId !== input.masterUserId
      ) {
        throw new MissiveReplyNotAllowedError();
      }

      // Il `receiverCharacterId` da salvare è SEMPRE quello risolto
      // server-side (il PG che ha diritto a riceverla), MAI quello
      // dichiarato dal client — stesso principio già applicato in
      // `handler()`.
      const action = await createAction(tx, {
        characterId: null,
        featureId: input.feature.id,
        actionData: {
          subject: parsed.data.subject,
          description: parsed.data.description,
          threadRootId: parsed.data.threadRootId,
          // Presente per costruzione quando `expectedSenderUserId` combacia
          // (vedi il branch "turno del master" di `getReplyEligibility`).
          receiverCharacterId:
            eligibility.expectedReceiverCharacterId as number,
          // Propagato esplicitamente, stesso motivo del ramo gemello in
          // `handler()` sopra: qui `finalActionData` è ricostruito a mano,
          // uno spread di `parsed.data` non basterebbe a giustificare
          // l'omissione — senza questo il checkbox del master andrebbe
          // perso alla scrittura.
          allowReply: parsed.data.allowReply,
        },
        // Autore reale (T-0xx, tab "Inviate"): QUALE master ha scritto
        // questa risposta "a nome del master" — vedi `Action.authorUserId`.
        authorUserId: input.masterUserId,
      });

      // Notifica (T-0xx, pannello notifiche): il proprietario del PG che
      // riceve QUESTA risposta del master (`expectedReceiverCharacterId`,
      // mai un `Character` dichiarato dal client).
      const receiver = await getCharacterInCampaign(
        tx,
        eligibility.expectedReceiverCharacterId as number,
        input.feature.campaignId
      );
      if (receiver) {
        await createNotification(tx, {
          userId: receiver.userId,
          campaignId: input.feature.campaignId,
          type: NotificationType.missive,
          entityId: action.id,
        });
      }

      return { action };
    });
  }

  const receiver = await getCharacterInCampaign(
    prisma,
    // Garantito definito qui dal `.refine()` di `missiveActionSchema`: senza
    // `threadRootId` (missiva "da zero", ramo sopra) è sempre l'unico dei
    // due destinatari ammessi — `receiverUserId` non ha senso per un invio
    // "da zero" (nessun master scrive mai a un altro master).
    parsed.data.receiverCharacterId as number,
    input.feature.campaignId
  );
  if (!receiver) {
    throw new MissiveReceiverNotFoundError();
  }

  const action = await createAction(prisma, {
    characterId: null,
    featureId: input.feature.id,
    actionData: parsed.data,
    // Autore reale (T-0xx, tab "Inviate"): QUALE master ha scritto questa
    // missiva "a nome del master" — vedi `Action.authorUserId`.
    authorUserId: input.masterUserId,
  });

  // Notifica (T-0xx, pannello notifiche): il proprietario del `Character`
  // destinatario reale appena risolto sopra.
  await createNotification(prisma, {
    userId: receiver.userId,
    campaignId: input.feature.campaignId,
    type: NotificationType.missive,
    entityId: action.id,
  });

  return { action };
}
