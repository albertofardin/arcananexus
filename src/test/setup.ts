import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: "/",
    query: {},
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children:
      React.ReactNode | ((props: Record<string, unknown>) => React.ReactNode);
    href: string;
    [key: string]: unknown;
  }) => {
    // For asChild pattern (when Link is wrapped in Button), render children as-is
    if (typeof children === "function") {
      return children({ href });
    }
    // Otherwise, render as anchor
    return React.createElement("a", { href, ...props }, children);
  },
}));

// Mock window.matchMedia (usato da use-mobile, richiesto dai components)
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Mock ResizeObserver (usato da Radix, es. Tooltip/Popover via
// `@radix-ui/react-use-size`): jsdom non lo implementa, e senza questo stub
// qualunque test che apre un tooltip/popover Radix crasha con "ResizeObserver
// is not defined" (T-046, scoperto testando i tooltip di validazione dei
// form di login).
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock HTMLCanvasElement.getContext: jsdom non lo implementa e stampa "Not
// implemented" a ogni chiamata. `is-emoji-supported` (dipendenza di
// `@tiptap/extension-emoji`) lo invoca al caricamento del modulo, quindi il
// warning compare in ogni test che importa `FieldRichText`. `null` è il
// valore che un browser restituisce quando il contesto non è disponibile.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.DIRECT_URL = "postgresql://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET = "test-secret-key-for-testing-only";
