"use client";

import * as React from "react";
import Ink from "react-ink";
import Tooltip from "../Tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface IKeyDown {
  isMobile: boolean;
  keyDownCtrl: boolean;
  keyDownMeta: boolean;
}

export interface IBtnBase {
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactElement | React.ReactNode;
  clickPropagation?: boolean;
  clickExclusive?: boolean;
  clickElapsed?: number;
  onClick?: (event: React.MouseEvent, keyDown: IKeyDown) => void;
  onDoubleClick?: (event: React.MouseEvent, keyDown: IKeyDown) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
  onMouseMove?: (event: React.MouseEvent) => void;
  tooltip?: string | string[] | React.ReactElement;
  tooltipOpen?: boolean;
  tooltipPlace?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
  disabledRipple?: boolean;
  copyToClipboard?: string;
  onCopyToClipboard?: (text: string) => void;
  onLongPress?: (event: React.TouchEvent) => void;
}

const BtnBase = React.forwardRef<HTMLDivElement, IBtnBase>((props, ref) => {
  const {
    color = "var(--primary)",
    className,
    style,
    children,
    clickPropagation = false,
    clickExclusive = false,
    clickElapsed = 350,
    onClick,
    onDoubleClick,
    onContextMenu,
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
    tooltip,
    tooltipOpen,
    tooltipPlace,
    disabled: disabledProp,
    disabledRipple,
    copyToClipboard,
    onCopyToClipboard,
    onLongPress,
    ...p
  } = props;

  const isMobile = useIsMobile();

  const disabled = disabledProp || (!onClick && !onDoubleClick);

  const clickTimeout = React.useRef(0);
  const pressTimeout = React.useRef(0);

  const clearClickTimeout = () => {
    if (clickTimeout.current !== 0) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = 0;
    }
  };

  const clearPressTimeout = () => {
    if (pressTimeout.current !== 0) {
      clearTimeout(pressTimeout.current);
      pressTimeout.current = 0;
    }
  };

  const cbOnClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onClick) return;

      onClick(event, {
        isMobile,
        keyDownCtrl: event.ctrlKey || event.metaKey,
        keyDownMeta: event.shiftKey,
      });
    },
    [onClick, isMobile]
  );

  const cbOnDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onDoubleClick) return;

      onDoubleClick(event, {
        isMobile,
        keyDownCtrl: false,
        keyDownMeta: false,
      });
    },
    [onDoubleClick, isMobile]
  );

  const cbHandleClicks = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;

      if (copyToClipboard) {
        void navigator.clipboard?.writeText(copyToClipboard);

        onCopyToClipboard?.(copyToClipboard);
      }

      if (!clickPropagation) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (clickExclusive) {
        if (event.detail === 1) {
          clickTimeout.current = window.setTimeout(() => {
            cbOnClick(event);
          }, clickElapsed);
        }

        if (event.detail === 2) {
          clearClickTimeout();
          cbOnDoubleClick(event);
        }
      } else {
        if (event.detail === 1) {
          cbOnClick(event);
        }

        if (event.detail === 2) {
          cbOnDoubleClick(event);
        }
      }
    },
    [
      cbOnClick,
      cbOnDoubleClick,
      clickElapsed,
      clickExclusive,
      clickPropagation,
      copyToClipboard,
      disabled,
      onCopyToClipboard,
    ]
  );

  const cbContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;

      if (!disabled && onContextMenu) {
        if (!clickPropagation) {
          event.preventDefault();
          event.stopPropagation();
        }

        onContextMenu(event);
      }
    },
    [isMobile, disabled, onContextMenu, clickPropagation]
  );

  const cbTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!onLongPress) return;

      pressTimeout.current = window.setTimeout(() => {
        onLongPress(event);
      }, 500);
    },
    [onLongPress]
  );

  const cbTouchEnd = React.useCallback(() => {
    clearPressTimeout();
  }, []);

  const cbTouchCancel = React.useCallback(() => {
    clearPressTimeout();
  }, []);

  return (
    <Tooltip title={tooltip} open={tooltipOpen} place={tooltipPlace}>
      <div
        ref={ref}
        role={disabled ? "presentation" : "button"}
        tabIndex={-1}
        aria-label={typeof tooltip === "string" ? tooltip : undefined}
        style={style}
        className={cn(
          "relative outline-none",
          disabled ? "cursor-default" : "cursor-pointer",
          className
        )}
        onClick={cbHandleClicks}
        onContextMenu={cbContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        onTouchStart={cbTouchStart}
        onTouchEnd={cbTouchEnd}
        onTouchCancel={cbTouchCancel}
        {...p}
      >
        {disabled || disabledRipple ? null : (
          <Ink style={{ color }} opacity={0.2} />
        )}
        {children}
      </div>
    </Tooltip>
  );
});

BtnBase.displayName = "BtnBase";

export default BtnBase;
