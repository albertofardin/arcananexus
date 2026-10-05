"use client";

import * as React from "react";
import {
  DataTypeKind,
  DataCardinality,
  DataTypeAssignability,
  DataTypeRender,
  DataVisibility,
} from "@prisma/client";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldIconPicker from "@/components/_core/FieldIconPicker";
import Modal from "@/components/_core/Modal";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DataTypeAdmin } from "@/lib/validations/dataType";
import { CATALOG_ICONS } from "@/lib/icons";
import {
  DATA_TYPE_KIND_LABELS,
  DATA_TYPE_KIND_ICONS,
  DATA_TYPE_KIND_SUBLABELS,
  DATA_CARDINALITY_LABELS,
  DATA_TYPE_ASSIGNABILITY_LABELS,
  DATA_TYPE_RENDER_LABELS,
  DATA_TYPE_RENDER_ICONS,
  DATA_VISIBILITY_LABELS,
} from "@/lib/labels";

const ALL_KIND_ITEMS = (
  Object.keys(DATA_TYPE_KIND_LABELS) as DataTypeKind[]
).map(kind => ({
  id: kind,
  label: DATA_TYPE_KIND_LABELS[kind],
  subLabel: DATA_TYPE_KIND_SUBLABELS[kind],
  icon: DATA_TYPE_KIND_ICONS[kind],
}));

// "Talento" non è mai selezionabile, né in creazione né in modifica (kind:
// talent non è tra i kind creabili, vedi `creatableDataTypeKindEnum`, ed è
// l'unico kind che resta sempre `disabled` in update — vedi il campo
// "Tipologia" sotto): escluso dalla lista mostrata a meno che la riga
// aperta in modifica sia proprio "Talenti", nel qual caso deve comunque
// mostrare l'etichetta corretta invece del placeholder vuoto (T-046, round
// 4).
const KIND_ITEMS = ALL_KIND_ITEMS.filter(
  item => item.id !== DataTypeKind.talent
);

const CARDINALITY_ITEMS = (
  Object.keys(DATA_CARDINALITY_LABELS) as DataCardinality[]
).map(cardinality => ({
  id: cardinality,
  label: DATA_CARDINALITY_LABELS[cardinality],
}));

const ASSIGNABILITY_ITEMS = (
  Object.keys(DATA_TYPE_ASSIGNABILITY_LABELS) as DataTypeAssignability[]
)
  .filter(assignability => assignability !== DataTypeAssignability.none)
  .map(assignability => ({
    id: assignability,
    label: DATA_TYPE_ASSIGNABILITY_LABELS[assignability],
  }));

const RENDER_ITEMS = (
  Object.keys(DATA_TYPE_RENDER_LABELS) as DataTypeRender[]
).map(renderAs => ({
  id: renderAs,
  label: DATA_TYPE_RENDER_LABELS[renderAs],
  icon: DATA_TYPE_RENDER_ICONS[renderAs],
}));

const SIDEBAR_SHOW_ITEMS = [
  { id: "yes", label: "Sì" },
  { id: "no", label: "No" },
];

const VISIBILITY_ITEMS = (
  Object.keys(DATA_VISIBILITY_LABELS) as DataVisibility[]
).map(visibility => ({
  id: visibility,
  label: DATA_VISIBILITY_LABELS[visibility],
}));

export interface DataTypeFormState {
  name: string;
  description: string;
  kind: DataTypeKind;
  cardinality: DataCardinality;
  assignability: DataTypeAssignability;
  mandatory: boolean;
  renderAs: DataTypeRender;
  sidebarShow: boolean;
  sidebarOrder: string;
  icon: string;
  visibility: DataVisibility;
}

const EMPTY_FORM: DataTypeFormState = {
  name: "",
  description: "",
  kind: DataTypeKind.generic,
  cardinality: DataCardinality.single,
  assignability: DataTypeAssignability.always,
  mandatory: false,
  renderAs: DataTypeRender.catalog,
  sidebarShow: false,
  sidebarOrder: "",
  icon: "folder",
  visibility: DataVisibility.visible,
};

const toFormState = (dt: DataTypeAdmin): DataTypeFormState => ({
  name: dt.name,
  description: dt.description ?? "",
  kind: dt.kind,
  cardinality: dt.cardinality ?? DataCardinality.multi,
  assignability:
    dt.assignability === DataTypeAssignability.none
      ? DataTypeAssignability.creationOnly
      : dt.assignability,
  mandatory: dt.mandatory,
  renderAs: dt.renderAs,
  sidebarShow: dt.sidebarShow,
  sidebarOrder: dt.sidebarOrder === null ? "" : String(dt.sidebarOrder),
  icon: dt.icon ?? "",
  visibility: dt.visibility,
});

interface ModalDataTypeProps {
  open: boolean;
  editing: DataTypeAdmin | null;
  onClose: () => void;
  onSubmit: (values: DataTypeFormState) => Promise<boolean>;
  onDelete?: () => void;
}

