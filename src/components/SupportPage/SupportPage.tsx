"use client";

import * as React from "react";
import ModalNewSupportTicket from "./ModalNewSupportTicket";
import SupportTicketRow from "./SupportTicketRow";
import SupportHero from "./SupportHero";
import Card from "@/components/_core/Card";
import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import { EmptyCard } from "@/components/Feedback";
import type { SupportTicketListItemDto } from "@/lib/validations/support";

const OPEN_STATUSES = new Set(["in_attesa", "in_lavorazione"]);

export interface SupportPageProps {
  tickets: SupportTicketListItemDto[];
  isStaff: boolean;
}

// Pagina "Supporto" (T-0xx): hero scuro con logo/wordmark/versione, CTA per
// aprire una nuova segnalazione, elenco delle conversazioni (tutte per lo
// staff, solo le proprie altrimenti — la distinzione è già stata fatta
// server-side, `isStaff` qui serve solo a decidere se mostrare l'autore in
// lista).
const SupportPage = ({ tickets, isStaff }: SupportPageProps) => {
  const [modalOpen, setModalOpen] = React.useState(false);

  const sorted = [...tickets].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const openTickets = sorted.filter(t => OPEN_STATUSES.has(t.status));
  const closedTickets = sorted.filter(t => !OPEN_STATUSES.has(t.status));

  return (
    <>
      <SupportHero />

      <Card className="flex-col items-stretch gap-4 p-5 sm:flex-row sm:items-center sm:gap-4 sm:p-4 sm:py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-full bg-muted-bg sm:self-auto">
          <Icon size="lg" className="text-muted-fg" children="support_agent" />
        </div>
        <div className="flex flex-1 flex-col gap-0 text-center sm:text-left">
          <Text
            size={3}
            weight="bolder"
            children="Un problema, un dubbio o un'idea?"
          />
          <Text size={0} className="text-muted-fg">
            Apri una segnalazione: il team la leggerà e ti risponderà proprio
            qui. Ogni messaggio ci aiuta a rendere Arcana Nexus ancora migliore.
          </Text>
        </div>
        <Btn
          variant="bold"
          icon="add"
          label="Nuova segnalazione"
          className="text-center w-full shrink-0 sm:w-auto"
          onClick={() => setModalOpen(true)}
        />
      </Card>

      <div className="flex flex-col gap-2">
        <Text
          size={2}
          weight="bolder"
          children={isStaff ? "Tutte le segnalazioni" : "Le tue segnalazioni"}
        />
        {tickets.length === 0 ? (
          <EmptyCard
            icon="support_agent"
            title="Nessuna segnalazione"
            message={
              isStaff
                ? "Non ci sono ancora segnalazioni aperte."
                : "Non hai ancora aperto nessuna segnalazione."
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Text
                size={1}
                weight="bolder"
                className="text-muted-fg"
                children={`Aperte / in lavorazione (${openTickets.length})`}
              />
              {openTickets.length === 0 ? (
                <EmptyCard
                  icon="support_agent"
                  title="Nessuna segnalazione aperta"
                  message="Non ci sono segnalazioni in attesa o in lavorazione."
                />
              ) : (
                <Card className="flex-col items-stretch p-2">
                  {openTickets.map(ticket => (
                    <SupportTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      showAuthor={isStaff}
                    />
                  ))}
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Text
                size={1}
                weight="bolder"
                className="text-muted-fg"
                children={`Chiuse / risolte (${closedTickets.length})`}
              />
              {closedTickets.length === 0 ? (
                <EmptyCard
                  icon="support_agent"
                  title="Nessuna segnalazione chiusa"
                  message="Non ci sono ancora segnalazioni risolte o chiuse."
                />
              ) : (
                <Card className="flex-col items-stretch p-2">
                  {closedTickets.map(ticket => (
                    <SupportTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      showAuthor={isStaff}
                    />
                  ))}
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <ModalNewSupportTicket
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};

export default SupportPage;
