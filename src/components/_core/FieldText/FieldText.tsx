"use client";

import * as React from "react";
import Field from "../Field";
import Btn from "../Btn";
import { cn } from "@/lib/utils";
import emptyFn from "@/lib/utils/emptyFn";

export interface IFieldText {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  error?: boolean;
  describedById?: string;
  label?: React.ReactNode;
  labelIcon?: string;
  labelMandatory?: boolean;
  inputType?: string;
  inputName?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  multiline?: boolean;
  multilineFullHeight?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  inputClassName?: string;
  debounce?: number;
  value?: string;
  onClick?: () => void;
  onBlur?: (s: string) => void;
  onFocus?: (s: string) => void;
  onChange?: (s: string) => void;
  onKeyPress?: (key: string, s: string) => void;
}

const FieldText = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  IFieldText
>(
  (
    {
      style,
      className,
      id,
      error,
      describedById,
      debounce = 500,
      inputType = "text",
      inputName,
      inputClassName,
      autoFocus = false,
      autoComplete,
      multiline = false,
      multilineFullHeight = false,
      icon,
      iconClassName,
      iconStyle,
      label,
      labelIcon,
      labelMandatory,
      readOnly,
      disabled,
      placeholder = "Scrivi...",
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
    const [showPassword, setShowPassword] = React.useState(false);

    const [inputValue, setInputValue] = React.useState(value);

    const isPassword = inputType === "password";

    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setTextareaRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;

        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
            node;
      },
      [ref]
    );

    const toggleShowPassword = React.useCallback(() => {
      if (disabled) return;

      setShowPassword(prev => !prev);
    }, [disabled]);

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

    // Grow textarea to fit content
    React.useEffect(() => {
      if (!multiline || !multilineFullHeight) return;

      const el = textareaRef.current;
      if (!el) return;

      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [inputValue, multiline, multilineFullHeight]);

    const sharedClassName = cn(
      "w-full bg-transparent text-sm outline-none",
      "text-fg placeholder:italic",
      "placeholder:text-muted-fg",
      "border-none ring-0 px-2 antialiased",
      "font-normal tracking-[0.015em]",
      inputClassName
    );

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
        disabled={disabled}
        onClick={onClick}
      >
        {multiline ? (
          <textarea
            ref={setTextareaRef}
            id={id}
            name={inputName}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
            aria-invalid={error || undefined}
            aria-describedby={describedById}
            readOnly={disabled || readOnly}
            placeholder={placeholder}
            value={inputValue}
            className={cn(
              "py-2",
              sharedClassName,
              multilineFullHeight
                ? "min-h-[118px] h-auto resize-none overflow-hidden"
                : "h-[118px]"
            )}
            onBlur={cbOnBlur}
            onFocus={cbOnFocus}
            onChange={cbOnChange}
            onKeyDown={cbOnKeyDown}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={id}
            name={inputName}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
            aria-invalid={error || undefined}
            aria-describedby={describedById}
            readOnly={disabled || readOnly}
            placeholder={placeholder}
            value={inputValue}
            type={isPassword ? (showPassword ? "text" : "password") : inputType}
            className={cn(sharedClassName, "h-[34px] text-ellipsis")}
            onBlur={cbOnBlur}
            onFocus={cbOnFocus}
            onChange={cbOnChange}
            onKeyDown={cbOnKeyDown}
            {...props}
          />
        )}
        {!multiline && isPassword && !disabled && (
          <Btn
            small
            onClick={toggleShowPassword}
            icon={showPassword ? "visibility_off" : "visibility"}
            className="mr-1"
          />
        )}
      </Field>
    );
  }
);

FieldText.displayName = "FieldText";

export default FieldText;
