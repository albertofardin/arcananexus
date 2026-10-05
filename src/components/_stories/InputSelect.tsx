"use client";

import * as React from "react";
import BtnBase from "../_core/BtnBase";
import Icon from "../_core/Icon";
import Text from "../_core/Text";
import PopoverList from "../_core/PopoverList";
import { SelectType } from "../_core/Checkbox";
import { cn } from "@/lib/utils";

interface IInputSelect {
  style?: React.CSSProperties;
  className?: string;
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange?: (v: string) => void;
  disabled?: boolean;
}

const InputSelect = ({
  style,
  className,
  label,
  value,
  onChange,
  disabled,
  options,
}: IInputSelect) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [btnRef, setBtnRef] = React.useState<HTMLDivElement | null>(null);
  const item = options.find(o => o.id === value);

  const onClick = React.useCallback(
    (id: string, _: unknown) => {
      onChange?.(id);
    },
    [onChange]
  );

  const onMenuHide = React.useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onMenuOpen = React.useCallback(() => {
    setMenuOpen(true);
  }, []);

  return (
    <>
      <BtnBase
        ref={setBtnRef}
        style={style}
        onClick={disabled ? undefined : onMenuOpen}
        className={cn(
          "flex w-[300px] flex-row items-center justify-start p-[10px]",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <Icon
          className="mr-[10px] text-[18px] text-inherit"
          children="expand_more"
        />

        <Text>
          {label}: {item?.label}
        </Text>
      </BtnBase>

      <PopoverList
        open={menuOpen}
        anchorEl={btnRef}
        onClose={onMenuHide}
        originAnchor={{
          horizontal: "left",
          vertical: "bottom",
        }}
        originTransf={{
          horizontal: "left",
          vertical: "top",
        }}
        actions={options.map(o => ({
          ...o,
          selected: o.id === value,
          selectType: SelectType.RADIO,
          onClick,
        }))}
      />
    </>
  );
};

export default InputSelect;
