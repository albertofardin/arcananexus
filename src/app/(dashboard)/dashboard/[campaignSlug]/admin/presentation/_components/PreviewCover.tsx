"use client";

import BtnCampaign from "@/components/BtnCampaign";
import { type ThemeColor, type ThemeTexture, themeColors } from "@/app/themes";
import type { Campaign } from "@/lib/validations/campaign";
import { cn } from "@/lib/utils";

const PreviewCover = ({
  className,
  name,
  logo,
  cover,
  color,
  texture,
}: {
  className?: string;
  name: string;
  logo: string | null;
  cover: string | null;
  color: ThemeColor;
  texture: ThemeTexture;
}) => {
  const previewCampaign: Campaign = {
    id: -1,
    name: name.trim() || "Nome campagna",
    slug: "preview",
    logo,
    cover,
    color,
    texture,
    visibility: true,
    dataTypes: [],
    activeFeatures: [],
  };
  const swatch =
    themeColors.find(c => c.id === color)?.swatch ?? themeColors[0].swatch;

  return (
    <BtnCampaign
      className={cn("self-stretch justify-self-stretch", className)}
      style={{ backgroundColor: swatch }}
      size={[240, 108]}
      camps={[previewCampaign]}
      slcCamp={previewCampaign}
    />
  );
};

export default PreviewCover;
