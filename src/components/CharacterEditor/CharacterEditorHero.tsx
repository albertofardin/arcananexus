"use client";

import type { CharacterType } from "@prisma/client";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import HeroBanner from "@/components/HeroBanner";
import AvatarUpload from "@/components/AvatarUpload";
import BadgeCharacterStatus, {
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus";
import FieldCharacterType from "@/components/FieldCharacterType";
import { CHARACTER_STATUS } from "@/lib/constants";
import { IPopoverListItem } from "@/components/_core/PopoverList";

const STATUS_ITEMS: IPopoverListItem[] = (
  ["review", "approved", "parked", "dead"] as const
).map(status => ({
  id: status,
  label: CHARACTER_STATUS[status].label,
  icon: CHARACTER_STATUS[status].icon,
  iconStyle: { color: CHARACTER_STATUS[status].color },
}));

const CharacterEditorHero = ({
  characterId,
  avatar,
  onAvatarChange,
  name,
  onNameChange,
  playerName = "",
  isMaster = false,
  viewingAsMaster = false,
  canEdit = false,
  type,
  onTypeChange,
  status,
  onStatusChange,
  masterView = false,
  onMasterViewChange,
}: {
  characterId?: number;
  avatar: string | null;
  onAvatarChange: (avatar: string | null) => void;
  name: string;
  onNameChange: (name: string) => void;
  playerName?: string;
  isMaster?: boolean;
  viewingAsMaster?: boolean;
  canEdit?: boolean;
  type: CharacterType;
  onTypeChange: (type: CharacterType) => void;
  status: CharacterStatus;
  onStatusChange: (next: string | number) => void;
  masterView?: boolean;
  onMasterViewChange?: (masterView: boolean) => void;
}) => {
  const statusConfig = CHARACTER_STATUS[status];

  return (
    <HeroBanner>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:gap-6">
        <AvatarUpload
          size={90}
          endpoint={characterId ? `/api/characters/${characterId}/avatar` : ""}
          uploadInput={
            characterId ? { target: "character", characterId } : undefined
          }
          src={avatar}
          text={name}
          disabled={!characterId || !canEdit}
          disabledMessage={
            !characterId
              ? "Salva prima il personaggio per caricare l'avatar"
              : "Puoi modificare la scheda solo se il personaggio è attivo"
          }
          onChange={onAvatarChange}
        />
        <div className="flex min-w-0 flex-col w-full justify-between items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[42px]">
            {viewingAsMaster ? (
              <FieldText
                className="min-w-0 flex-1 bg-transparent border-transparent hover:border-border focus-within:border-border"
                inputClassName="text-white text-[24px] py-2 font-bold tracking-[0.012em]"
                placeholder="Nome del personaggio..."
                value={name}
                icon="edit"
                iconClassName="text-white/50"
                disabled={!canEdit}
                onChange={onNameChange}
              />
            ) : (
              <Text
                size={5}
                weight="bolder"
                ellipsis
                className="min-w-0 flex-1 text-white"
                children={name}
              />
            )}
            {viewingAsMaster ? (
              <div className="flex w-full gap-2 sm:w-auto">
                <FieldCharacterType
                  className="bg-card min-w-0 flex-1 sm:w-[150px] sm:flex-none"
                  value={type}
                  onChange={next => next && onTypeChange(next)}
                />
                <FieldSelect
                  className="bg-card min-w-0 flex-1 sm:w-[150px] sm:flex-none"
                  icon={statusConfig.icon}
                  iconStyle={{ color: statusConfig.color }}
                  value={status}
                  items={STATUS_ITEMS}
                  onChange={onStatusChange}
                />
              </div>
            ) : (
              <BadgeCharacterStatus status={status} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Text
              className="mt-1 text-white/70"
              size={2}
              ellipsis
              children={playerName}
            />
            {isMaster && (
              <Btn
                className="w-[146px] shrink-0"
                icon={masterView ? "master" : "person"}
                iconClassName="text-card"
                labelClassName="text-card text-right"
                labelPosition
                label={masterView ? "Master View" : "Player View"}
                onClick={() => onMasterViewChange?.(!masterView)}
              />
            )}
          </div>
        </div>
      </div>
    </HeroBanner>
  );
};

export default CharacterEditorHero;
