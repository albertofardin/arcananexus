"use client";

import { CharacterType } from "@prisma/client";
import {
  typeIcon,
  typeColor,
  typeLabel,
} from "@/components/BadgeCharacterType";
import FieldSelect from "@/components/_core/FieldSelect";
import type { IPopoverListItem } from "@/components/_core/PopoverList";

const TYPE_ITEMS: IPopoverListItem[] = Object.values(CharacterType).map(
  type => ({
    id: type,
    label: typeLabel(type),
    icon: typeIcon(type),
    iconStyle: { color: typeColor(type) },
  })
);

export interface IFieldCharacterType {
  className?: string;
  label?: React.ReactNode;
  labelMandatory?: boolean;
  placeholder?: string;
  disabled?: boolean;
  value?: CharacterType;
  onChange: (type: CharacterType | undefined) => void;
}

// Selettore PG/PNG con icona e colore coerenti col resto dell'app
// (`typeIcon`/`typeColor`/`typeLabel` di `BadgeCharacterType`): estratto
// da `CharacterEditorHero.tsx` per essere riusato anche da
// `MissiveWriter.tsx` (selezione del tipo di destinatario), invece di
// duplicare `TYPE_ITEMS` in ogni punto.
const FieldCharacterType = ({
  className,
  label,
  labelMandatory,
  placeholder,
  disabled,
  value,
  onChange,
}: IFieldCharacterType) => (
  <FieldSelect
    className={className}
    label={label}
    labelMandatory={labelMandatory}
    placeholder={placeholder}
    disabled={disabled}
    icon={value ? typeIcon(value) : undefined}
    iconStyle={value ? { color: typeColor(value) } : undefined}
    value={value}
    items={TYPE_ITEMS}
    onChange={next => onChange(next as CharacterType | undefined)}
  />
);

export default FieldCharacterType;
