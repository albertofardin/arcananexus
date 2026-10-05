"use client";

import * as React from "react";
import FieldText from "../_core/FieldText";
import Tooltip from "../_core/Tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface IFieldInput {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  icon?: string;
  label?: string;
  onChange: (
    value: string,
    id: string | undefined,
    pressEnter: boolean
  ) => void;
  inputType?: string;
  inputName?: string;
  autoComplete?: string;
  value: string;
  disabled?: boolean;
  tooltipPlace?: "right" | "left";
  tooltipValue?: string[];
  tooltipOpen?: boolean;
  error?: boolean;
  required?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

const FieldInput = ({
  className,
  style,
  id,
  icon,
  label,
  onChange,
  inputType,
  inputName,
  autoComplete,
  value,
  disabled,
  tooltipPlace = "right",
  tooltipValue = [],
  tooltipOpen = false,
  error,
  required,
  placeholder,
  inputRef,
}: IFieldInput) => {
  const onFieldKeyPress = React.useCallback(
    (key: string, value: string) => {
      if (key === "Enter") {
        onChange(value, id, true);
      }
    },
    [id, onChange]
  );

  const onFieldChange = React.useCallback(
    (value: string) => {
      onChange(value, id, false);
    },
    [id, onChange]
  );

  const reactId = React.useId();
  const errorId = `field-fail-${reactId}`;
  const hasError = !!error || tooltipOpen;
  const isMobile = useIsMobile();
  const showInlineTooltip = isMobile && tooltipOpen && tooltipValue.length > 0;

  return (
    <>
      <Tooltip place={tooltipPlace} title={tooltipValue} open={tooltipOpen}>
        <FieldText
          ref={inputRef}
          id={id}
          error={hasError}
          describedById={tooltipOpen ? errorId : undefined}
          style={style}
          className={cn(
            "mt-[30px] bg-white w-full",
            error && "border-fail focus-within:border-fail",
            className
          )}
          label={label}
          labelMandatory={required}
          value={value}
          onChange={onFieldChange}
          inputType={inputType}
          inputName={inputName}
          autoComplete={autoComplete}
          icon={icon}
          onKeyPress={onFieldKeyPress}
          disabled={disabled}
          placeholder={placeholder ?? label}
        />
      </Tooltip>
      {tooltipOpen && tooltipValue.length > 0 && (
        <span
          id={errorId}
          role="alert"
          className={cn(!showInlineTooltip && "sr-only")}
        >
          {showInlineTooltip ? (
            <span className="mt-1 flex flex-col gap-0.5 text-xs leading-relaxed">
              {tooltipValue.map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    "block",
                    line.startsWith("✅") ? "text-succ" : "text-fail"
                  )}
                >
                  {line}
                </span>
              ))}
            </span>
          ) : (
            tooltipValue.join(". ")
          )}
        </span>
      )}
    </>
  );
};

export default FieldInput;
