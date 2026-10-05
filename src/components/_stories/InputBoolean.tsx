"use client";

import * as React from "react";
import BtnBase from "../_core/BtnBase";
import Icon from "../_core/Icon";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";

interface IInputBoolean {
  style?: React.CSSProperties;
  className?: string;
  label: string;
  value: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}

const InputBoolean = ({
  style,
  className,
  label,
  value,
  onChange,
  disabled,
}: IInputBoolean) => {
  const cbChange = React.useCallback(() => {
    onChange?.(!value);
  }, [onChange, value]);

  return (
    <BtnBase
      style={style}
      onClick={disabled ? undefined : cbChange}
      className={cn(
        "flex w-[300px] flex-row items-center justify-start p-[10px]",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <div className="mr-[10px] flex items-center justify-center">
        <Icon
          className="text-[18px] text-inherit"
          children={value ? "check_box" : "check_box_outline_blank"}
        />
      </div>

      <Text children={label} />
    </BtnBase>
  );
};

export default InputBoolean;
