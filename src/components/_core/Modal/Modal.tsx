"use client";

import * as React from "react";
import Text from "../Text";
import CircularProgress from "../CircularProgress";
import Divider from "../Divider";
import Btn from "../Btn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./primitives";
import { cn } from "@/lib/utils";

const SIZE = 100;

export interface IModal {
  className?: string;
  style?: React.CSSProperties;
  open: boolean;
  loading?: boolean;
  title?: string;
  titleChildren?: React.ReactElement | React.ReactNode;
  titleClose?: boolean;
  onClose: () => void;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  content?: React.ReactElement | React.ReactNode;
  actionsClassName?: string;
  actionsStyle?: React.CSSProperties;
  actions?: React.ReactElement | React.ReactNode;
  actionsLoading?: boolean;
  popover?: boolean;
  fullscreen?: boolean;
}

const Modal = ({
  className,
  style,
  open,
  loading,
  title,
  titleChildren,
  titleClose,
  onClose,
  contentClassName,
  contentStyle,
  content,
  actionsClassName,
  actionsStyle,
  actions,
  actionsLoading,
  popover,
  fullscreen,
}: IModal) => {
  const contentRef = React.useRef<HTMLDivElement>(null);

  // ponytail: contenuti complessi (es. ModalTalents) montano centinaia di nodi
  // nello stesso commit che avvia la transizione CSS di apertura/chiusura,
  // bloccando il thread principale e "saltando" i frame dell'animazione.
  // Rimandiamo il mount del body di un frame (rAF) e lo segniamo come
  // transizione (startTransition) così React può cedere il passo al browser
  // mentre l'animazione parte, invece di fare un commit sincrono pesante.
  const [renderContent, setRenderContent] = React.useState(open);
  React.useEffect(() => {
    if (!open) {
      setRenderContent(false);
      return;
    }
    const id = requestAnimationFrame(() =>
      React.startTransition(() => setRenderContent(true))
    );
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onOpenChange = React.useCallback(
    v => {
      if (!v) onClose();
    },
    [onClose]
  );

  // ponytail: su mobile Radix rimanda la chiusura-su-tap-esterno al `click`
  // successivo al pointerdown; se il tap esterno cade su un elemento che ferma
  // la propagazione del click (es. BtnBase), quel click non arriva mai a
  // document e il popover resta aperto. Chiudiamo noi al pointerdown, in
  // capture, così non dipendiamo dal click. Non gestisce popover annidati in
  // altri popover (contentRef.contains fallirebbe): da rivedere se serve.
  React.useEffect(() => {
    if (!popover || !open) return;

    const onPointerDownOutside = (event: PointerEvent) => {
      if (!contentRef.current?.contains(event.target as Node)) onClose();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDownOutside, true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDownOutside, true);
    };
  }, [popover, open, onClose]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle style={{ display: "hidden" }} />
      <DialogContent
        ref={contentRef}
        aria-describedby={undefined}
        onOpenAutoFocus={e => e.preventDefault()}
        style={style}
        transparentOverlay={popover}
        className={cn(
          "[&>button]:hidden",
          "gap-0 overflow-hidden border border-border p-0 flex flex-col",
          "max-h-[calc(100dvh-30px)] max-w-[calc(100vw-30px)]",
          fullscreen && [
            "h-[calc(100dvh-30px)] w-[calc(100vw-30px)]",
            "max-sm:h-dvh max-sm:w-dvw max-sm:max-h-dvh max-sm:max-w-[100dvw] max-sm:rounded-none max-sm:border-0",
          ],
          loading && "flex items-center justify-center p-10",
          className
        )}
      >
        {loading ? (
          <CircularProgress size={SIZE / 2} />
        ) : (
          <>
            {!title ? null : (
              <DialogHeader className="">
                <DialogTitle className="flex-1" asChild>
                  <Text
                    className="flex-1"
                    size={2}
                    weight="bolder"
                    children={title}
                  />
                </DialogTitle>
                {titleChildren}
                {titleClose && <Btn icon="close" onClick={onClose} />}
              </DialogHeader>
            )}

            {!content ? null : (
              <div
                style={contentStyle}
                className={cn(
                  [
                    "flex min-h-0 max-w-full flex-1 flex-col overflow-y-auto",
                    // min() evita che su schermi < 380px il contenuto sfori
                    // la max-width del dialog (e venga tagliato)
                    !popover && "min-w-[min(350px,calc(100vw-30px))] p-3 gap-3",
                  ],
                  contentClassName
                )}
                children={renderContent ? content : null}
              />
            )}

            {!actions ? null : (
              <>
                <Divider />
                <DialogFooter
                  style={actionsStyle}
                  className={actionsClassName}
                  children={
                    actionsLoading ? (
                      <div className="flex items-center gap-2 h-[35px]">
                        <CircularProgress
                          color="var(--muted-fg)"
                          size={16}
                          thickness={8}
                        />
                        <Text
                          className="italic text-[var(--muted-fg)]"
                          children="Aggiornamento..."
                        />
                      </div>
                    ) : (
                      actions
                    )
                  }
                />
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
