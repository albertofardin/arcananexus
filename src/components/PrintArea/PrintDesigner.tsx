"use client";

import * as React from "react";
import type { Template } from "@pdfme/common";
import type { Designer } from "@pdfme/ui";
import DesignerToolbar, {
  type DesignerSelectionInfo,
  type SchemaPatch,
  type SelectTarget,
} from "./DesignerToolbar";
import { loadFonts, loadPlugins } from "./pdf";
import { uniqueFieldName, type PrintField } from "@/lib/print/fields";

// Wrapper del Designer pdfme (trascina/ridimensiona campi, carica loghi dal
// PC, aggiunge pagine). Montato una volta per layout (`key` nel parent): il
// template vivo resta dentro al Designer e si legge con `getTemplate()`.
// Il pannello proprietà di pdfme è nascosto: stili ed eliminazione passano
// da `DesignerToolbar`, sopra al canvas.

export interface PrintDesignerHandle {
  getTemplate: () => Template | null;
  addField: (field: PrintField) => void;
  setPageSize: (width: number, height: number) => void;
}

export interface IPrintDesigner {
  template: Template;
}

// `Designer.updateTemplate` è asincrono: ricostruisce i campi con id nuovi e
// alla fine azzera la selezione. Una `selectSchemas` subito dopo agirebbe
// sugli elementi vecchi e verrebbe annullata, quindi si riprova a ogni frame
// finché i campi risultano selezionati con id diversi da quelli di prima.
const RESELECT_MAX_FRAMES = 30;

function reselectAfterUpdate(
  designer: Designer,
  targets: SelectTarget[],
  previousIds: string[],
  onDone: () => void,
  frame = 0
) {
  requestAnimationFrame(() => {
    try {
      designer.selectSchemas(targets);
    } catch {
      return onDone(); // Designer distrutto nel frattempo.
    }
    requestAnimationFrame(() => {
      const selected = designer.getSelectedSchemas();
      const settled =
        selected.length > 0 &&
        selected.every(s => !previousIds.includes(s.schemaId));
      if (settled || frame >= RESELECT_MAX_FRAMES) onDone();
      else
        reselectAfterUpdate(designer, targets, previousIds, onDone, frame + 1);
    });
  });
}

function selectedTargets(designer: Designer, type?: string): SelectTarget[] {
  return designer
    .getSelectedSchemas()
    .filter(s => type === undefined || s.type === type)
    .map(s => ({ name: s.name, pageIndex: s.pageIndex }));
}

function selectionInfo(designer: Designer): DesignerSelectionInfo | null {
  const first = designer.getSelectedSchemas()[0];
  return first
    ? {
        type: first.type,
        schema: { ...first.schema },
        targets: selectedTargets(designer, first.type),
      }
    : null;
}

