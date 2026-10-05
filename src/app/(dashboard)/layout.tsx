"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import SidePanel from "@/components/SidePanel";
import Dashboard from "@/components/Dashboard";
import ToastProvider from "@/components/_core/Toast";
import ImpersonationToolbar from "@/components/ImpersonationToolbar";
import SplashScreen from "@/components/SplashScreen/SplashScreen";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Campagne/eventi/capabilities cambiano raramente: senza uno
            // staleTime esplicito (default 0) ogni remount di questo layout
            // — es. un hard reload della dashboard — ripartiva da cache
            // vuota e rifaceva tutte le fetch anche a dati invariati. Nessuna
            // invalidazione esplicita esiste altrove nel codebase (le
            // mutation si affidano a `router.refresh()` sui Server
            // Component), quindi un default moderato non nasconde nessun
            // aggiornamento che sarebbe altrimenti segnalato.
            staleTime: 60_000,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen />
      <ToastProvider>
        <div className="flex h-full w-full flex-col overflow-hidden">
          <ImpersonationToolbar />
          <div className="min-h-0 flex-1">
            <Dashboard SidePanel={SidePanel} Workspace={children} />
          </div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}
