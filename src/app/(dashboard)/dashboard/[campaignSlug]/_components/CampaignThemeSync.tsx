"use client";

import * as React from "react";
import {
  defaultColor,
  defaultTexture,
  type ThemeColor,
  type ThemeTexture,
} from "@/app/themes";

export default function CampaignThemeSync({
  color,
  texture,
}: {
  color: ThemeColor;
  texture: ThemeTexture;
}) {
  React.useEffect(() => {
    document.documentElement.setAttribute("data-color", color);
    document.documentElement.setAttribute("data-texture", texture);
  }, [color, texture]);

  // Cleanup separato (dipendenze vuote): ripristina i default solo
  // all'uscita definitiva da una pagina di campagna, non ad ogni cambio di
  // color/texture (es. passando da una campagna all'altra).
  React.useEffect(() => {
    return () => {
      document.documentElement.setAttribute("data-color", defaultColor);
      document.documentElement.setAttribute("data-texture", defaultTexture);
    };
  }, []);

  return null;
}
