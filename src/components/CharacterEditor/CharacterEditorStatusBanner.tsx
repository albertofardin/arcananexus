import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import { CHARACTER_STATUS } from "@/lib/constants";
import type { CharacterStatus } from "@/components/BadgeCharacterStatus";

const READONLY_MESSAGE: Partial<Record<CharacterStatus, string>> = {
  review:
    "Personaggio in revisione - potrai modificare la scheda dopo l'approvazione dello staff",
  parked:
    "Personaggio in pausa - la scheda è di sola lettura finché lo staff non lo riattiva",
  dead: "Personaggio deceduto - la scheda è di sola lettura",
};

// Mostrato solo quando il viewer corrente (giocatore, o master in player
// view) non può editare la scheda a causa dello status — mai per il master
// in `viewingAsMaster` (lui può sempre editare, vedi `canEdit` in
// `useCharacterEditorDraft`).
const CharacterEditorStatusBanner = ({
  status,
}: {
  status: CharacterStatus;
}) => {
  const message = READONLY_MESSAGE[status];
  if (!message) return null;

  const { icon, color } = CHARACTER_STATUS[status];

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, var(--bg))`,
        color: `color-mix(in srgb, #000000 15%, ${color})`,
      }}
    >
      <Icon className="text-inherit shrink-0" children={icon} />
      <Text weight="bolder" className="text-inherit" children={message} />
    </div>
  );
};

export default CharacterEditorStatusBanner;
