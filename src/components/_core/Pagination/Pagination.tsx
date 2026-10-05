"use client";

import Text from "../Text";
import Btn from "../Btn";
import { cn } from "@/lib/utils";

export interface IPagination {
  className?: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  /** Nome plurale dell'elemento paginato, es. "missive"/"downtime". */
  itemLabel: string;
  onPageChange: (page: number) => void;
}

// Barra "N–M di TOT <elemento>" + Prev/Next, riusata da ogni lista paginata
// (missive, downtime, ...): non renderizza nulla con una sola pagina, stesso
// comportamento del blocco che sostituisce in `MissiveList`/
// `DowntimeList`.
const Pagination = ({
  className,
  page,
  pageSize,
  totalCount,
  totalPages,
  itemLabel,
  onPageChange,
}: IPagination) => {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between px-2", className)}>
      <Text
        className="text-muted-fg"
        children={`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} di ${totalCount} ${itemLabel}`}
      />
      <div className="flex items-center gap-2">
        <Btn
          className={page <= 1 ? "hidden" : ""}
          icon="chevron_left"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        />
        <Text weight="bolder" children={`${page} / ${totalPages}`} />
        <Btn
          className={page >= totalPages ? "hidden" : ""}
          icon="chevron_right"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        />
      </div>
    </div>
  );
};

export default Pagination;
