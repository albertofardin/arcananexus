"use client";

import { CharacterType } from "@prisma/client";
import FieldSelect from "../_core/FieldSelect";
import { CHARACTER_TYPE } from "@/lib/constants";

const CHARACTER_TYPES = Object.values(CharacterType);

const TYPE_FILTER_ITEMS = [
  { id: "all", label: "Tutti", icon: "filter_list" },
  ...CHARACTER_TYPES.map(type => ({
    id: type,
    label: CHARACTER_TYPE[type].label,
    icon: CHARACTER_TYPE[type].icon,
    iconStyle: { color: CHARACTER_TYPE[type].color },
  })),
];

export interface IFilterCharacterType {
  className?: string;
  value: CharacterType | "all";
  onChange: (value: CharacterType | "all") => void;
}

/** Menu a tendina per filtrare le liste "Personaggi" per tipo (PG/PNG). */
const FilterCharacterType = ({
  className,
  value,
  onChange,
}: IFilterCharacterType) => (
  <FieldSelect
    className={className}
    icon={value === "all" ? "filter_list" : CHARACTER_TYPE[value].icon}
    iconStyle={
      value === "all" ? undefined : { color: CHARACTER_TYPE[value].color }
    }
    value={value}
    items={TYPE_FILTER_ITEMS}
    onChange={v => onChange(v as CharacterType | "all")}
  />
);

export default FilterCharacterType;
