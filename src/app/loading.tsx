import Skeleton from "@/components/_core/Skeleton";

// Fallback root minimo: entra in gioco solo per segmenti privi di un
// `loading.tsx` più specifico. La landing pubblica ((front)) non fa fetch
// bloccanti e ogni route sotto (dashboard)/dashboard ha già il proprio
// `loading.tsx` dedicato, quindi questo componente non deve assomigliare a
// una pagina in particolare: resta uno stato neutro, non una skeleton finta.
export default function Loading() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
