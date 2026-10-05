import * as React from "react";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";

export interface IHeroPage {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

const HeroPage = ({ title, subtitle, action, className }: IHeroPage) => (
  <div
    className={cn(
      "relative flex flex-wrap items-center justify-between gap-3 shrink-0 pl-2",
      className
    )}
  >
    <div className="flex-1">
      <Text size={5} weight="bolder" children={title} />
      {subtitle && (
        <Text weight="lighter" className="text-muted-fg" children={subtitle} />
      )}
    </div>
    {action}
  </div>
);

export default HeroPage;
