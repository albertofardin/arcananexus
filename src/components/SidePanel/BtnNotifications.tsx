"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Btn from "@/components/_core/Btn";
import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import Modal from "@/components/_core/Modal";
import Popover from "@/components/_core/Popover";
import Divider from "@/components/_core/Divider";
import CircularProgress from "@/components/_core/CircularProgress";
import AvatarUser from "@/components/AvatarUser";
import BadgeCount from "@/components/BadgeCount";
import formatDate from "@/lib/utils/formatDate";
import formatCurrency from "@/lib/utils/formatCurrency";
import { cn } from "@/lib/utils";
import { routes } from "@/app/routes";
import { themeColors } from "@/app/themes";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteAllNotifications,
} from "@/lib/queries/notifications";
import type { NotificationListItemDto } from "@/lib/validations/notification";
import type { DowntimeStatus } from "@/lib/downtime/status";
import type { CharacterStatus } from "@/components/BadgeCharacterStatus/status";

// Frase per la notifica di cambio stato rivolta all'AUTORE di una downtime
// (`item.isAuthor`, vedi `getNotificationCopy` sotto) — participio passato,
// non l'etichetta standalone di `DOWNTIME_STATUS_CONFIG` ("Approvata" ecc,
// pensata per un badge, non per incastrarsi in "è stata ...").
const DOWNTIME_STATUS_PHRASE: Record<DowntimeStatus, string> = {
  waiting: "creata",
  approve: "approvata",
  refuse: "rifiutata",
};

// Mirror di `DOWNTIME_STATUS_PHRASE`, ma per lo status derivato di un
// `Character` (`item.isOwner`, vedi `getNotificationCopy` sotto) — participio
// passato che si incastra in `${characterName} è stato ...`.
const CHARACTER_STATUS_PHRASE: Record<CharacterStatus, string> = {
  approved: "approvato",
  parked: "parcheggiato",
  dead: "dichiarato deceduto",
  review: "rimesso in revisione",
};

const NOTIFICATION_ICON: Record<NotificationListItemDto["type"], string> = {
  missive: "mail",
  character_status: "person",
  downtime: "downtime",
  support_new: "support_agent",
  support_reply: "support_agent",
  event_booking: "event_available",
  voucher: "gift_card",
};

// Testo per riga (T-0xx pannello notifiche, FASE 2 — vedi il brief): pura
// composizione di stringa, nessuna logica di dominio nuova. `senderName`/
// `receiverCharacterName`/`ownerUserName` arrivano già risolti server-side
// da `listNotificationsForUser` (`notification.repository.ts`).
function getNotificationCopy(item: NotificationListItemDto): {
  primary: string;
  secondary?: string;
} {
  if (item.type === "missive") {
    if (item.isCommunication) {
      // Nessun "da X" per una Comunicazione: il mittente risolto è sempre il
      // testo generico "Comunicazione", ridondante da ripetere qui.
      return { primary: `Comunicazione: ${item.subject}` };
    }

    const primary = item.isMasterReceiver
      ? `Risposta da ${item.senderName}`
      : item.isReply
        ? `Risposta da ${item.senderName} a ${item.receiverCharacterName ?? "Personaggio eliminato"}`
        : `Missiva da ${item.senderName} a ${item.receiverCharacterName ?? "Personaggio eliminato"}`;

    return {
      primary,
      secondary:
        item.subject && item.subject !== primary ? item.subject : undefined,
    };
  }

  if (item.type === "support_new") {
    return {
      primary: `Nuova segnalazione di ${item.authorName}`,
      secondary: item.subject,
    };
  }

  if (item.type === "support_reply") {
    return {
      primary: `${item.authorName} ha risposto alla segnalazione`,
      secondary: item.subject,
    };
  }

  if (item.type === "event_booking") {
    return {
      primary: `Sei stato iscritto all'evento ${item.eventName}`,
      secondary: "Iscrizione gratuita da parte dello staff",
    };
  }

  if (item.type === "voucher") {
    return {
      primary: `Hai ricevuto un buono di ${formatCurrency(String(item.amount))}`,
      secondary: "Verrà scalato dalla tua prossima iscrizione a un evento",
    };
  }

  if (item.type === "character_status") {
    // `isOwner` (T-050): stesso `NotificationType.character_status` per due
    // eventi opposti — un master/head_master avvisato di un NUOVO PG altrui in
    // revisione (`isOwner: false`), oppure il proprietario avvisato che lo
    // staff ha cambiato lo status del SUO personaggio (`isOwner: true`). Mai
    // dedotto da `status` da solo, stesso principio di `isAuthor` sotto per il
    // downtime.
    if (item.isOwner) {
      return {
        primary: `${item.characterName} è stato ${CHARACTER_STATUS_PHRASE[item.status]}`,
      };
    }
    return {
      primary: `Nuovo PG di ${item.ownerUserName} in revisione`,
    };
  }

  // `isAuthor` (T-0xx): stesso `NotificationType.downtime` per due eventi
  // opposti — un master configurato avvisato di una NUOVA downtime altrui
  // (`isAuthor: false`), oppure l'autore stesso avvisato che il master ha
  // cambiato stato/risposto alla SUA downtime (`isAuthor: true`). Mai dedurlo
  // da `status`/`response` qui: il flag arriva già risolto server-side
  // confrontando il destinatario con `Character.userId` (vedi
  // `notification.repository.ts`).
  if (item.isAuthor) {
    const primary = `Downtime "${item.categoryName}" è stata ${DOWNTIME_STATUS_PHRASE[item.status]}`;
    return {
      primary,
      secondary: item.subject ?? undefined,
    };
  }

  const primary = `Downtime di ${item.characterName} per "${item.categoryName}"`;
  return {
    primary,
    secondary:
      item.subject && item.subject !== primary ? item.subject : undefined,
  };
}

