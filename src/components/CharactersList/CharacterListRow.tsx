import Link from "next/link";
import Text from "../_core/Text";
import AvatarUser from "../AvatarUser";
import Badge from "../_core/Badge";
import BadgeCharacterStatus from "../BadgeCharacterStatus";
import BadgeCharacterType from "../BadgeCharacterType";
import { getCharacterStatus } from "../BadgeCharacterStatus/status";
import formatDate from "@/lib/utils/formatDate";
import type { Character } from "@/lib/validations/character";
import Divider from "@/components/_core/Divider";

export interface ICharacterListRow {
  character: Character;
  href: string;
  showOwnerAvatar?: boolean;
}

const CharacterListRow = ({
  character,
  href,
  showOwnerAvatar,
}: ICharacterListRow) => {
  return (
    <>
      <Link
        href={href as never}
        className="flex w-full items-center gap-2 p-2 text-left rounded hover:bg-accent"
      >
        <AvatarUser src={character.avatar ?? undefined} text={character.name} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 text-muted-fg">
            <Text
              size={0}
              className="text-muted-fg"
              ellipsis
              children={`ultima modifica il ${formatDate(character.lastUpdateDate)}`}
            />

            <div className="flex-1" />
            {showOwnerAvatar && <Badge disabled label={character.userName} />}
            {character.type !== "pg" && (
              <BadgeCharacterType type={character.type} />
            )}
            <BadgeCharacterStatus status={getCharacterStatus(character)} />
          </div>
          <div className="flex items-center gap-2">
            <Text
              weight="bolder"
              ellipsis
              className="flex-1"
              children={character.name}
            />
          </div>
        </div>
      </Link>
      <Divider className="last:hidden mx-2" />
    </>
  );
};

export default CharacterListRow;
