"use client";

import { useRouter } from "next/navigation";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <Text size={10} weight="bolder" className="text-6xl" children="404" />
          <Text size={6} weight="bolder" children="Pagina non trovata" />
          <Text
            size={3}
            className="text-muted-fg"
            children="La pagina che stai cercando non esiste."
          />
        </div>
        <Btn
          variant="bold"
          label="Torna alla home"
          onClick={() => router.push("/")}
        />
      </div>
    </div>
  );
}
