"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import type { Template } from "@pdfme/common";
import type { PrintLayoutSource, PrintSheet } from "@prisma/client";
import PrintDesigner, { type PrintDesignerHandle } from "./PrintDesigner";
import { downloadPdf, renderPdf } from "./pdf";
import type { PrintItem, PrintLayoutDto } from "./types";
import Accordion from "@/components/_core/Accordion";
import Card from "@/components/_core/Card";
import CircularProgress from "@/components/_core/CircularProgress";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import { useToast } from "@/components/_core/Toast";
import {
  DEFAULT_SHEET_GAP,
  DEFAULT_SHEET_MARGIN,
  MAX_PRINT_ITEMS,
  MAX_SHEET_SPACING,
  SHEET_LABELS,
  type SheetSpacing,
  type PrintField,
  type PrintRow,
} from "@/lib/print/fields";

const NEW = "new";

const DEFAULT_SIZE: Record<PrintLayoutSource, [number, number]> = {
  character: [148, 210],
  reference: [63, 88],
  free: [210, 297],
};

const DEFAULT_SHEET: Record<PrintLayoutSource, PrintSheet> = {
  character: "none",
  reference: "a4_portrait",
  free: "none",
};

function blankTemplate(source: PrintLayoutSource): Template {
  const [width, height] = DEFAULT_SIZE[source];
  return {
    basePdf: { width, height, padding: [0, 0, 0, 0] },
    schemas: [[]],
  };
}

function spacingOf(layout: PrintLayoutDto | null): SheetSpacing {
  return {
    gap: layout?.sheetGap ?? DEFAULT_SHEET_GAP,
    margin: layout?.sheetMargin ?? DEFAULT_SHEET_MARGIN,
  };
}

function pageSize(template: Template): [number, number] {
  const base = template.basePdf;
  return typeof base === "object" && "width" in base
    ? [base.width, base.height]
    : DEFAULT_SIZE.free;
}

export interface IPrintWorkspace {
  source: PrintLayoutSource;
  layouts: PrintLayoutDto[];
  fields: PrintField[];
  items: PrintItem[];
  // Filtro sopra l'elenco (es. tipo di dato dei cartellini): la selezione
  // resta tra un filtro e l'altro, così si stampano insieme voci di tipi
  // diversi con lo stesso layout.
  itemsFilter?: React.ReactNode;
}