const PrintDesigner = React.forwardRef<PrintDesignerHandle, IPrintDesigner>(
  ({ template }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const designerRef = React.useRef<Designer | null>(null);
    const [selection, setSelection] =
      React.useState<DesignerSelectionInfo | null>(null);
    // Durante la riselezione la barra ignora la selezione vuota transitoria,
    // così non lampeggia su "Seleziona un elemento".
    const reselectingRef = React.useRef(false);
    const sizeObserverRef = React.useRef<ResizeObserver | null>(null);

    // pdfme si dimensiona sulla parte del contenitore VISIBILE nel viewport
    // (`BaseUIClass.setSize`): se al primo render il designer è in parte
    // sotto il bordo della finestra resta "tagliato". Si sostituisce il suo
    // ResizeObserver con uno che usa le dimensioni reali del contenitore.
    // Il costruttore di pdfme non disegna: il primo render parte proprio dal
    // ResizeObserver, quindi `fit()` deve renderizzare sempre.
    // ponytail: usa `size`/`render` interni di pdfme (non API pubbliche),
    // da ricontrollare a ogni aggiornamento di @pdfme/ui.
    const fitToContainer = (designer: Designer, container: HTMLElement) => {
      const internal = designer as unknown as {
        size: { width: number; height: number };
        render: () => void;
      };
      designer.resizeObserver.disconnect();
      const fit = () => {
        const { clientWidth: width, clientHeight: height } = container;
        if (!width || !height) return;
        internal.size = { width, height };
        internal.render();
      };
      sizeObserverRef.current = new ResizeObserver(fit);
      sizeObserverRef.current.observe(container);
      fit();
    };

    React.useEffect(() => {
      let disposed = false;
      (async () => {
        const [{ Designer }, plugins, font] = await Promise.all([
          import("@pdfme/ui"),
          loadPlugins(),
          loadFonts(),
        ]);
        if (disposed || !containerRef.current) return;
        const designer = new Designer({
          domContainer: containerRef.current,
          template,
          plugins,
          options: { lang: "it", font, sidebarOpen: false },
        });
        fitToContainer(designer, containerRef.current);
        designer.onChangeSelection(() => {
          const info = selectionInfo(designer);
          if (info || !reselectingRef.current) setSelection(info);
        });
        designerRef.current = designer;
      })();
      return () => {
        disposed = true;
        sizeObserverRef.current?.disconnect();
        designerRef.current?.destroy();
        designerRef.current = null;
      };
      // Il template iniziale conta solo al montaggio: poi è del Designer.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Modifica `targets` (gli elementi selezionati quando è partito il
    // comando) e mantiene la selezione attuale: `updateTemplate` ridisegna il
    // canvas e la azzera. Se nel frattempo si è selezionato altro (clic su
    // un altro elemento mentre si scriveva un valore) resta selezionato quello.
    const applyToSelection = (patch: SchemaPatch, targets: SelectTarget[]) => {
      const designer = designerRef.current;
      if (!designer || targets.length === 0) return;
      const current = designer.getTemplate();
      for (const target of targets) {
        const schema = current.schemas[target.pageIndex]?.find(
          s => s.name === target.name
        );
        if (schema) Object.assign(schema, patch);
      }
      const keep = selectedTargets(designer);
      if (keep.length === 0) {
        designer.updateTemplate(current);
        return;
      }
      updateAndSelect(designer, current, keep);
      setSelection(prev =>
        prev && prev.targets[0]?.name === targets[0].name
          ? { ...prev, schema: { ...prev.schema, ...patch } }
          : prev
      );
    };

    const updateAndSelect = (
      designer: Designer,
      next: Template,
      targets: SelectTarget[]
    ) => {
      const previousIds = designer.getSelectedSchemas().map(s => s.schemaId);
      reselectingRef.current = true;
      designer.updateTemplate(next);
      reselectAfterUpdate(designer, targets, previousIds, () => {
        reselectingRef.current = false;
        setSelection(selectionInfo(designer));
      });
    };

    const deleteSelection = () => {
      const designer = designerRef.current;
      if (!designer) return;
      const targets = designer.getSelectedSchemas();
      const current = designer.getTemplate();
      designer.updateTemplate({
        ...current,
        schemas: current.schemas.map((page, pageIndex) =>
          page.filter(
            s =>
              !targets.some(t => t.pageIndex === pageIndex && t.name === s.name)
          )
        ),
      });
      setSelection(null);
    };

    React.useImperativeHandle(ref, () => ({
      getTemplate: () => designerRef.current?.getTemplate() ?? null,
      addField: async field => {
        const designer = designerRef.current;
        if (!designer) return;
        const { text, image } = await import("@pdfme/schemas");
        const current = designer.getTemplate();
        const page = designer.getPageCursor();
        const isImage = field.kind === "image";
        const base = (isImage ? image : text).propPanel.defaultSchema;
        const name = uniqueFieldName(
          field.key,
          current.schemas.flat().map(s => s.name)
        );
        current.schemas[page].push({
          ...base,
          name,
          content: isImage ? "" : field.key,
          position: { x: 5, y: 5 },
          width: isImage ? 30 : 50,
          height: isImage ? 30 : 8,
          ...(isImage ? {} : { fontSize: 11 }),
        });
        updateAndSelect(designer, current, [{ name, pageIndex: page }]);
      },
      setPageSize: (width, height) => {
        const designer = designerRef.current;
        if (!designer) return;
        const current = designer.getTemplate();
        if (
          typeof current.basePdf !== "object" ||
          !("width" in current.basePdf)
        )
          return;
        designer.updateTemplate({
          ...current,
          basePdf: { ...current.basePdf, width, height },
        });
      },
    }));

    return (
      <div className="flex h-[80vh] min-h-[560px] flex-col gap-2 rounded-xl border border-border bg-card p-2">
        <DesignerToolbar
          selection={selection}
          onApply={applyToSelection}
          onDelete={deleteSelection}
        />
        <div
          ref={containerRef}
          // Il pannello proprietà di pdfme resta chiuso (`sidebarOpen:
          // false`); si nasconde anche la freccia che lo riaprirebbe.
          className="min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-border bg-input [&_.pdfme-designer-right-sidebar]:!hidden"
        />
      </div>
    );
  }
);

PrintDesigner.displayName = "PrintDesigner";

export default PrintDesigner;
