"use client";

import * as React from "react";
import Portal from "../Portal";
import Icon from "../Icon";
import Text from "../Text";
import Btn from "../Btn";
import { cn } from "@/lib/utils";

// Sistema di notifiche temporanee (toast), esposto via contesto.
// Avvolgi l'albero con <ToastProvider> e richiama useToast() dove serve:
//   const { showToast } = useToast();
//   showToast({ variant: "success", message: "Modifiche salvate" });

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Durata in ms prima dell'auto-dismiss. Default 4000. */
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  /** In fase di uscita: gioca l'animazione prima di smontare. */
  leaving: boolean;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast deve essere usato dentro <ToastProvider>");
  }
  return ctx;
};

const EXIT_MS = 200;

const variantConfig: Record<ToastVariant, { icon: string; className: string }> =
  {
    success: { icon: "check_circle", className: "bg-[var(--succ)]" },
    error: { icon: "error", className: "bg-[var(--fail)]" },
    info: { icon: "info", className: "bg-[var(--info)]" },
    warning: { icon: "warning", className: "bg-[var(--warn)]" },
  };

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    // avvia l'uscita, poi rimuove a animazione conclusa
    setToasts(prev =>
      prev.map(t => (t.id === id ? { ...t, leaving: true } : t))
    );
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, EXIT_MS);
  }, []);

  const showToast = React.useCallback(
    ({ message, variant = "success", duration = 4000 }: ToastOptions) => {
      const id = ++idRef.current;
      setToasts(prev => [...prev, { id, message, variant, leaving: false }]);
      window.setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Portal>
        {/* Stack flottante centrato in basso, sopra l'area della SaveBar
            (bottom-6), con entrata dal basso verso l'alto. */}
        <div className="pointer-events-none fixed bottom-6 right-2 z-[100] flex flex-col items-center gap-2 px-4">
          {toasts.map(t => {
            const cfg = variantConfig[t.variant];
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  "pointer-events-auto flex items-center gap-3 rounded-xl py-2 pl-4 pr-2",
                  "min-w-[300px] max-w-[calc(100vw-2rem)]",
                  "shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
                  cfg.className,
                  t.leaving
                    ? "animate-out fade-out slide-out-to-bottom-4 duration-200"
                    : "animate-in fade-in slide-in-from-bottom-4 duration-300"
                )}
              >
                <Icon className="text-white" children={cfg.icon} />
                <Text
                  size={2}
                  className="flex-1 text-white"
                  children={t.message}
                />
                <Btn
                  small
                  icon="close"
                  tooltip="Chiudi"
                  color="#ffffff"
                  iconClassName="text-white"
                  onClick={() => remove(t.id)}
                />
              </div>
            );
          })}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
