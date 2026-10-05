export interface ISkeletonGrid {
  /** Numero di placeholder; default 8 */
  count?: number;
  /** Altezza di ogni placeholder in px; default 280 (card evento/personaggio) */
  height?: number;
}

/** Griglia di placeholder animati per il caricamento delle card */
const SkeletonGrid = ({ count = 8, height = 280 }: ISkeletonGrid) => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{ height }}
        className="w-full animate-pulse rounded-xl bg-muted-bg"
      />
    ))}
  </div>
);

export default SkeletonGrid;
