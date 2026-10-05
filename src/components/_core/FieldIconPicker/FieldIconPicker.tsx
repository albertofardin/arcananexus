"use client";

import * as React from "react";
import Field from "../Field";
import Icon from "../Icon";
import Modal from "../Modal";
import Btn from "../Btn";
import { cn } from "@/lib/utils";

export interface IFieldIconPicker {
  className?: string;
  style?: React.CSSProperties;
  label?: React.ReactNode;
  labelMandatory?: boolean;
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  icons: string[];
  onChange?: (icon: string) => void;
  input?: boolean;
}

const FieldIconPicker = React.forwardRef<HTMLDivElement, IFieldIconPicker>(
  (
    {
      className,
      style,
      label,
      labelMandatory,
      placeholder = "Nessuna icona",
      disabled,
      value = "",
      icons,
      onChange = () => null,
      input = true,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const onOpen = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        setOpen(true);
      },
      [disabled]
    );
    const onClose = React.useCallback(() => setOpen(false), []);
    const onSelect = React.useCallback(
      (icon: string) => {
        onChange(icon);
        setOpen(false);
      },
      [onChange]
    );

    return (
      <div className="block">
        <Field
          ref={ref}
          style={style}
          className={cn("cursor-pointer", className)}
          label={label}
          labelMandatory={labelMandatory}
          icon={value}
          onClick={onOpen}
          disabled={disabled}
        >
          {input && (
            <div
              className={cn(
                "flex-1 px-1 text-sm",
                value ? "text-fg" : "text-muted-fg"
              )}
              children={value || placeholder}
            />
          )}
        </Field>
        <Modal
          open={open}
          onClose={onClose}
          title="Scegli un'icona"
          contentClassName="w-[500px]"
          content={
            <div className="grid grid-cols-9 gap-2">
              {icons.map(icon => {
                const selected = icon === value;
                return (
                  <button
                    key={icon}
                    type="button"
                    aria-label={icon}
                    aria-pressed={selected}
                    onClick={() => onSelect(icon)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded border transition-colors",
                      "hover:bg-muted-bg",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-transparent"
                    )}
                  >
                    <Icon
                      className={cn(selected ? "text-primary" : "text-fg")}
                      children={icon}
                    />
                  </button>
                );
              })}
            </div>
          }
          actions={<Btn label="CHIUDI" onClick={onClose} />}
        />
      </div>
    );
  }
);

FieldIconPicker.displayName = "FieldIconPicker";

export default FieldIconPicker;
