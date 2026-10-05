import HeroPage from "../HeroPage";
import MarkDowntimeRead from "./MarkDowntimeRead";
import DowntimeMasterEditor from "./DowntimeMasterEditor";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import FieldRichText from "@/components/_core/FieldRichText";
import AvatarUser from "@/components/AvatarUser";
import Badge from "@/components/_core/Badge";
import formatDate from "@/lib/utils/formatDate";
import {
  DOWNTIME_STATUS_CONFIG,
  type DowntimeStatus,
} from "@/lib/downtime/status";

export interface DowntimeReaderAuthor {
  avatar: string | null;
  name: string;
  userName: string | null;
}

export interface DowntimeReaderProps {
  campaignSlug: string;
  downtimeId: number;
  subject: string;
  categoryName: string;
  description: string;
  author: DowntimeReaderAuthor;
  markAsRead: boolean;
  status: DowntimeStatus;
  response: string | null;
  // Nota riservata (T-0xx): mai passata a un giocatore dal chiamante (page/
  // route) — qui semplicemente non renderizzata se assente.
  masterNote: string | null;
  creationDate: Date | null;
  updateDate: Date | null;
  isMaster: boolean;
}

const DowntimeReader = ({
  campaignSlug,
  downtimeId,
  subject,
  categoryName,
  description,
  author,
  markAsRead,
  status,
  response,
  masterNote,
  creationDate,
  updateDate,
  isMaster,
}: DowntimeReaderProps) => {
  const statusConfig = DOWNTIME_STATUS_CONFIG[status];

  return (
    <>
      {markAsRead && (
        <MarkDowntimeRead campaignSlug={campaignSlug} downtimeId={downtimeId} />
      )}

      <HeroPage
        title={`${categoryName} · ${subject}`}
        action={
          <Badge
            color={statusConfig.color}
            icon={statusConfig.icon}
            label={statusConfig.label}
          />
        }
      />
      <Card className="flex-col items-stretch gap-2 p-2">
        <div className="flex flex-1 items-center gap-3">
          <AvatarUser src={author.avatar ?? undefined} text={author.name} />
          <div className="min-w-0 flex-col flex-1 items-center">
            <div className="flex flex-1 items-center">
              <Text
                className="flex-1"
                size={2}
                weight="bolder"
                ellipsis
                children={author.name}
              />
              <Text
                size={0}
                className="text-muted-fg"
                children={formatDate(creationDate)}
              />
            </div>

            {author.userName && (
              <Text
                size={0}
                className="text-muted-fg"
                ellipsis
                children={author.userName}
              />
            )}
          </div>
        </div>

        <FieldRichText
          className="border-transparent bg-transparent"
          value={description}
          disabled
        />
      </Card>

      {isMaster ? (
        // Il master gestisce stato/risposta/nota riservata direttamente qui,
        // senza alcuna modale di conferma — vedi `DowntimeMasterEditor`.
        <DowntimeMasterEditor
          campaignSlug={campaignSlug}
          downtimeId={downtimeId}
          status={status}
          response={response}
          masterNote={masterNote}
        />
      ) : (
        response && (
          <Card className="flex-col items-stretch gap-2 p-2">
            <div className="flex items-center justify-between gap-3">
              <Text size={0} className="text-muted-fg" children="Risposta" />
              {updateDate && (
                <Text
                  size={0}
                  className="text-muted-fg"
                  children={formatDate(updateDate)}
                />
              )}
            </div>
            <FieldRichText
              className="border-transparent bg-transparent"
              value={response}
              disabled
            />
          </Card>
        )
      )}
    </>
  );
};

export default DowntimeReader;
