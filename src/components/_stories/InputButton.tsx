"use client";

import * as React from "react";
import BtnBase from "../_core/BtnBase";
import Icon from "../_core/Icon";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";

interface IInputButton {
  style?: React.CSSProperties;
  className?: string;
  label: string;
  onChange?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

const InputButton = ({
  style,
  className,
  label,
  onChange,
  disabled,
  icon,
}: IInputButton) => {
  return (
    <BtnBase
      style={style}
      onClick={disabled ? undefined : onChange}
      className={cn(
        "flex w-[300px] flex-row items-center justify-start p-[10px]",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <div className="mr-[10px] flex items-center justify-center">
        {icon ?? <Icon className="text-[18px] text-inherit" children="draw" />}
      </div>

      <Text children={label} />
    </BtnBase>
  );
};

export default InputButton;
