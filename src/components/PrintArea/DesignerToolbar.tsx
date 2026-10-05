"use client";

import * as React from "react";
import { fontName, fontStyle } from "./pdf";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";

// Barra degli strumenti dell'Area Stampa: sostituisce il pannello proprietà
// di pdfme (nascosto) con comandi semplici, diversi a seconda dell'elemento
// selezionato (testo, rettangolo/cerchio, linea, immagine).

export type SchemaPatch = Record<string, unknown>;
export type SelectTarget = { name: string; pageIndex: number };
export type DesignerSelectionInfo = {
  type: string;
  schema: Record<string, unknown>;
  // Elementi selezionati dello stesso tipo del primo: i destinatari delle
  // modifiche della barra.
  targets: SelectTarget[];
};

export interface IDesignerToolbar {
  selection: DesignerSelectionInfo | null;
  onApply: (patch: SchemaPatch, targets: SelectTarget[]) => void;
  onDelete: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  text: "Testo",
  image: "Immagine",
  rectangle: "Rettangolo",
  ellipse: "Cerchio",
  line: "Linea",
  qrcode: "QR",
};

const ALIGNMENTS = [
  { value: "left", icon: "text_align_left", tooltip: "Allinea a sinistra" },
  { value: "center", icon: "text_align_center", tooltip: "Centra" },
  { value: "right", icon: "text_align_right", tooltip: "Allinea a destra" },
];

// Il padding pdfme è per lato (mm): la barra lo gestisce uniforme e mostra
// il lato più ampio.
function paddingOf(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const sides = Object.values(value).filter(v => typeof v === "number");
  return sides.length ? Math.max(...(sides as number[])) : 0;
}

const Separator = () => <span className="mx-1 h-6 w-px bg-border" />;

// Campo numerico: applica il valore con Invio o all'uscita dal campo (non a
// ogni tasto, che ridisegnerebbe il designer a ogni cifra). Valori fuori
// intervallo vengono riportati nei limiti; un valore non numerico si scarta.
const NumberInput = ({
  label,
  value,
  step,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) => {
  const [draft, setDraft] = React.useState(String(value));
  // Mentre si scrive, un cambio di selezione (clic su un altro elemento)
  // non deve sovrascrivere la bozza né dirottarla: il valore va a chi era
  // selezionato quando si è entrati nel campo (`onChange`/`value` fissati al
  // focus).
  const focusedRef = React.useRef(false);
  const atFocusRef = React.useRef({ value, onChange });
  const latestValueRef = React.useRef(value);
  latestValueRef.current = value;
  React.useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    focusedRef.current = false;
    const { value: startValue, onChange: apply } = atFocusRef.current;
    const parsed = Number(draft.replace(",", "."));
    if (draft.trim() !== "" && Number.isFinite(parsed)) {
      const next = Math.round(Math.min(max, Math.max(min, parsed)) * 100) / 100;
      if (next !== startValue) apply(next);
    }
    setDraft(String(latestValueRef.current));
  };

  return (
    <label className="flex items-center gap-1">
      <Text size={0} className="text-muted-fg" children={label} />
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
          atFocusRef.current = { value, onChange };
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(atFocusRef.current.value));
            atFocusRef.current = { ...atFocusRef.current, onChange: () => {} };
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-16 rounded border border-border bg-transparent px-1 text-right text-sm"
      />
      {unit && <Text size={0} className="text-muted-fg" children={unit} />}
    </label>
  );
};

// `value` vuoto = nessun colore (trasparente), solo se `allowNone`.
const ColorPicker = ({
  label,
  value,
  allowNone,
  onChange,
}: {
  label: string;
  value: string;
  allowNone?: boolean;
  onChange: (value: string) => void;
}) => (
  <div className="flex items-center gap-1">
    <Text size={0} className="text-muted-fg" children={label} />
    <input
      type="color"
      aria-label={label}
      value={value || "#ffffff"}
      onChange={e => onChange(e.target.value)}
      className={
        value
          ? "h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
          : "h-7 w-9 cursor-pointer rounded border border-dashed border-border bg-transparent opacity-40"
      }
    />
    {allowNone && (
      <Btn
        small
        label="Nessuno"
        selected={!value}
        onClick={() => onChange("")}
      />
    )}
  </div>
);

