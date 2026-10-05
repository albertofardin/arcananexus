import Text from "@/components/_core/Text";
import { cn } from "@/lib/utils";

const MAX_BADGE_COUNT = 99;

/** Badge rosso col conteggio notifiche non lette. Posizionato `absolute`:
 * il genitore deve essere `relative`, `className` regola la posizione. */
const BadgeCount = ({
  count,
  className,
}: {
  count: number;
  className?: string;
}) =>
  count > 0 ? (
    <Text
      style={{ lineHeight: 1 }}
      className={cn(
        "text-white bg-fail absolute rounded-full py-1 px-1.5",
        className
      )}
      size={0}
      children={count > MAX_BADGE_COUNT ? "99+" : String(count)}
    />
  ) : null;

export default BadgeCount;