const PrintWorkspace = ({
  source,
  layouts,
  fields,
  items,
  itemsFilter,
}: IPrintWorkspace) => {
  const { campaignSlug } = useParams<{ campaignSlug: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const designerRef = React.useRef<PrintDesignerHandle>(null);

  const [layoutId, setLayoutId] = React.useState<number | typeof NEW>(
    layouts[0]?.id ?? NEW
  );
  const layout = layouts.find(l => l.id === layoutId) ?? null;
  // Il Designer si rimonta solo quando si sceglie un altro layout dal
  // select, non al salvataggio (dopo un POST `layouts` si aggiorna solo al
  // `router.refresh()` successivo).
  const [designer, setDesigner] = React.useState(() => ({
    key: 0,
    template: (layout?.template as Template) ?? blankTemplate(source),
  }));

  const [name, setName] = React.useState(layout?.name ?? "");
  const [sheet, setSheet] = React.useState<PrintSheet>(
    layout?.sheet ?? DEFAULT_SHEET[source]
  );
  const [size, setSize] = React.useState(pageSize(designer.template));
  const [spacing, setSpacing] = React.useState<SheetSpacing>(spacingOf(layout));
  const [selected, setSelected] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const selectLayout = (id: number | typeof NEW) => {
    const next = layouts.find(l => l.id === id) ?? null;
    const template = (next?.template as Template) ?? blankTemplate(source);
    setLayoutId(next?.id ?? NEW);
    setName(next?.name ?? "");
    setSheet(next?.sheet ?? DEFAULT_SHEET[source]);
    setSize(pageSize(template));
    setSpacing(spacingOf(next));
    setDesigner(prev => ({ key: prev.key + 1, template }));
  };

  const fail = (message: string) => showToast({ variant: "error", message });

  const sheetSpacingBody = {
    sheetGap: spacing.gap,
    sheetMargin: spacing.margin,
  };

  // Stessi limiti della validazione server (0–MAX_SHEET_SPACING mm).
  const applySpacing = (key: keyof SheetSpacing, value: string) => {
    const mm = Number(value.replace(",", "."));
    if (value.trim() === "" || !Number.isFinite(mm)) return;
    setSpacing(prev => ({
      ...prev,
      [key]: Math.min(MAX_SHEET_SPACING, Math.max(0, mm)),
    }));
  };

  const handleSave = async () => {
    const template = designerRef.current?.getTemplate();
    if (!template) return;
    if (!name.trim()) return fail("Dai un nome al layout");

    setBusy(true);
    try {
      const isNew = layoutId === NEW;
      const res = await fetch(
        isNew
          ? `/api/campaigns/${campaignSlug}/print-layouts`
          : `/api/campaigns/${campaignSlug}/print-layouts/${layoutId}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isNew
              ? { source, name, template, sheet, ...sheetSpacingBody }
              : { name, template, sheet, ...sheetSpacingBody }
          ),
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Errore nel salvataggio");
      if (isNew) setLayoutId(body.id);
      showToast({ variant: "success", message: "Layout salvato" });
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (layoutId === NEW) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignSlug}/print-layouts/${layoutId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Errore durante l'eliminazione");
      setConfirmDelete(false);
      selectLayout(NEW);
      showToast({ variant: "success", message: "Layout eliminato" });
      router.refresh();
    } catch (err) {
      fail(
        err instanceof Error ? err.message : "Errore durante l'eliminazione"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    const template = designerRef.current?.getTemplate();
    if (!template) return;
    if (source !== "free" && selected.length === 0)
      return fail("Seleziona almeno un elemento da stampare");

    setBusy(true);
    setDownloading(true);
    try {
      let rows: PrintRow[] = [{}];
      if (source !== "free") {
        // La route accetta al massimo MAX_PRINT_ITEMS id per richiesta
        // (converte le immagini lato server): selezioni più grandi vanno a
        // blocchi, in sequenza per non caricare il server.
        rows = [];
        for (let i = 0; i < selected.length; i += MAX_PRINT_ITEMS) {
          const ids = selected.slice(i, i + MAX_PRINT_ITEMS);
          const res = await fetch(`/api/campaigns/${campaignSlug}/print-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, ids }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(body?.error ?? "Errore nei dati");
          rows.push(...body.rows);
        }
      }
      const pdf = await renderPdf(template, rows, sheet, spacing);
      downloadPdf(pdf, name.trim() || "stampa");
    } catch (err) {
      console.error(err);
      fail(
        err instanceof Error
          ? `Errore durante la generazione del PDF: ${err.message}`
          : "Errore durante la generazione del PDF"
      );
    } finally {
      setBusy(false);
      setDownloading(false);
    }
  };

  const applySize = (index: 0 | 1, value: string) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm < 10 || mm > 1000) return;
    const next: [number, number] = index === 0 ? [mm, size[1]] : [size[0], mm];
    setSize(next);
    designerRef.current?.setPageSize(next[0], next[1]);
  };

  const allSelected =
    items.length > 0 && items.every(i => selected.includes(i.id));

  const setAll = (select: boolean) =>
    setSelected(prev =>
      select
        ? [...prev, ...items.map(i => i.id).filter(id => !prev.includes(id))]
        : prev.filter(id => !items.some(i => i.id === id))
    );

  // `Card` centra il contenuto di default: qui tutto è allineato a sinistra.
  const cardClass = "flex-col items-stretch justify-start gap-3 p-3";

  return (
    <div className="flex flex-col gap-3">
      <Card className={cardClass}>
        <div className="flex gap-2">
          <FieldSelect
            className="flex-1"
            label="Layout"
            value={String(layoutId)}
            items={[
              { id: NEW, label: "+ Nuovo layout" },
              ...layouts.map(l => ({ id: String(l.id), label: l.name })),
            ]}
            onChange={v =>
              v !== undefined && selectLayout(v === NEW ? NEW : Number(v))
            }
          />
          <FieldText
            className="flex-1"
            label="Nome layout"
            value={name}
            onChange={setName}
          />
        </div>
        <div className="flex gap-2">
          <FieldText
            className="flex-1"
            label="Larghezza (mm)"
            inputType="number"
            value={String(size[0])}
            onBlur={v => applySize(0, v)}
          />
          <FieldText
            className="flex-1"
            label="Altezza (mm)"
            inputType="number"
            value={String(size[1])}
            onBlur={v => applySize(1, v)}
          />
          <FieldText
            className="flex-1"
            label="Spaziatura (mm)"
            inputType="number"
            disabled={sheet === "none"}
            value={String(spacing.gap)}
            onBlur={v => applySpacing("gap", v)}
          />
          <FieldText
            className="flex-1"
            label="Margine foglio (mm)"
            inputType="number"
            disabled={sheet === "none"}
            value={String(spacing.margin)}
            onBlur={v => applySpacing("margin", v)}
          />
          <FieldSelect
            className="flex-1"
            label="Foglio di stampa"
            value={sheet}
            items={Object.entries(SHEET_LABELS).map(([id, label]) => ({
              id,
              label,
            }))}
            onChange={v => v !== undefined && setSheet(v as PrintSheet)}
          />
        </div>
        <div className="flex flex-row-reverse gap-2">
          {layoutId !== NEW && (
            <Btn
              className="min-w-[160px] text-center"
              icon="delete"
              label="ELIMINA LAYOUT"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            />
          )}
          <Btn
            className="min-w-[160px] text-center"
            variant="bold"
            icon="check"
            label="SALVA LAYOUT"
            disabled={busy}
            onClick={handleSave}
          />
        </div>
      </Card>

      {fields.length > 0 && (
        <Accordion
          titleIcon="edit"
          title="Campi disponibili — clicca per aggiungerli alla pagina"
          contentClassName="flex-row flex-wrap gap-2 p-3 pt-1"
        >
          {fields.map(field => (
            <Btn
              key={field.key}
              small
              icon={field.kind === "image" ? "image" : "add"}
              label={field.key}
              onClick={() => designerRef.current?.addField(field)}
            />
          ))}
        </Accordion>
      )}

      <PrintDesigner
        key={designer.key}
        ref={designerRef}
        template={designer.template}
      />

      {source !== "free" && (
        <Card className={cardClass}>
          <Text
            weight="bolder"
            children={`Da stampare (${selected.length} selezionati)`}
          />
          <div className="flex flex-wrap items-end gap-2">
            {itemsFilter}
            <Btn
              small
              icon="check"
              label="Seleziona tutti"
              disabled={items.length === 0 || allSelected}
              onClick={() => setAll(true)}
            />
            <Btn
              small
              icon="close"
              label="Deseleziona tutti"
              disabled={!items.some(i => selected.includes(i.id))}
              onClick={() => setAll(false)}
            />
          </div>
          {items.length === 0 ? (
            <Text className="text-muted-fg" children="Nessun elemento" />
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <BtnCheckbox
                  key={item.id}
                  className="justify-start"
                  selected={selected.includes(item.id)}
                  label={
                    item.subtitle
                      ? `${item.label} — ${item.subtitle}`
                      : item.label
                  }
                  onClick={check =>
                    setSelected(prev =>
                      check
                        ? [...prev, item.id]
                        : prev.filter(id => id !== item.id)
                    )
                  }
                />
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        {downloading && <CircularProgress size={20} />}
        <Btn
          className="min-w-[200px] text-center"
          variant="bold"
          icon="download"
          label="SCARICA PDF"
          disabled={busy}
          onClick={handleDownload}
        />
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Elimina layout"
        content={<Text children={`Eliminare il layout «${layout?.name}»?`} />}
        actionsLoading={busy}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setConfirmDelete(false)} />
            <Btn variant="bold" label="ELIMINA" onClick={handleDelete} />
          </>
        }
      />
    </div>
  );
};

export default PrintWorkspace;