const ModalDataType = ({
  open,
  editing,
  onClose,
  onSubmit,
  onDelete,
}: ModalDataTypeProps) => {
  const [form, setForm] = React.useState<DataTypeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (open) setForm(editing ? toFormState(editing) : EMPTY_FORM);
  }, [open, editing]);

  const patch = (next: Partial<DataTypeFormState>) =>
    setForm(prev => ({ ...prev, ...next }));

  const nameValid = form.name.trim().length > 0;

  // In modifica di una riga "Talenti" il campo "Tipologia" resta `disabled`
  // (unico kind sempre immutabile), ma deve comunque mostrare l'etichetta
  // "Talento" invece del placeholder vuoto: `KIND_ITEMS` lo esclude sempre
  // perché non deve mai essere selezionabile.
  const kindItems = React.useMemo(
    () => (editing?.kind === DataTypeKind.talent ? ALL_KIND_ITEMS : KIND_ITEMS),
    [editing]
  );

  const handleSubmit = async () => {
    if (!nameValid) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(form);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen={isMobile}
      title={editing ? "Modifica tipo di dato" : "Nuovo tipo di dato"}
      content={
        <div className="flex flex-col md:flex-row w-full md:w-[645px] max-w-full">
          <div className="flex flex-col flex-1 gap-3">
            <div className="flex gap-3 w-full">
              <FieldIconPicker
                className="min-w-[35px]"
                label="Icona"
                value={form.icon}
                icons={CATALOG_ICONS}
                onChange={icon => patch({ icon })}
                input={false}
              />
              <FieldText
                className="flex-1"
                label="Nome"
                labelMandatory
                placeholder="Nome..."
                value={form.name}
                onChange={name => patch({ name })}
              />
            </div>
            <FieldSelect
              label="Presentazione"
              value={form.renderAs}
              items={RENDER_ITEMS}
              icon={DATA_TYPE_RENDER_ICONS[form.renderAs]}
              onChange={(renderAs: DataTypeRender) => {
                if (!renderAs) return null;
                patch({
                  renderAs,
                  ...(renderAs !== DataTypeRender.catalog && {
                    kind: DataTypeKind.generic,
                  }),
                });
              }}
            />
            <FieldText
              label="Descrizione"
              placeholder="Descrizione..."
              multiline
              multilineFullHeight
              value={form.description}
              onChange={description => patch({ description })}
            />
          </div>
          <div className="h-px md:h-auto md:w-px bg-border my-4 md:my-0 md:mx-3" />
          <div className="flex flex-col flex-1 gap-3">
            <FieldSelect
              label="Tipologia"
              disabled={
                editing?.kind === DataTypeKind.talent ||
                form.renderAs !== DataTypeRender.catalog
              }
              value={form.kind}
              items={kindItems}
              icon={DATA_TYPE_KIND_ICONS[form.kind]}
              onChange={kind => patch({ kind: kind as DataTypeKind })}
            />
            {form.kind === DataTypeKind.assignable && (
              <>
                <FieldSelect
                  label="Modifica di assegnazione"
                  value={form.assignability}
                  items={ASSIGNABILITY_ITEMS}
                  onChange={assignability =>
                    patch({
                      assignability: assignability as DataTypeAssignability,
                    })
                  }
                />
                <FieldSelect
                  label="Modalità di assegnazione"
                  value={form.cardinality}
                  items={CARDINALITY_ITEMS}
                  onChange={cardinality =>
                    patch({ cardinality: cardinality as DataCardinality })
                  }
                />
              </>
            )}
            {(form.kind === DataTypeKind.assignable ||
              form.kind === DataTypeKind.origins) && (
              <>
                <FieldSelect
                  label="Obbligatorio"
                  value={form.mandatory ? "yes" : "no"}
                  items={SIDEBAR_SHOW_ITEMS}
                  onChange={value => patch({ mandatory: value === "yes" })}
                />
                <FieldSelect
                  label="Visibilità predefinita al giocatore"
                  value={form.visibility}
                  items={VISIBILITY_ITEMS}
                  onChange={value =>
                    patch({ visibility: value as DataVisibility })
                  }
                />
              </>
            )}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <FieldSelect
                className="flex-1"
                label="Mostra in sidebar"
                value={form.sidebarShow ? "yes" : "no"}
                items={SIDEBAR_SHOW_ITEMS}
                onChange={value => patch({ sidebarShow: value === "yes" })}
              />
              {form.sidebarShow && (
                <FieldText
                  className="flex-1"
                  label="Ordinamento in sidebar"
                  placeholder="Automatico"
                  inputType="number"
                  value={form.sidebarOrder}
                  onChange={sidebarOrder => patch({ sidebarOrder })}
                />
              )}
            </div>
          </div>
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          {onDelete && (
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              onClick={onDelete}
            />
          )}
          <div className="flex-1" />
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            variant="bold"
            label={editing ? "SALVA" : "CREA"}
            disabled={!nameValid}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalDataType;
