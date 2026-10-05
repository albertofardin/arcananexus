"use client";

import * as React from "react";
import Field from "../Field";
import FieldText from "../FieldText";
import Icon from "../Icon";
import PopoverList, { IPopoverListItem } from "../PopoverList";
import AvatarUser from "../../AvatarUser";
import Text from "../Text";
import { SelectType } from "../Checkbox";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_ITEMS = 8;

export interface IFieldSelect {
  className?: string;
  style?: React.CSSProperties;
  label?: React.ReactNode;
  labelIcon?: string;
  labelMandatory?: boolean;
  placeholder?: string;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  disabled?: boolean;
  multiple?: boolean;
  showAllItems?: boolean;
  // permette di aggiungere un valore nuovo scrivendolo nella ricerca
  creatable?: boolean;
  value?: string | number | (string | number)[];
  items: IPopoverListItem[];
  onChange?: (value: string | number | (string | number)[]) => void;
}

const FieldSelect = React.forwardRef<HTMLDivElement, IFieldSelect>(
  (
    {
      className,
      style,
      label,
      labelIcon,
      labelMandatory,
      placeholder = "Seleziona...",
      icon,
      iconStyle,
      iconClassName,
      disabled,
      multiple = false,
      showAllItems = false,
      creatable = false,
      value,
      items,
      onChange = () => null,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);
    const [search, setSearch] = React.useState("");
    const lastCloseRef = React.useRef(0);

    const showSearch = creatable || items.length > MAX_VISIBLE_ITEMS;
    const normalizedSearch = search.trim().toLowerCase();
    const matchedItems =
      showSearch && normalizedSearch
        ? items.filter(item =>
            item.label.toLowerCase().includes(normalizedSearch)
          )
        : items;
    const visibleItems =
      showSearch && !showAllItems
        ? matchedItems.slice(0, MAX_VISIBLE_ITEMS)
        : matchedItems;
    const hiddenCount = matchedItems.length - visibleItems.length;
    const trimmedSearch = search.trim();
    const createItems: IPopoverListItem[] =
      creatable &&
      trimmedSearch &&
      !items.some(item => item.label.toLowerCase() === normalizedSearch)
        ? [
            {
              id: trimmedSearch,
              label: "Crea nuova voce",
              icon: "add",
            },
          ]
        : [];

    const selectedValues: (string | number)[] = React.useMemo(
      () =>
        multiple
          ? Array.isArray(value)
            ? value
            : []
          : value !== undefined
            ? [value as string | number]
            : [],
      [multiple, value]
    );
    const selectedItems = items.filter(item =>
      selectedValues.includes(item.id)
    );
    const selectedItem = selectedItems[0];
    const refCal = React.useCallback(
      node => {
        setAnchorEl(node);
        if (!ref) return;
        if (typeof ref === "function") {
          ref(node);
        } else {
          ref.current = node;
        }
      },
      [ref]
    );
    const onOpen = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        // ignora la riapertura causata dal click di chiusura sul backdrop
        if (Date.now() - lastCloseRef.current < 300) return;
        setOpen(true);
      },
      [disabled]
    );
    const onClose = React.useCallback(() => {
      lastCloseRef.current = Date.now();
      setOpen(false);
      setSearch("");
    }, []);
    const onClickItem = React.useCallback(
      (id: string | number) => {
        if (multiple) {
          const next = selectedValues.includes(id)
            ? selectedValues.filter(v => v !== id)
            : [...selectedValues, id];
          onChange(next);
          return;
        }
        onChange(id === value ? undefined : id);
      },
      [multiple, selectedValues, value, onChange]
    );

    const displayLabel = multiple
      ? selectedItems.map(item => item.label).join(", ")
      : selectedItem?.label;

    return (
      <Field
        ref={refCal}
        style={style}
        className={cn(!disabled && "cursor-pointer", className)}
        label={label}
        labelIcon={labelIcon}
        labelMandatory={labelMandatory}
        icon={icon}
        iconClassName={iconClassName}
        iconStyle={iconStyle}
        disabled={disabled}
        onClick={onOpen}
        inFocus={open}
      >
        {!multiple &&
          selectedItem &&
          (selectedItem.avatar ||
            selectedItem.avatarIcon ||
            selectedItem.avatarText) && (
            <AvatarUser
              className={cn("ml-[12px]", selectedItem.avatarClassName)}
              size={26}
              src={selectedItem.avatar}
              icon={selectedItem.avatarIcon}
              text={selectedItem.avatarText}
              circle={selectedItem.avatarCircle}
              style={selectedItem.avatarStyle}
            />
          )}
        <Text
          className={cn(
            "flex-1 px-2",
            displayLabel ? "text-fg" : "text-muted-fg italic"
          )}
          ellipsis
          children={displayLabel || placeholder}
        />
        {!disabled && (
          <Icon
            className={cn(
              "text-muted-fg transition-transform duration-200 mx-1",
              open && "rotate-180"
            )}
            children="arrow_drop_down"
          />
        )}
        <PopoverList
          open={open}
          anchorEl={anchorEl}
          onClose={onClose}
          style={{ width: anchorEl?.offsetWidth }}
          header={
            !showSearch ? undefined : (
              <div
                className="flex flex-col gap-1 px-2 pt-2"
                onClick={event => event.stopPropagation()}
              >
                <FieldText
                  icon="search"
                  placeholder="Cerca..."
                  autoFocus
                  value={search}
                  onChange={setSearch}
                />
                {!!normalizedSearch &&
                  !matchedItems.length &&
                  !createItems.length && (
                    <Text
                      size={0}
                      className="text-muted-fg px-1 pb-1"
                      children="Nessun risultato"
                    />
                  )}
              </div>
            )
          }
          actions={[...createItems, ...visibleItems].map(a => ({
            ...a,
            onClick: onClickItem,
            selected: selectedValues.includes(a.id),
            selectType: multiple ? SelectType.CHECK : a.selectType,
            disableClose: multiple || a.disableClose,
            input: normalizedSearch ? search.trim() : undefined,
          }))}
          footer={
            hiddenCount <= 0 ? undefined : (
              <Text
                size={0}
                className="text-muted-fg px-3 py-2"
                children={`+${hiddenCount} altri elementi`}
              />
            )
          }
        />
      </Field>
    );
  }
);

FieldSelect.displayName = "FieldSelect";

export default FieldSelect;