// Destinazione al click (vedi il brief per la scelta di ciascuna pagina —
// `character_status` risolta a `campaignCharacter`, la pagina dove
// `CharacterEditor` espone i controlli di approvazione, vedi
// `approvalDate` in `CharacterEditor.tsx`).
function resolveNotificationHref(item: NotificationListItemDto): string {
  switch (item.type) {
    case "missive":
      return routes.campaignMissiveDetail(item.campaignSlug, item.actionId);
    case "character_status":
      return routes.campaignCharacter(item.campaignSlug, item.characterId);
    case "downtime":
      return routes.campaignDowntimeDetail(item.campaignSlug, item.actionId);
    case "event_booking":
      return routes.event(item.campaignSlug, item.eventId);
    case "support_new":
    case "support_reply":
      return routes.profileSupportTicket(item.ticketId);
    case "voucher":
      return routes.profileMembership();
  }
}

// "Supporto" (T-0xx) non ha una campagna (vedi `SupportNotificationDetails`
// in `notification.repository.ts`): l'avatar/etichetta al posto del logo di
// campagna diventa un'icona generica + "Supporto", stesso trattamento per
// entrambi i tipi `support_new`/`support_reply`.
const SUPPORT_LABEL = "Supporto";

function getNotificationSourceLabel(item: NotificationListItemDto): {
  name: string;
  logo?: string | null;
  color: string;
} {
  // Notifiche senza campagna (es. "Supporto"): colore neutro `--button`.
  if (item.type === "support_new" || item.type === "support_reply") {
    return { name: SUPPORT_LABEL, color: "var(--button)" };
  }
  if (item.type === "voucher") {
    return { name: "Associazione", color: "var(--button)" };
  }
  return {
    name: item.campaignName,
    logo: item.campaignLogo,
    color:
      themeColors.find(t => t.id === item.campaignColor)?.swatch ??
      "var(--button)",
  };
}

