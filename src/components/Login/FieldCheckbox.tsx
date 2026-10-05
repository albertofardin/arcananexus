"use client";

import * as React from "react";
import BtnCheckbox from "../_core/BtnCheckbox";
import Icon from "../_core/Icon";
import { cn } from "@/lib/utils";

const FieldCheckbox = ({
  className,
  style,
  id,
  selected,
  onChange,
  readOnly,
  required,
  label,
  link,
}: {
  className?: string;
  style?: React.CSSProperties;
  id: string;
  selected: boolean;
  onChange: (value: boolean, id: string) => void;
  readOnly?: boolean;
  required?: boolean;
  label: string;
  link: string;
}) => {
  const onCheckboxClick = React.useCallback(() => {
    onChange(!selected, id);
  }, [id, onChange, selected]);

  const onOpenLink = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      window.open(link, "_blank");
    },
    [link]
  );

  return (
    <BtnCheckbox
      style={style}
      className={cn("mt-[15px] box-border w-[100%]", className)}
      color="var(--primary)"
      onClick={onCheckboxClick}
      disabled={readOnly}
      selected={selected}
      checkboxStyle={{ backgroundColor: "#fff" }}
      checkboxClassName="self-start"
      labelClassName="z-[2] mt-[-2px]"
      label={
        <>
          <span>
            {label}

            {required && <span className="ml-[2px] text-fail">*</span>}
          </span>

          {!!link && (
            <span
              role="presentation"
              onClick={onOpenLink}
              className="
                flex w-fit flex-row items-center
                text-primary
              "
            >
              <span className="hover:underline">Apri link</span>

              <Icon
                className="ml-[2px] text-[12px] text-inherit"
                children="open_in_new"
              />
            </span>
          )}
        </>
      }
    />
  );
};

export default FieldCheckbox;
