"use client";

import * as React from "react";
import Image from "next/image";
import Avatar from "@/components/_core/Avatar";
import BtnBase from "@/components/_core/BtnBase";
import Skeleton from "@/components/_core/Skeleton";
import Text from "@/components/_core/Text";
import PopoverList, {
  type IPopoverListItem,
} from "@/components/_core/PopoverList";
import LogoArcanaDomine from "@/components/LogoArcanaDomine";
import { themeColors } from "@/app/themes";
import type { Campaign } from "@/lib/validations/campaign";
import { cn } from "@/lib/utils";

const HOVER_TRANSITION =
  "[transition:transform_.35s_cubic-bezier(.22,1,.36,1),filter_.4s_ease] group-hover:scale-[1.04]";

export interface IBtnCampaign {
  className?: string;
  style?: React.CSSProperties;
  camps: Campaign[];
  loading?: boolean;
  slcCamp?: Campaign;
  switchable?: boolean;
  size?: [number, number];
  onClick?: () => void;
  onSelectHome?: () => void;
  onSelectCamp?: (id: string | number) => void;
}

const BtnCampaign = ({
  className,
  style,
  camps,
  loading,
  slcCamp,
  switchable = false,
  size = [200, 90],
  onClick,
  onSelectHome = () => {},
  onSelectCamp = () => {},
}: IBtnCampaign) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [width, height] = size;
  const avatarSize = height - 10;
  const textSize = height > 50 ? 3 : 1;
  const canSwitch = switchable && camps.length >= 1;
  // clickable: oltre allo switch tra campagne, il chiamante può passare un
  // onClick proprio (es. navigazione diretta da una card) e in tal caso il
  // pulsante deve comunque comportarsi da elemento interattivo (hover/cursor)
  const clickable = canSwitch || !!onClick;
  const scaleClass = open ? "scale-[1.04]" : "";
  const items: IPopoverListItem[] = [
    {
      id: 0,
      label: "ArcanaDomine",
      className: "px-2 py-1",
      avatar: "/mobile/icon-192.png",
      avatarText: "AD",
      avatarSize: 36,
      avatarStyle: { backgroundColor: "#000" },
      selected: !slcCamp,
      onClick: onSelectHome,
    },
    ...camps.map((c, i) => {
      const swatch = themeColors.find(t => t.id === c.color)?.swatch;
      const listitem: IPopoverListItem = {
        id: c.id,
        label: c.name,
        className: "px-2 py-1",
        avatar: c.logo ?? undefined,
        avatarSize: 36,
        avatarIcon: "castle",
        avatarText: c.name,
        avatarStyle: {
          padding: 2,
          backgroundColor: `color-mix(in srgb, ${swatch} 30%, transparent)`,
        },
        selected: slcCamp?.id === c.id,
        onClick: onSelectCamp,
        divider: !i,
      };
      return listitem;
    }),
  ];
  const swatch = themeColors.find(t => t.id === slcCamp?.color)?.swatch;

  if (loading) {
    return (
      <Skeleton
        className={cn("bg-transparent border border-border", className)}
        style={{
          minWidth: width,
          minHeight: height,
          maxWidth: width,
          maxHeight: height,
          width,
          height,
          ...style,
        }}
      />
    );
  }

  return (
    <div className="block">
      <BtnBase
        color={swatch}
        ref={setAnchorEl}
        onClick={() => {
          onClick?.();
          if (canSwitch) setOpen(true);
        }}
        style={{
          transition: "all .3s ease",
          minWidth: width,
          minHeight: height,
          maxWidth: width,
          maxHeight: height,
          width,
          height,
          backgroundColor: slcCamp
            ? `color-mix(in srgb, ${swatch} 50%, transparent)`
            : undefined,
          ...style,
        }}
        className={cn(
          "relative flex flex-shrink-0",
          clickable ? "group cursor-pointer" : "cursor-default",
          "items-center justify-center gap-3 overflow-hidden rounded px-1",
          "[transition:background_.35s_ease,border-color_.35s_ease]",
          slcCamp &&
            "border [border-color:color-mix(in_srgb,white_35%,transparent)]",
          clickable &&
            "hover:bg-[color-mix(in_srgb,white_7%,transparent)] hover:[border-color:color-mix(in_srgb,white_75%,transparent)]",
          open &&
            "bg-[color-mix(in_srgb,white_7%,transparent)] [border-color:color-mix(in_srgb,white_75%,transparent)]",
          className
        )}
      >
        {!slcCamp ? (
          <LogoArcanaDomine
            color="#fff"
            className={cn(
              "h-auto w-full max-w-[200px]",
              "[filter:drop-shadow(0_3px_8px_color-mix(in_srgb,var(--color)_38%,transparent))]",
              "group-hover:[filter:drop-shadow(0_5px_16px_color-mix(in_srgb,var(--panel-accent)_55%,transparent))]",
              "motion-reduce:group-hover:scale-100"
            )}
          />
        ) : (
          <>
            {slcCamp.cover ? (
              <div
                aria-hidden
                className={cn("absolute inset-0", HOVER_TRANSITION, scaleClass)}
              >
                <Image
                  src={slcCamp.cover}
                  alt=""
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
            ) : (
              <div
                aria-hidden
                className={cn("absolute inset-0", HOVER_TRANSITION, scaleClass)}
                style={{
                  background: `linear-gradient(135deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 55%, ${swatch}) 100%)`,
                }}
              />
            )}
            {slcCamp.logo ? (
              <Avatar
                size={avatarSize}
                src={slcCamp.logo}
                icon="tower"
                className={cn(
                  "relative flex-shrink-0 bg-transparent",
                  HOVER_TRANSITION,
                  scaleClass
                )}
                iconStyle={{ color: "#fff" }}
              />
            ) : (
              <Text
                className="relative text-white text-ellipsis overflow-hidden whitespace-nowrap"
                size={textSize}
                children={slcCamp.name}
              />
            )}
          </>
        )}
      </BtnBase>
      <PopoverList
        open={open}
        anchorEl={anchorEl}
        actions={items}
        onClose={() => setOpen(false)}
        style={{
          minWidth: anchorEl?.offsetWidth,
          maxWidth: anchorEl?.offsetWidth,
        }}
      />
    </div>
  );
};

export default BtnCampaign;
