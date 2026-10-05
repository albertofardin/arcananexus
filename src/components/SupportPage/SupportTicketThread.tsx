"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import BtnLink from "@/components/_core/BtnLink";
import Modal from "@/components/_core/Modal";
import Badge from "@/components/_core/Badge";
import AvatarUser from "@/components/AvatarUser";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldRichText from "@/components/_core/FieldRichText";
import { useToast } from "@/components/_core/Toast";
import BadgeSupportTicketStatus from "@/components/BadgeSupportTicketStatus";
import { useApiAction } from "@/hooks/useApiAction";
import { useSession } from "@/lib/auth-client";
import { startImpersonation } from "@/lib/queries/impersonation";
import formatDate from "@/lib/utils/formatDate";
import { routes } from "@/app/routes";
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_CONFIG,
  type SupportTicketStatus,
} from "@/lib/support/status";
import type { SupportTicketDetail } from "@/lib/validations/support";

export interface SupportTicketThreadProps {
  ticket: SupportTicketDetail;
}

const WARN_INK = "#1a1200";

const STATUS_ITEMS = SUPPORT_TICKET_STATUSES.map(status => ({
  id: status,
  color: SUPPORT_TICKET_STATUS_CONFIG[status].color,
  label: SUPPORT_TICKET_STATUS_CONFIG[status].label,
  labelStyle: { color: SUPPORT_TICKET_STATUS_CONFIG[status].color },
  icon: SUPPORT_TICKET_STATUS_CONFIG[status].icon,
  iconStyle: { color: SUPPORT_TICKET_STATUS_CONFIG[status].color },
}));

const ThreadMessage = ({
  message,
}: {
  message: SupportTicketDetail["messages"][number];
}) => (
  <Card className={"flex-col items-stretch gap-2 p-2"}>
    <div className="flex flex-1 items-start gap-2">
      <AvatarUser src={message.authorImage} text={message.authorName} circle />
      <div className="min-w-0 flex-col flex-1">
        <div className="flex items-center gap-2">
          <Text weight="bolder" ellipsis children={message.authorName} />
          {message.isStaffAuthor && (
            <Badge
              icon="support_agent"
              label="Staff"
              color="var(--info)"
              className="w-fit"
            />
          )}
        </div>
        <Text
          size={0}
          className="text-muted-fg"
          children={formatDate(message.createdAt, true)}
        />
      </div>
    </div>
    <FieldRichText value={message.body} readOnly disabled />
  </Card>
);

