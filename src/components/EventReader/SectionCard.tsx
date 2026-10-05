import * as React from "react";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import { cn } from "@/lib/utils";

export interface ISectionCard {
  icon?: string;
  title?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Card di sezione con intestazione icona+titolo (pagine di dettaglio) */
const SectionCard = ({
  icon,
  title,
  badge,
  children,
  className,
}: ISectionCard) => (
  <Card className={cn("flex-col items-stretch gap-3 p-4", className)}>
    {(icon || title) && (
      <div className="flex flex-wrap items-center gap-2">
        {icon && <Icon className="text-muted-fg" children={icon} />}
        {title && <Text size={3} weight="bolder" children={title} />}
        <div className="flex-1" />
        {badge}
      </div>
    )}
    {children}
  </Card>
);

export default SectionCard;
