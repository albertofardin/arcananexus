"use client";

import * as React from "react";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";

interface IInputNumber {
  style?: React.CSSProperties;
  className?: string;
  label: string;
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
}

const InputNumber = ({
  style,
  className,
  label,
  value,
  onChange,
  disabled,
}: IInputNumber) => {
  const cbChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(Number(event.target.value));
    },
    [onChange]
  );

  return (
    <div
      style={style}
      className={cn("flex w-[300px] flex-col items-start p-[10px]", className)}
    >
      <Text children={label} />

      <input
        disabled={disabled}
        type="number"
        value={value}
        onChange={cbChange}
        className={cn(
          "mt-[5px] self-stretch rounded border border-border bg-bg px-[10px] py-[5px] text-fg outline-none transition-colors",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  );
};

export default InputNumber;