const DesignerToolbar = ({
  selection,
  onApply,
  onDelete,
}: IDesignerToolbar) => {
  // Legata ai destinatari di questa selezione: un campo numerico che la
  // cattura al focus la applica a loro anche se nel frattempo si seleziona
  // altro.
  const apply = (patch: SchemaPatch) =>
    selection && onApply(patch, selection.targets);
  const type = selection?.type;
  const s = selection?.schema ?? {};
  const str = (key: string, fallback = "") =>
    typeof s[key] === "string" ? (s[key] as string) : fallback;
  const num = (key: string, fallback: number) =>
    typeof s[key] === "number" ? (s[key] as number) : fallback;

  return (
    <div className="flex min-h-[48px] flex-wrap items-center gap-1 rounded-lg border border-border bg-input p-2">
      <Text
        weight="bolder"
        className="mr-2"
        children={
          type
            ? (TYPE_LABELS[type] ?? "Elemento")
            : "Seleziona un elemento nella pagina"
        }
      />

      {type === "text" && (
        <TextControls
          bold={fontStyle(str("fontName")).bold}
          italic={fontStyle(str("fontName")).italic}
          fontSize={num("fontSize", 13)}
          alignment={str("alignment", "left")}
          fontColor={str("fontColor", "#000000")}
          backgroundColor={str("backgroundColor")}
          padding={paddingOf(s.padding)}
          onApply={apply}
        />
      )}

      {(type === "rectangle" || type === "ellipse") && (
        <>
          <ColorPicker
            label="Bordo"
            value={str("borderColor", "#000000")}
            onChange={v => apply({ borderColor: v })}
          />
          <NumberInput
            label="Spessore"
            value={num("borderWidth", 1)}
            step={1}
            min={0}
            max={20}
            onChange={v => apply({ borderWidth: v })}
          />
          <Separator />
          <ColorPicker
            label="Sfondo"
            value={str("color")}
            allowNone
            onChange={v => apply({ color: v })}
          />
        </>
      )}

      {type === "line" && (
        <>
          <ColorPicker
            label="Colore"
            value={str("color", "#000000")}
            onChange={v => apply({ color: v })}
          />
          <NumberInput
            label="Spessore"
            value={num("height", 0.5)}
            unit="mm"
            step={0.5}
            min={0.5}
            max={20}
            onChange={v => apply({ height: v })}
          />
        </>
      )}

      {type === "image" && (
        <Text
          size={0}
          className="text-muted-fg"
          children="Doppio clic sull'immagine per caricarne un'altra dal PC"
        />
      )}

      {selection && (
        <>
          <div className="flex-1" />
          <Btn small icon="delete" label="ELIMINA" onClick={onDelete} />
        </>
      )}
    </div>
  );
};

const TextControls = ({
  bold,
  italic,
  fontSize,
  alignment,
  fontColor,
  backgroundColor,
  padding,
  onApply,
}: {
  bold: boolean;
  italic: boolean;
  fontSize: number;
  alignment: string;
  fontColor: string;
  backgroundColor: string;
  padding: number;
  onApply: (patch: SchemaPatch) => void;
}) => (
  <>
    <Btn
      small
      icon="text_bold"
      tooltip="Grassetto"
      selected={bold}
      onClick={() => onApply({ fontName: fontName(!bold, italic) })}
    />
    <Btn
      small
      icon="text_italic"
      tooltip="Corsivo"
      selected={italic}
      onClick={() => onApply({ fontName: fontName(bold, !italic) })}
    />
    <Separator />
    <NumberInput
      label="Dimensione"
      unit="pt"
      value={fontSize}
      step={1}
      min={4}
      max={96}
      onChange={v => onApply({ fontSize: v })}
    />
    <Separator />
    {ALIGNMENTS.map(a => (
      <Btn
        key={a.value}
        small
        icon={a.icon}
        tooltip={a.tooltip}
        selected={alignment === a.value}
        onClick={() => onApply({ alignment: a.value })}
      />
    ))}
    <Separator />
    <ColorPicker
      label="Colore"
      value={fontColor}
      onChange={v => onApply({ fontColor: v })}
    />
    <ColorPicker
      label="Sfondo"
      value={backgroundColor}
      allowNone
      onChange={v => onApply({ backgroundColor: v })}
    />
    <Separator />
    <NumberInput
      label="Margine interno"
      unit="mm"
      value={padding}
      step={1}
      min={0}
      max={20}
      onChange={v =>
        onApply({ padding: { top: v, right: v, bottom: v, left: v } })
      }
    />
  </>
);

export default DesignerToolbar;
