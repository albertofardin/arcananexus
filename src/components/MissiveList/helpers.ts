import { IListItem } from "../_core/ListItem";
import {
  MISSIVE_COMMUN_BG,
  MISSIVE_COMMUN_ICON,
  MISSIVE_COMMUN_ID,
  MISSIVE_COMMUN_TEXT,
  MISSIVE_MASTER_BG,
  MISSIVE_MASTER_ICON,
  MISSIVE_MASTER_ID,
  MISSIVE_MASTER_TEXT,
  missiveBoxEnum,
  MissiveReceiverOption,
  MissiveSenderOption,
  type MissiveBox,
  type MissiveSenderFilter,
} from "@/lib/validations/missive";

export const parseSenderParam = (
  value: string | null
): MissiveSenderFilter | undefined => {
  if (!value) return undefined;
  if (value === MISSIVE_MASTER_ID) return MISSIVE_MASTER_ID;
  if (value === MISSIVE_COMMUN_ID) return MISSIVE_COMMUN_ID;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

// Stesso pattern di `parseSenderParam`, senza il caso sentinella master: il
// destinatario è sempre un `Character.id` reale, mai "a nome del master"
// (`receiverCharacterId`, query param di `GET .../missive`).
export const parseReceiverParam = (
  value: string | null
): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const getFieldItems = (
  allId: string,
  array: MissiveSenderOption[] | MissiveReceiverOption[]
): IListItem[] => {
  const isMaster = array.some(sender => sender.id === MISSIVE_MASTER_ID);
  const isCommunication = array.some(sender => sender.id === MISSIVE_COMMUN_ID);
  const itemAll: IListItem = { id: allId, label: "Tutti" };
  const itemMaster: IListItem = {
    id: MISSIVE_MASTER_ID,
    label: MISSIVE_MASTER_TEXT,
    avatarIcon: MISSIVE_MASTER_ICON,
    avatarStyle: { backgroundColor: MISSIVE_MASTER_BG },
  };
  const itemCommunication: IListItem = {
    id: MISSIVE_COMMUN_ID,
    label: MISSIVE_COMMUN_TEXT,
    avatarIcon: MISSIVE_COMMUN_ICON,
    avatarStyle: { backgroundColor: MISSIVE_COMMUN_BG },
  };
  const items = array
    .filter(a => a.id !== MISSIVE_MASTER_ID && a.id !== MISSIVE_COMMUN_ID)
    .map(a => {
      const item: IListItem = {
        id: a.id,
        label: a.name,
        avatar: a.avatar,
        avatarText: a.name,
      };
      return item;
    });

  return []
    .concat(
      itemAll,
      isMaster ? itemMaster : undefined,
      isCommunication ? itemCommunication : undefined,
      items
    )
    .filter(a => a);
};

// Item per i due `FieldSelect` "Da evento"/"A evento": nessuna logica di
// avatar/sentinella master, solo id+nome dell'Evento, numerato ed
// elencato dal più recente al meno recente. Il numero è cronologico (1 =
// il primo evento della campagna) e NON dipende dall'ordine di
// visualizzazione: è lo stesso "Evento 3" di cui si parla nel gergo LARP,
// un riferimento fisso, non la posizione nella tendina.
export const getEventFieldItems = (
  allId: string,
  events: { id: number; name: string; dateEventStart: Date }[]
): IListItem[] => {
  const chronological = [...events].sort(
    (a, b) => a.dateEventStart.getTime() - b.dateEventStart.getTime()
  );
  const numberById = new Map(
    chronological.map((event, index) => [event.id, index + 1])
  );

  const mostRecentFirst = [...events].sort(
    (a, b) => b.dateEventStart.getTime() - a.dateEventStart.getTime()
  );

  return [
    { id: allId, label: "Nessuno" },
    ...mostRecentFirst.map(event => ({
      id: event.id,
      label: `${numberById.get(event.id)}. ${event.name}`,
    })),
  ];
};

// `FieldDate` (input HTML `type="date"`) vuole `YYYY-MM-DD`: stesso
// pattern già usato altrove nel progetto per convertire un `Date` nel
// value di un campo data (`characterEditor.service.ts`,
// `useCharacterEditorDraft.ts`).
export const toDateInputValue = (date: Date): string =>
  date.toISOString().slice(0, 10);

// Stesso pattern di `parseSenderParam`/`parseReceiverParam`: `1` (prima
// pagina) se il param manca o non è un intero positivo valido.
export const parsePageParam = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

// Tab "Posta in arrivo"/"Inviate"/"Tutte le missive": default `"inbox"` se
// il param manca o non è uno dei tre valori validi, stesso pattern di
// `parsePageParam`.
export const parseBoxParam = (value: string | null): MissiveBox => {
  const parsed = missiveBoxEnum.safeParse(value);
  return parsed.success ? parsed.data : "inbox";
};
