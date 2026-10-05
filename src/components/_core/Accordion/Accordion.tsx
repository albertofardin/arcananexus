"use client";

import * as React from "react";
import BtnBase from "../BtnBase";
import Icon from "../Icon";
import Card from "../Card";
import Text, { TextSize, TextWeight } from "../Text";
import { Collapse } from "../Transitions";
import { cn } from "@/lib/utils";

export interface IAccordion {
  className?: string;
  style?: React.CSSProperties;
  titleWeight?: TextWeight;
  titleSize?: TextSize;
  titleIcon?: string;
  titleIconClassName?: string;
  title: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  contentClassName?: string;
  buttonClassName?: string;
  buttonChildren?: React.ReactNode;
  children?: React.ReactNode;
}

const Accordion = ({
  className,
  style,
  titleWeight = "bolder",
  titleSize = 1,
  titleIcon,
  titleIconClassName,
  title,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  contentClassName,
  buttonClassName,
  buttonChildren,
  children,
}: IAccordion) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const toggle = React.useCallback(() => {
    if (onToggle) onToggle();
    else setInternalOpen(prev => !prev);
  }, [onToggle]);

  return (
    <Card
      style={style}
      className={cn(
        "flex flex-col items-stretch hover:border-primary overflow-hidden shrink-0",
        className
      )}
    >
      <BtnBase
        onClick={toggle}
        style={
          {
            "--btn-color": "var(--primary)",
          } as React.CSSProperties
        }
        className={cn(
          "flex w-full items-center gap-3 px-3 min-h-[38px]",
          "transition-colors hover:bg-accent shrink-0",
          !open && "flex-1",
          buttonClassName
        )}
      >
        {titleIcon && (
          <Icon
            className={cn("text-muted-fg", titleIconClassName)}
            children={titleIcon}
          />
        )}
        <Text
          size={titleSize}
          weight={titleWeight}
          className="flex-1 text-left"
          children={title}
        />
        {buttonChildren}
        <Icon
          className={cn(
            "text-muted-fg transition-transform duration-200",
            open && "rotate-180"
          )}
          children="expand_more"
        />
      </BtnBase>
      <Collapse open={open}>
        <div
          className={cn("p-2 flex flex-col gap-3", contentClassName)}
          children={children}
        />
      </Collapse>
    </Card>
  );
};

Accordion.displayName = "Accordion";

export default Accordion;
