import type { ReactNode } from "react";
import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

// Skeleton condivisi dai loading.tsx degli eventi (con e senza campagna).
// Le altezze ricalcano quelle dei componenti reali (Btn/Field 40px, label dei
// Field 20px, righe di testo) per evitare salti di layout a fine caricamento.

const HeroBannerSkeleton = ({ withActions }: { withActions?: boolean }) => (
  <div className="flex flex-col items-start gap-4 rounded-xl p-4 ring-1 ring-inset ring-border sm:flex-row sm:items-center">
    <Skeleton className="aspect-video w-full shrink-0 rounded-lg sm:h-24 sm:w-auto" />
    <div className="flex w-full flex-col gap-1">
      {withActions ? (
        <>
          <Skeleton className="h-10 w-2/3 rounded" />
          <Skeleton className="h-10 w-44 rounded" />
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <Skeleton className="h-[22px] w-24 rounded-full" />
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </div>
          <Skeleton className="h-9 w-2/3 rounded sm:h-10" />
        </>
      )}
    </div>
  </div>
);

const InfoItemSkeleton = () => (
  <div className="flex h-11 items-center gap-3">
    <Skeleton className="h-10 w-10 min-w-[40px] rounded" />
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-36" />
    </div>
  </div>
);

const SectionCardSkeleton = ({ children }: { children: ReactNode }) => (
  <Card className="flex-col items-stretch gap-3 p-4">
    <div className="flex h-7 items-center gap-2">
      <Skeleton className="h-[18px] w-[18px] rounded" />
      <Skeleton className="h-5 w-40" />
    </div>
    {children}
  </Card>
);

const FieldSkeleton = ({ tall }: { tall?: boolean }) => (
  <div className="space-y-2">
    <Skeleton className="h-3 w-24" />
    <Skeleton
      className={tall ? "h-[120px] w-full rounded" : "h-10 w-full rounded"}
    />
  </div>
);

/** Card del form con intestazione HeroSection (avatar + titolo) */
const FormSectionSkeleton = ({
  subtitle,
  children,
}: {
  subtitle?: boolean;
  children: ReactNode;
}) => (
  <Card className="flex-col items-stretch gap-2 p-3">
    <div className="flex items-center gap-3">
      <Skeleton className="h-[42px] w-[42px] rounded" />
      {subtitle ? (
        <div className="flex h-11 flex-col justify-center gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      ) : (
        <Skeleton className="h-4 w-40" />
      )}
    </div>
    {children}
  </Card>
);

/** BtnLink "Torna a…" + HeroPage */
const PageHeaderSkeleton = ({ subtitle = true }: { subtitle?: boolean }) => (
  <>
    <Skeleton className="h-10 w-40" />
    <div className="space-y-1 py-0.5 pl-2">
      <Skeleton className="h-7 w-48" />
      {subtitle && <Skeleton className="h-4 w-64" />}
    </div>
  </>
);

/** Dettaglio evento (EventReader) */
export const EventDetailSkeleton = () => (
  <>
    <Skeleton className="h-10 w-40" />
    <HeroBannerSkeleton />
    <Card className="flex-col items-stretch gap-5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 min-w-[48px] rounded" />
          <div className="flex h-[52px] flex-col justify-center gap-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded" />
      </div>
      <Divider />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InfoItemSkeleton />
        <Skeleton className="h-10 w-44 rounded" />
      </div>
      <Skeleton className="h-52 w-full max-w-lg rounded-lg" />
    </Card>
    {Array.from({ length: 2 }).map((_, i) => (
      <SectionCardSkeleton key={i}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItemSkeleton />
          <InfoItemSkeleton />
        </div>
      </SectionCardSkeleton>
    ))}
    <SectionCardSkeleton>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </SectionCardSkeleton>
  </>
);

/** Creazione/modifica evento (EventWriter) */
export const EventFormSkeleton = ({ isNew }: { isNew?: boolean }) => (
  <>
    <PageHeaderSkeleton subtitle={!isNew} />
    <div className="flex flex-col gap-4">
      <HeroBannerSkeleton withActions />
      <Card className="flex-col items-stretch gap-3 p-3">
        <FieldSkeleton />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-64 rounded" />
        </div>
        <div>
          <FieldSkeleton />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <FieldSkeleton tall />
      </Card>
      {Array.from({ length: 2 }).map((_, i) => (
        <FormSectionSkeleton key={i}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </FormSectionSkeleton>
      ))}
      <FormSectionSkeleton subtitle>
        <Skeleton className="h-10 w-48 rounded" />
      </FormSectionSkeleton>
      <div className="flex flex-wrap justify-end gap-3">
        {!isNew && (
          <>
            <Skeleton className="h-10 w-36 rounded" />
            <div className="flex-1" />
          </>
        )}
        <Skeleton className="h-10 w-24 rounded" />
        <Skeleton className="h-10 w-36 rounded" />
      </div>
    </div>
  </>
);

/** Iscrizione a un evento (EventRegisterPage) */
export const EventRegisterSkeleton = () => (
  <>
    <PageHeaderSkeleton />
    <Card className="flex-col items-stretch gap-3 p-4">
      <Skeleton className="my-1 h-5 w-40" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-3">
          <Skeleton className="h-[18px] w-[18px] rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </Card>
  </>
);