const NotificationRow = ({
  item,
  onClick,
}: {
  item: NotificationListItemDto;
  onClick: () => void;
}) => {
  const { primary, secondary } = getNotificationCopy(item);
  const source = getNotificationSourceLabel(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-2 rounded p-2 text-left transition-colors hover:bg-accent",
        !item.read && "bg-[color-mix(in_srgb,var(--info)_8%,transparent)]"
      )}
    >
      <AvatarUser
        src={source.logo ?? undefined}
        text={source.name}
        style={
          {
            backgroundColor: `color-mix(in srgb, ${source.color} 20%, white)`,
            "--avatar-fg": source.color,
          } as React.CSSProperties
        }
        textClassName="text-[color:var(--avatar-fg)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-muted-fg">
          <Icon size="sm" children={NOTIFICATION_ICON[item.type]} />
          <Text
            size={0}
            className="text-muted-fg flex-1"
            ellipsis
            children={source.name}
          />
          <Text
            size={0}
            className="text-muted-fg"
            children={formatDate(new Date(item.createdAt))}
          />
          {!item.read && (
            <span
              aria-hidden
              className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--info)]"
            />
          )}
        </div>
        <Text
          weight={item.read ? "regular" : "bolder"}
          ellipsis
          children={primary}
        />
        {secondary && (
          <Text
            size={0}
            className="text-muted-fg"
            ellipsis
            children={secondary}
          />
        )}
      </div>
    </button>
  );
};

// Header condiviso (T-0xx): "Segna tutte come lette" ed "Elimina tutte",
// entrambi disabilitati quando non c'è nulla su cui agire — evita un click a
// vuoto. La pulizia delle notifiche LETTE resta comunque automatica e
// silenziosa (vedi `deleteOldReadNotifications` in
// `notification.repository.ts`, 100 giorni); "Elimina tutte" è l'azione
// manuale esplicita che copre anche le non lette, senza conferma (su
// richiesta esplicita, stessa immediatezza di "Segna tutte come lette").
const NotificationHeader = ({
  unreadCount,
  hasNotifications,
  onMarkAllRead,
  onDeleteAll,
  marking,
  deleting,
  showTitle,
}: {
  unreadCount: number;
  hasNotifications: boolean;
  onMarkAllRead: () => void;
  onDeleteAll: () => void;
  marking: boolean;
  deleting: boolean;
  showTitle: boolean;
}) => (
  <div className="flex items-center justify-between gap-2 p-2">
    {showTitle ? <Text weight="bolder" children="Notifiche" /> : <div />}
    <div className="flex items-center gap-1">
      {unreadCount > 0 && (
        <Btn
          small
          label="Segna come lette"
          icon="chat_done"
          disabled={marking}
          onClick={onMarkAllRead}
        />
      )}
      <Btn
        small
        label="Elimina tutte"
        icon="chat_cancel"
        color="var(--fail)"
        disabled={!hasNotifications || deleting}
        onClick={onDeleteAll}
      />
    </div>
  </div>
);

// Contenuto condiviso da desktop (dentro un `Popover`) e mobile (dentro un
// `Modal` fullscreen) — estratto per non duplicare markup/logica di riga.
// `showTitle` è `false` sotto il `Modal` mobile: la sua title bar mostra già
// "Notifiche" (vedi `BtnNotifications`), qui ripeterlo sarebbe ridondante.
const NotificationList = ({
  notifications,
  loading,
  unreadCount,
  marking,
  deleting,
  showTitle,
  onSelect,
  onMarkAllRead,
  onDeleteAll,
}: {
  notifications: NotificationListItemDto[];
  loading: boolean;
  unreadCount: number;
  marking: boolean;
  deleting: boolean;
  showTitle: boolean;
  onSelect: (item: NotificationListItemDto) => void;
  onMarkAllRead: () => void;
  onDeleteAll: () => void;
}) => (
  <div className="flex flex-col">
    <NotificationHeader
      unreadCount={unreadCount}
      hasNotifications={notifications.length > 0}
      onMarkAllRead={onMarkAllRead}
      onDeleteAll={onDeleteAll}
      marking={marking}
      deleting={deleting}
      showTitle={showTitle}
    />
    <Divider />
    {loading ? (
      <div className="flex items-center justify-center p-8">
        <CircularProgress size={28} />
      </div>
    ) : notifications.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-1 px-3 py-8 text-center">
        <Icon className="text-muted-fg" children="notifications" />
        <Text className="text-muted-fg" children="Nessuna notifica." />
      </div>
    ) : (
      <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto p-1">
        {notifications.map(item => (
          <NotificationRow
            key={item.id}
            item={item}
            onClick={() => onSelect(item)}
          />
        ))}
      </div>
    )}
  </div>
);

