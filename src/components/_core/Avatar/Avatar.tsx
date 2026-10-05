"use client";

import * as React from "react";
import Image from "next/image";
import Icon from "../Icon";
import Text from "../Text";
import Tooltip from "../Tooltip";
import { useRetryableImageSrc } from "./useRetryableImageSrc";
import { cn } from "@/lib/utils";

export interface IAvatar {
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  src?: string;
  text?: string;
  textClassName?: string;
  textStyle?: React.CSSProperties;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  tooltip?: string;
  circle?: boolean;
}

const Avatar = React.forwardRef<HTMLDivElement, IAvatar>((props, ref) => {
  const {
    className,
    style,
    size = 42,
    src: srcUrl,
    text = "",
    textClassName,
    textStyle,
    icon = "person",
    iconClassName,
    iconStyle,
    tooltip,
    circle,
  } = props;

  const { src, onError } = useRetryableImageSrc(srcUrl);

  return (
    <Tooltip title={tooltip}>
      <div
        ref={ref}
        style={{
          ...style,
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          maxWidth: size,
          maxHeight: size,
        }}
        className={cn(
          "relative inline-flex overflow-hidden shrink-0",
          circle ? "rounded-full" : "rounded",
          "items-center justify-center align-middle",
          "bg-muted-bg text-fg",
          className
        )}
      >
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={`${size}px`}
            onError={onError}
            className="object-cover"
          />
        ) : text ? (
          <Text
            className={cn("text-fg", textClassName)}
            style={textStyle}
            children={text}
          />
        ) : (
          <Icon
            className={cn("text-fg", iconClassName)}
            style={iconStyle}
            children={icon}
          />
        )}
      </div>
    </Tooltip>
  );
});

Avatar.displayName = "Avatar";

export default Avatar;
