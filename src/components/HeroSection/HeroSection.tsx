import * as React from "react";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";
import Avatar from "@/components/_core/Avatar";

export interface IHeroSection {
  className?: string;
  icon: string;
  title: string;
  subtitle?: string;
  color?: string;
  titleSize?: 1 | 2 | 3 | 4 | 5 | 6;
  action?: React.ReactNode;
}

const HeroSection = ({
  className,
  icon,
  title,
  subtitle,
  color = "var(--primary)",
  titleSize = 2,
  action,
}: IHeroSection) => {
  return (
    <div
      className={cn(
        "w-full flex flex-wrap items-center justify-start gap-3 shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar
          icon={icon}
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          }}
        />
        <div className="min-w-0 flex-1">
          <Text size={titleSize} weight="bolder" children={title} />
          {subtitle && <Text className="text-muted-fg" children={subtitle} />}
        </div>
      </div>
      <div className="flex-1" />
      {action}
    </div>
  );
};

export default HeroSection;
