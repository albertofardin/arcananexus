"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataVisibility } from "@prisma/client";
import type { DocumentEntry } from "./types";
import { useManualReorder } from "./useManualReorder";
import { useDeleteEntry } from "./useDeleteEntry";
import ModalConfirmDelete from "./ModalConfirmDelete";
import ModalEditDataFile from "./ModalEditDataFile";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import BadgeRole from "@/components/BadgeRole";
import BtnMoveOrder from "@/components/BtnMoveOrder";
import Icon from "@/components/_core/Icon";
import { cn } from "@/lib/utils";

export type { DocumentEntry };

type PreviewKind = "loading" | "image" | "pdf" | "other";

// Gli URL UploadThing non hanno estensione: il tipo si ricava con una HEAD
// (niente download del file). Le immagini (mappe, loghi) mostrano
// l'anteprima reale; i PDF la prima pagina disegnata con pdfjs.
function FilePreview({ url }: { url: string | null }) {
  const [kind, setKind] = React.useState<PreviewKind>(
    url ? "loading" : "other"
  );
  const fail = React.useCallback(() => setKind("other"), []);

  React.useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { method: "HEAD" })
      .then(response => {
        const type = response.headers.get("content-type") ?? "";
        if (cancelled) return;
        setKind(
          type.startsWith("image/")
            ? "image"
            : type.includes("pdf")
              ? "pdf"
              : "other"
        );
      })
      .catch(() => !cancelled && setKind("other"));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (kind === "pdf" && url) {
    return <PdfThumbnail url={url} onError={fail} />;
  }

  if (kind === "image" && url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
        onError={fail}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-fg">
      <Icon
        size="lg"
        className="text-5xl transition-transform group-hover:scale-110"
        children={kind === "pdf" ? "description" : "insert_drive_file"}
      />
      {kind === "pdf" && (
        <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-bg">
          PDF
        </span>
      )}
    </div>
  );
}

// Larghezza di rendering della prima pagina: basta per la card più larga
// della griglia anche su schermi retina, senza pesare sulla memoria.
const PDF_THUMBNAIL_WIDTH = 480;

// Disegna la prima pagina del PDF in un canvas. pdfjs è importato
// dinamicamente (tocca API del DOM già all'import, rompe l'SSR) e con
// range request (`disableAutoFetch`/`disableStream`) scarica solo i byte
// necessari alla prima pagina quando il server li supporta.
function PdfThumbnail({ url, onError }: { url: string; onError: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      const task = pdfjs.getDocument({
        url,
        disableAutoFetch: true,
        disableStream: true,
      });
      destroy = () => void task.destroy();
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const viewport = page.getViewport({
        scale: PDF_THUMBNAIL_WIDTH / page.getViewport({ scale: 1 }).width,
      });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      if (!cancelled) setReady(true);
    })().catch(() => !cancelled && onError());

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url, onError]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "h-full w-full bg-white object-cover object-top transition-[opacity,transform] group-hover:scale-105",
        ready ? "opacity-100" : "animate-pulse opacity-40"
      )}
    />
  );
}

interface IManagerDataFiles {
  campaignSlug: string;
  dataTypeId: number;
  documents: DocumentEntry[];
  isMaster: boolean;
}

const ManagerDataFiles = ({
  campaignSlug,
  dataTypeId,
  documents,
  isMaster,
}: IManagerDataFiles) => {
  const router = useRouter();
  const [editing, setEditing] = React.useState<DocumentEntry | null>(null);
  const { deletingId, pendingDeleteId, setPendingDeleteId, handleDelete } =
    useDeleteEntry({
      buildUrl: id =>
        `/api/campaigns/${campaignSlug}/reference-data/${id}/document`,
      onDeleted: () => router.refresh(),
      successMessage: "Documento eliminato",
      errorMessage: "Errore durante l'eliminazione",
    });

  const { reordering, handleMove } = useManualReorder(
    campaignSlug,
    dataTypeId,
    documents,
    () => router.refresh()
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {documents.map((document, index) => (
          <Card
            key={document.id}
            className="flex-col items-stretch justify-start overflow-hidden p-0"
          >
            <a
              href={document.fileUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!document.fileUrl}
              className="group flex flex-1 flex-col"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted-bg">
                <FilePreview url={document.fileUrl} />
                {document.visibility === DataVisibility.hidden && (
                  <div className="absolute left-2 top-2">
                    <BadgeRole type="onlyStaff" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1 p-3">
                <Text
                  size={2}
                  weight="bolder"
                  className="line-clamp-2 break-words group-hover:underline"
                  children={document.name}
                />
                {document.description && (
                  <Text
                    size={1}
                    className="line-clamp-2 break-words text-muted-fg"
                    children={document.description}
                  />
                )}
              </div>
            </a>
            {isMaster && (
              <div className="flex items-center justify-between border-t border-border px-2 py-1">
                <Btn icon="tune" onClick={() => setEditing(document)} />
                <BtnMoveOrder
                  canMoveUp={index > 0}
                  canMoveDown={index < documents.length - 1}
                  disabled={reordering}
                  onMoveUp={() => handleMove(index, -1)}
                  onMoveDown={() => handleMove(index, 1)}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
      <ModalEditDataFile
        open={editing !== null}
        editing={editing}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
        onDelete={
          editing
            ? () => {
                setEditing(null);
                setPendingDeleteId(editing.id);
              }
            : undefined
        }
      />
      <ModalConfirmDelete
        open={pendingDeleteId !== null}
        title="Elimina documento"
        message="Sei sicuro di voler eliminare questo documento? L'operazione non è reversibile."
        submitting={deletingId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default ManagerDataFiles;
