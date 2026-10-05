import Link from "next/link";
import React from "react";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import AvatarUser from "@/components/AvatarUser";
import Divider from "@/components/_core/Divider";
import HeroBanner from "@/components/HeroBanner";
import { cn } from "@/lib/utils";

export interface CharacterSummary {
  id: number;
  name: string;
  avatar: string | null;
  characterHref: string;
  downtimePoints: number | null;
  downtimeMax: number | null;
  missivePoints: number | null;
  missiveMax: number | null;
  xpAvailable: number;
}

const StatBadge = ({
  icon,
  label,
  className,
}: {
  icon: string;
  label: string;
  className?: string;
}) => (
  <span className={cn("flex items-center gap-1", className)}>
    <Text className="text-white" children={label} />
    <Icon className="text-white" children={icon} />
  </span>
);

const CardCharacterSummary = ({
  characters,
}: {
  characters: CharacterSummary[];
}) => {
  return (
    <HeroBanner className="">
      <div className="flex flex-col items-stretch gap-0">
        {characters.map(character => (
          <React.Fragment key={character.id}>
            <Link
              href={character.characterHref as never}
              className="flex w-full items-center gap-3 p-2 pr-4 text-left rounded hover:bg-[rgba(255,255,255,0.2)]"
            >
              <AvatarUser
                src={character.avatar ?? undefined}
                text={character.name}
                className="text-2xl font-bold border border-white"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Text
                  className="min-w-0 flex-1 text-white"
                  size={2}
                  ellipsis
                  children={character.name}
                />
                <div className="flex flex-wrap items-between gap-2 self-end sm:self-start">
                  <StatBadge icon="stars" label={`${character.xpAvailable}`} />
                  {character.downtimePoints !== null && (
                    <StatBadge
                      className="ml-2"
                      icon="downtime"
                      label={`${character.downtimePoints}/${character.downtimeMax}`}
                    />
                  )}
                  {character.missivePoints !== null && (
                    <StatBadge
                      className="ml-2"
                      icon="mail"
                      label={`${character.missivePoints}/${character.missiveMax}`}
                    />
                  )}
                </div>
              </div>
            </Link>
            <Divider className="last:hidden mx-2" />
          </React.Fragment>
        ))}
      </div>
    </HeroBanner>
  );
};

export default CardCharacterSummary;
