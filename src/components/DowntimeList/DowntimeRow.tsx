import Link from "next/link";
import Divider from "../_core/Divider";
import Text from "../_core/Text";
import AvatarUser from "../AvatarUser";
import Badge from "../_core/Badge";
import Avatar from "../_core/Avatar";
import formatDate from "@/lib/utils/formatDate";
import { type DowntimeListItem } from "@/lib/validations/downtime";
import { DOWNTIME_STATUS_CONFIG } from "@/lib/downtime/status";
import { routes } from "@/app/routes";

export interface DowntimeRowProps {
  campaignSlug: string;
  downtime: DowntimeListItem;
}

const DowntimeRow = ({ campaignSlug, downtime }: DowntimeRowProps) => {
  const href = routes.campaignDowntimeDetail(campaignSlug, downtime.id);
  const read = downtime.readDate;
  const { icon, label, color } = DOWNTIME_STATUS_CONFIG[downtime.status];

  return (
    <>
      <Link
        href={href as never}
        className="group flex items-center gap-2 p-2 rounded hover:bg-accent"
      >
        <AvatarUser
          src={downtime.author.avatar ?? undefined}
          text={downtime.author.name}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-muted-fg">
            <Text
              size={0}
              className="text-muted-fg flex-1"
              ellipsis
              children={downtime.author.name}
            />
            <Badge
              color={read ? "var(--muted-fg)" : "var(--info)"}
              icon={read ? "mail_outline" : "mail"}
              tooltip={
                read
                  ? `Letta il ${formatDate(downtime.readDate)}`
                  : "Nessun master ha ancora letto questo downtime"
              }
              background={!read}
              label={formatDate(downtime.creationDate)}
              labelPosition
              className="h-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Text
              weight="bolder"
              ellipsis
              className="flex-1"
              children={`${downtime.category.toLocaleUpperCase()} · ${downtime.subject}`}
            />
          </div>
        </div>
        <Avatar
          icon={icon}
          iconStyle={{ color: `color-mix(in srgb, #000000 10%, ${color})` }}
          tooltip={label}
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 10%, #ffffff)`,
          }}
        />
      </Link>
      <Divider className="last:hidden mx-2" />
    </>
  );
};

export default DowntimeRow;