const BtnNotifications = ({ onClose }: { onClose?: () => void }) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  const openPanel = React.useCallback(() => setOpen(true), []);
  const closePanel = React.useCallback(() => setOpen(false), []);

  const { data, isPending } = useNotifications();
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const [marking, setMarking] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Badge numerico sull'icona app (T-0xx, Badging API): non tipizzata nel
  // lib DOM di TypeScript, da cui il cast locale. Aggiornato a ogni poll di
  // `useNotifications` (30s) — copre anche i casi non coperti dal push
  // (badge impostato dal service worker, vedi `public/sw.js`), es. Safari
  // dove il service worker non gira mentre l'app non è in primo piano.
  React.useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    if (unreadCount > 0) {
      nav.setAppBadge(unreadCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [unreadCount]);

  const handleSelect = React.useCallback(
    (item: NotificationListItemDto) => {
      const href = resolveNotificationHref(item);
      if (!item.read) {
        // Fire-and-forget: non serve attendere la risposta per navigare, la
        // cache si aggiorna quando la mutation risolve (vedi
        // `markNotificationRead` in `lib/queries/notifications.ts`).
        markNotificationRead(item.id)
          .then(() =>
            queryClient.invalidateQueries({ queryKey: ["notifications"] })
          )
          .catch(err => console.error(err));
      }
      router.push(href as never);
      closePanel();
      onClose?.();
    },
    [router, queryClient, closePanel, onClose]
  );

  const handleMarkAllRead = React.useCallback(() => {
    setMarking(true);
    markAllNotificationsRead()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["notifications"] })
      )
      .catch(err => console.error(err))
      .finally(() => setMarking(false));
  }, [queryClient]);

  const handleDeleteAll = React.useCallback(() => {
    setDeleting(true);
    deleteAllNotifications()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["notifications"] })
      )
      .catch(err => console.error(err))
      .finally(() => setDeleting(false));
  }, [queryClient]);

  // `showTitle` (T-0xx): il `Modal` mobile mostra già "Notifiche" nella
  // propria title bar (`title="Notifiche"` sotto) — l'header condiviso non
  // deve ripeterlo lì, solo nel `Popover` desktop, che non ha alcuna title
  // bar propria. Due istanze invece di una sola condivisa: nessun costo
  // reale (solo una delle due è mai montata alla volta, in base a `isMobile`),
  // evita di dover threadare il flag dentro un unico nodo riusato.
  const renderList = (showTitle: boolean) => (
    <NotificationList
      notifications={notifications}
      loading={isPending}
      unreadCount={unreadCount}
      marking={marking}
      deleting={deleting}
      showTitle={showTitle}
      onSelect={handleSelect}
      onMarkAllRead={handleMarkAllRead}
      onDeleteAll={handleDeleteAll}
    />
  );

  // Stesso identico markup/props di `SideButton` (icona + label via `Btn`,
  // `color="var(--panel-accent)"`, `selected` per l'evidenziazione) — T-0xx,
  // richiesto esplicitamente per coerenza visiva col resto della sidebar.
  // I due segnali aggiuntivi (pallino non lette, conteggio) riusano il
  // supporto nativo di `Btn`: `badge` per il pallino (già usato altrove nel
  // design system, vedi `Btn.tsx`), il conteggio è incluso direttamente nella
  // label invece di un overlay custom — stesso componente, nessuna
  // divergenza di stile possibile.
  return (
    <div ref={anchorRef} className="relative">
      <Btn
        className="w-full max-w-none justify-start pl-5 pr-4 gap-3"
        color="var(--panel-accent)"
        selected={open}
        icon={unreadCount ? "bell_ring" : "bell"}
        label="Notifiche"
        onClick={openPanel}
      >
        <BadgeCount count={unreadCount} className="top-2.5 right-3" />
      </Btn>

      {isMobile === null ? null : isMobile ? (
        <Modal
          open={open}
          onClose={closePanel}
          title="Notifiche"
          titleClose
          fullscreen
          contentClassName="p-0"
          content={renderList(false)}
        />
      ) : (
        <Popover
          open={open}
          onClose={closePanel}
          anchorEl={anchorRef.current}
          originAnchor={{ vertical: "top", horizontal: "left" }}
          originTransf={{ vertical: "bottom", horizontal: "left" }}
          style={{ width: 550 }}
        >
          {renderList(true)}
        </Popover>
      )}
    </div>
  );
};

export default BtnNotifications;
