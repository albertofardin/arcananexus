"use client";

import Text from "@/components/_core/Text";
import BtnBase from "@/components/_core/BtnBase";
import Checkbox, { SelectType } from "@/components/_core/Checkbox";
import Icon from "@/components/_core/Icon";

const CheckButton = ({
  icon,
  label,
  sublabel,
  selected,
  disabled,
  readOnly,
  onClick,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  selected?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onClick?: (b: boolean) => void;
}) => {
  const color = "var(--succ)";
  return (
    <BtnBase
      className="p-3 w-full rounded flex items-center gap-3"
      color={color}
      disabled={disabled || readOnly}
      onClick={() => onClick(!selected)}
    >
      <Icon className="text-muted-fg" children={icon} />
      <div className="flex-col flex-1">
        <Text className="w-full" children={label} />
        {sublabel && (
          <Text className="w-full text-muted-fg" size={0} children={sublabel} />
        )}
      </div>
      {!readOnly && (
        <Checkbox
          type={SelectType.CHECK}
          color={color}
          disabled={disabled}
          selected={selected}
        />
      )}
    </BtnBase>
  );
};

export default CheckButton;
