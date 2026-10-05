"use client";

import * as React from "react";
import Text from "../_core/Text";
import { cn } from "@/lib/utils";

export interface IInputText {
  style?: React.CSSProperties;
  className?: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  textarea?: boolean;
}

const InputText = ({
  style,
  className,
  label,
  value = "",
  onChange,
  disabled,
  textarea,
}: IInputText) => {
  const cbChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange?.(event.target.value);
    },
    [onChange]
  );

  return (
    <div
      style={style}
      className={cn("flex w-[300px] flex-col items-start p-2.5", className)}
    >
      <Text>{label}</Text>

      {!textarea ? (
        <input
          disabled={disabled}
          type="text"
          value={value}
          onChange={cbChange}
          className={cn(
            "mt-1 flex-1 self-stretch rounded border border-border bg-bg px-2.5 py-1.5 text-fg outline-none transition-colors",
            "placeholder:text-muted-fg",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
      ) : (
        <textarea
          disabled={disabled}
          value={value}
          onChange={cbChange}
          className={cn(
            "mt-1 min-h-[120px] flex-1 self-stretch resize-none rounded border border-border bg-bg px-2.5 py-1.5 text-fg outline-none transition-colors",
            "placeholder:text-muted-fg",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
      )}
    </div>
  );
};

export default InputText;
