"use client";

import { ErrorCard } from "@/components/Feedback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container py-8">
      <div className="mx-auto w-full max-w-md">
        <ErrorCard
          title="Qualcosa è andato storto"
          message={
            error.message
              ? `Si è verificato un errore durante il caricamento della dashboard. Dettagli: ${error.message}`
              : "Si è verificato un errore durante il caricamento della dashboard."
          }
          onRetry={() => reset()}
        />
      </div>
    </div>
  );
}
