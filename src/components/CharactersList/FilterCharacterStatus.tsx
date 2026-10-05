"use client";

import FieldSelect from "../_core/FieldSelect";
import { type CharacterStatus } from "../BadgeCharacterStatus/status";
import { CHARACTER_STATUS } from "@/lib/constants";

const CHARACTER_STATUSES: CharacterStatus[] = [
  "approved",
  "review",
  "parked",
  "dead",
];

const STATUS_FILTER_ITEMS = [
  { id: "all", label: "Tutti", icon: "filter_list" },
  ...CHARACTER_STATUSES.map(status => ({
    id: status,
    label: CHARACTER_STATUS[status].label,
    icon: CHARACTER_STATUS[status].icon,
    iconStyle: { color: CHARACTER_STATUS[status].color },
  })),
];

export interface IFilterCharacterStatus {
  className?: string;
  value: CharacterStatus | "all";
  onChange: (value: CharacterStatus | "all") => void;
}

/** Menu a tendina per filtrare le liste "Personaggi" per stato. */
const FilterCharacterStatus = ({
  className,
  value,
  onChange,
}: IFilterCharacterStatus) => (
  <FieldSelect
    className={className}
    icon={value === "all" ? "filter_list" : CHARACTER_STATUS[value].icon}
    iconStyle={
      value === "all" ? undefined : { color: CHARACTER_STATUS[value].color }
    }
    value={value}
    items={STATUS_FILTER_ITEMS}
    onChange={v => onChange(v as CharacterStatus | "all")}
  />
);

export default FilterCharacterStatus;
