"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ICON_MAP, FALLBACK_ICON } from "./icon-map";
import { cn } from "@/lib/utils";

export interface IIcon extends React.HTMLAttributes<HTMLSpanElement> {
  children: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<IIcon["size"]>, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

const Icon = React.forwardRef<HTMLSpanElement, IIcon>((props, ref) => {
  const { className, style, children, size = "md", ...other } = props;

  return (
    <span
      {...other}
      ref={ref}
      style={style}
      className={cn(
        "m-0 inline-block whitespace-nowrap",
        "leading-none",
        sizeMap[size],
        "text-fg antialiased",
        className
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={ICON_MAP[children] ?? FALLBACK_ICON}
        color="currentColor"
        className="h-[1em] w-[1em]"
      />
      {/* Preserva il nome accessibile che il vecchio font a legature dava
          "gratis" via testContent (es. bottoni icon-only senza aria-label
          esplicito, vedi Btn/BtnIcon): non visibile, ma letto dagli screen
          reader e usato da testing-library per query by role/name. */}
      <span className="sr-only">{children}</span>
    </span>
  );
});

Icon.displayName = "Icon";

export default Icon;