// Thread di una segnalazione (T-0xx, "Supporto"): messaggi in stile chat
// (bolle allineate a seconda di chi ha scritto, ispirato a `MissiveReader`),
// composer sempre visibile (scrivere riapre un ticket risolto/chiuso, vedi
// `addSupportMessage` nel repository), controlli di stato/eliminazione
// riservati allo staff (`ticket.isStaff`).
const SupportTicketThread = ({ ticket }: SupportTicketThreadProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const [content, setContent] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [impersonating, setImpersonating] = React.useState(false);
  const { pending: sending, run: runSend } = useApiAction();
  const { pending: statusPending, run: runStatus } = useApiAction();
  const { pending: deleting, run: runDelete } = useApiAction();

  // Autore della segnalazione = autore del primo messaggio (ordine
  // cronologico): `createSupportTicket` crea ticket e primo messaggio nella
  // stessa transazione con lo stesso authorId, quindi non serve un campo
  // dedicato sul DTO per risalirci.
  const ticketAuthor = ticket.messages[0];
  const canImpersonateAuthor =
    ticket.isStaff &&
    !!ticketAuthor &&
    ticketAuthor.authorId !== session?.user?.id;

  const handleImpersonateAuthor = React.useCallback(async () => {
    if (!ticketAuthor) return;
    setImpersonating(true);
    try {
      await startImpersonation(ticketAuthor.authorId);
      queryClient.clear();
      router.push(routes.home() as never);
      router.refresh();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Impossibile avviare l'impersonazione. Riprova.",
      });
    } finally {
      setImpersonating(false);
    }
  }, [queryClient, router, showToast, ticketAuthor]);

  const handleSend = React.useCallback(() => {
    if (!content.trim()) return;
    return runSend(
      `/api/support/tickets/${ticket.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: content }),
      },
      {
        errorMessage: "Errore durante l'invio del messaggio",
        successMessage: "Messaggio inviato",
        refresh: true,
        onSuccess: () => setContent(""),
      }
    );
  }, [content, runSend, ticket.id]);

  const handleStatusChange = React.useCallback(
    (status: SupportTicketStatus) =>
      runStatus(
        `/api/support/tickets/${ticket.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
        {
          errorMessage: "Errore durante l'aggiornamento dello stato",
          successMessage: "Stato aggiornato",
          refresh: true,
        }
      ),
    [runStatus, ticket.id]
  );

  const handleDelete = React.useCallback(
    () =>
      runDelete(
        `/api/support/tickets/${ticket.id}`,
        { method: "DELETE" },
        {
          errorMessage: "Errore durante l'eliminazione della segnalazione",
          successMessage: "Segnalazione eliminata",
          onSuccess: () => {
            router.push(routes.profileSupport() as never);
            router.refresh();
          },
        }
      ),
    [runDelete, router, ticket.id]
  );

  const isClosed = ticket.status === "risolta" || ticket.status === "chiusa";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <BtnLink
          href={routes.profileSupport()}
          icon="arrow_back"
          label="Torna alle segnalazioni"
        />
        <div className="flex-1" />
        {ticket.isStaff && (
          <>
            {canImpersonateAuthor && (
              <Btn
                variant="light"
                icon="manage_accounts"
                label="Impersona autore"
                className="self-start"
                disabled={impersonating}
                onClick={handleImpersonateAuthor}
              />
            )}
            <Btn
              variant="light"
              color="var(--fail)"
              icon="delete"
              label="Elimina segnalazione"
              className="self-start"
              onClick={() => setDeleteOpen(true)}
            />
          </>
        )}
        {ticket.isStaff ? (
          <FieldSelect
            className="w-[180px] max-w-full bg-card"
            style={{
              borderColor: SUPPORT_TICKET_STATUS_CONFIG[ticket.status].color,
            }}
            value={ticket.status}
            icon={SUPPORT_TICKET_STATUS_CONFIG[ticket.status].icon}
            iconStyle={{
              color: SUPPORT_TICKET_STATUS_CONFIG[ticket.status].color,
            }}
            items={STATUS_ITEMS}
            disabled={statusPending}
            onChange={value => handleStatusChange(value as SupportTicketStatus)}
          />
        ) : (
          <BadgeSupportTicketStatus status={ticket.status} />
        )}
      </div>

      <Text size={5} weight="bolder" children={ticket.subject} />

      <div className="flex flex-col gap-2">
        {ticket.messages.map(message => (
          <ThreadMessage key={message.id} message={message} />
        ))}
      </div>

      {isClosed && (
        <div
          className="flex flex-col gap-1 rounded-lg p-3"
          style={{ backgroundColor: "var(--warn)" }}
        >
          <Text
            size={0}
            style={{ color: WARN_INK }}
            children={`Questa segnalazione è stata contrassegnata come ${SUPPORT_TICKET_STATUS_CONFIG[ticket.status].label.toLowerCase()}. Scrivendo un nuovo messaggio la riaprirai.`}
          />
        </div>
      )}

      <Card className="flex-col items-stretch gap-2 p-2">
        <FieldRichText
          placeholder="Scrivi un messaggio..."
          value={content}
          onChange={setContent}
          uploadEndpoint="supportAttachmentUploader"
        />
        <Btn
          className="self-end text-center w-[200px]"
          variant="bold"
          labelPosition
          label="INVIA"
          icon="send"
          disabled={!content.trim() || sending}
          onClick={handleSend}
        />
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Elimina segnalazione"
        content={
          <Text children="Questa azione è definitiva, la segnalazione e tutti i messaggi verranno eliminati. Continuare?" />
        }
        actionsLoading={deleting}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setDeleteOpen(false)} />
            <Btn
              variant="bold"
              color="var(--fail)"
              label="ELIMINA"
              onClick={handleDelete}
            />
          </>
        }
      />
    </>
  );
};

export default SupportTicketThread;
