"use client";

import * as React from "react";
import Field from "../Field";
import { cn } from "@/lib/utils";
import emptyFn from "@/lib/utils/emptyFn";

export interface IFieldDate {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  error?: boolean;
  describedById?: string;
  label?: React.ReactNode;
  labelIcon?: string;
  labelMandatory?: boolean;
  inputName?: string;
  disabled?: boolean;
  /** Se true l'input include l'orario (`datetime-local`, valore `YYYY-MM-DDTHH:mm`). */
  withTime?: boolean;
  min?: string;
  max?: string;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  debounce?: number;
  value?: string;
  onClick?: () => void;
  onBlur?: (s: string) => void;
  onFocus?: (s: string) => void;
  onChange?: (s: string) => void;
  onKeyPress?: (key: string, s: string) => void;
}

const FieldDate = React.forwardRef<HTMLInputElement, IFieldDate>(
  (
    {
      style,
      className,
      id,
      error,
      describedById,
      debounce = 500,
      inputName,
      icon = "event",
      iconClassName,
      iconStyle,
      label,
      labelIcon,
      labelMandatory,
      disabled,
      withTime = false,
      min,
      max,
      onClick,
      // `emptyFn` è un riferimento stabile: un'arrow function inline come
      // default parameter verrebbe ricreata a ogni render, facendo
      // ripartire inutilmente l'effect di debounce sotto (`onChange` è in
      // dependency array).
      onBlur = emptyFn,
      onFocus = emptyFn,
      onChange = emptyFn,
      onKeyPress = emptyFn,
      value = "",
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const refCal = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (!ref) return;
        if (typeof ref === "function") {
          ref(node);
        } else {
          ref.current = node;
        }
      },
      [ref]
    );

    const [inputValue, setInputValue] = React.useState(value);

    const cbOnChange = React.useCallback(event => {
      event.preventDefault();
      event.stopPropagation();

      setInputValue(event.target.value);
    }, []);

    const cbOnBlur = React.useCallback(
      event => {
        event.preventDefault();
        event.stopPropagation();

        onBlur(event.target.value);
      },
      [onBlur]
    );

    const cbOnFocus = React.useCallback(
      event => {
        event.preventDefault();
        event.stopPropagation();

        onFocus(event.target.value);
      },
      [onFocus]
    );

    const cbOnKeyDown = React.useCallback(
      event => {
        onKeyPress(event.key, inputValue);
      },
      [inputValue, onKeyPress]
    );

    const cbOpenPicker = React.useCallback(() => {
      inputRef.current?.showPicker?.();
      onClick?.();
    }, [onClick]);

    // Debounce effect
    React.useEffect(() => {
      if (inputValue === value) return undefined;

      const handler = setTimeout(() => {
        onChange(inputValue);
      }, debounce);

      return () => clearTimeout(handler);
    }, [inputValue, value, debounce, onChange]);

    // Sync external value
    React.useEffect(() => {
      setInputValue(value);
    }, [value]);

    return (
      <Field
        style={style}
        className={className}
        label={label}
        labelIcon={labelIcon}
        labelMandatory={labelMandatory}
        icon={icon}
        iconClassName={iconClassName}
        iconStyle={iconStyle}
        iconOnClick={cbOpenPicker}
        disabled={disabled}
        onClick={onClick}
      >
        <input
          ref={refCal}
          id={id}
          name={inputName}
          type={withTime ? "datetime-local" : "date"}
          aria-invalid={error || undefined}
          aria-describedby={describedById}
          disabled={disabled}
          min={min}
          max={max}
          value={inputValue}
          className={cn(
            "w-full bg-transparent text-sm outline-none",
            "cursor-pointer",
            inputValue ? "text-fg" : "text-muted-fg focus-within:text-fg",
            "border-none ring-0 px-1 h-[34px] text-ellipsis",
            "[&::-webkit-calendar-picker-indicator]:opacity-0"
          )}
          onBlur={cbOnBlur}
          onFocus={cbOnFocus}
          onChange={cbOnChange}
          onKeyDown={cbOnKeyDown}
          {...props}
        />
      </Field>
    );
  }
);

FieldDate.displayName = "FieldDate";

export default FieldDate;
