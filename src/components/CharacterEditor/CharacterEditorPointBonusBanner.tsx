import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import type { PointBonus } from "@/lib/features/pointBonus";

// Un banner per ogni bonus/malus di punti missive/downtime assegnato dal
// master a questo personaggio, con la sua motivazione. Visibile a tutti
// (master e giocatore), sotto l'Hero come `CharacterEditorStatusBanner`.
const CharacterEditorPointBonusBanner = ({
  missive,
  downtime,
}: {
  missive: PointBonus[];
  downtime: PointBonus[];
}) => {
  const items = [
    ...missive.map(b => ({ ...b, icon: "mail", label: "missive" })),
    ...downtime.map(b => ({ ...b, icon: "downtime", label: "downtime" })),
  ];

  return items.map((b, i) => {
    const color = b.points > 0 ? "var(--succ)" : "var(--fail)";
    return (
      <div
        key={i}
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 12%, var(--bg))`,
          color: `color-mix(in srgb, #000000 15%, ${color})`,
        }}
      >
        <Icon className="text-inherit shrink-0" children={b.icon} />
        <Text
          weight="bolder"
          className="text-inherit"
          children={`${b.points > 0 ? "Bonus" : "Malus"} ${b.points > 0 ? "+" : ""}${b.points} punti ${b.label} - ${b.reason}`}
        />
      </div>
    );
  });
};

export default CharacterEditorPointBonusBanner;
