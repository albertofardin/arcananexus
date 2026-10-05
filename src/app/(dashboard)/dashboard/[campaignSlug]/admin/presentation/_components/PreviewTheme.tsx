"use client";

import * as React from "react";
import {
  themeColors,
  themeTextures,
  type ThemeColor,
  type ThemeTexture,
} from "@/app/themes";
import { cn } from "@/lib/utils";

const PreviewTheme = ({
  className,
  color,
  texture,
}: {
  className?: string;
  color: ThemeColor;
  texture: ThemeTexture;
}) => {
  const swatch =
    themeColors.find(c => c.id === color)?.swatch ?? themeColors[0].swatch;
  const textureOption = themeTextures.find(t => t.id === texture);

  const themeVars = {
    "--color": swatch,
    "--panel": `color-mix(in srgb, ${swatch} 14%, #14110f)`,
    "--panel-accent": `color-mix(in srgb, ${swatch} 60%, white)`,
    "--panel-texture": textureOption?.file
      ? `url(${textureOption.file})`
      : "none",
  } as React.CSSProperties;

  return (
    <div
      style={themeVars}
      className={cn(
        "relative w-[240px] shrink-0 overflow-hidden rounded",
        "h-auto bg-primary self-stretch justify-self-stretch",
        className
      )}
    >
      <div
        className="absolute inset-0"
        style={{ background: "var(--panel)" }}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0",
          "before:absolute before:inset-0 before:content-['']",
          "before:[background-image:var(--panel-texture)]",
          "before:[background-size:260px]",
          "before:[background-repeat:repeat]",
          "before:[background-position:top_right]",
          "before:[mix-blend-mode:screen]",
          "before:[filter:none]",
          "before:opacity-[0.55]"
        )}
        style={{
          background: `radial-gradient(140% 70% at 50% -10%,
              color-mix(in srgb, var(--panel-accent) 16%, transparent), transparent 64%),
            linear-gradient(180deg,
              color-mix(in srgb, var(--color) 40%, transparent) 0%,
              color-mix(in srgb, #000 24%, transparent) 100%)`,
        }}
      />
      <div className="relative z-10 flex flex-col gap-3" />
    </div>
  );
};

export default PreviewTheme;
