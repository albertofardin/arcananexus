import Link from "next/link";
import Divider from "@/components/_core/Divider";
import Text from "@/components/_core/Text";
import BadgeSupportTicketStatus from "@/components/BadgeSupportTicketStatus";
import formatDate from "@/lib/utils/formatDate";
import { routes } from "@/app/routes";
import type { SupportTicketListItemDto } from "@/lib/validations/support";

export interface SupportTicketRowProps {
  ticket: SupportTicketListItemDto;
  // Mostra l'autore solo nella vista staff ("tutti i ticket"): nella
  // propria lista sarebbe sempre e solo il viewer stesso, ridondante.
  showAuthor: boolean;
}

// Riga di lista di una segnalazione (T-0xx), stesso layout di
// `DowntimeRow`/`MissiveRow`: click → thread, badge di stato a destra,
// anteprima dell'ultimo messaggio come sottotitolo.
const SupportTicketRow = ({ ticket, showAuthor }: SupportTicketRowProps) => (
  <>
    <Link
      href={routes.profileSupportTicket(ticket.id) as never}
      className="group flex items-center gap-2 p-2 rounded hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Text
            weight="bolder"
            ellipsis
            className="flex-1"
            children={ticket.subject}
          />
        </div>
        <div className="flex items-center gap-1 text-muted-fg">
          {showAuthor && (
            <Text
              size={0}
              className="text-muted-fg"
              children={`${ticket.author.name} · `}
            />
          )}
          <Text
            size={0}
            className="text-muted-fg flex-1"
            ellipsis
            children={ticket.lastMessagePreview ?? "Nessun messaggio"}
          />
        </div>
      </div>
      <Text
        size={0}
        className="text-muted-fg"
        children={formatDate(ticket.updatedAt)}
      />
      <BadgeSupportTicketStatus status={ticket.status} />
    </Link>
    <Divider className="last:hidden mx-2" />
  </>
);

export default SupportTicketRow;
