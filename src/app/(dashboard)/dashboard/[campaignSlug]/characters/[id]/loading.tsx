import { CharacterEditorSkeleton } from "@/components/CharacterEditor";
import Skeleton from "@/components/_core/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-[190px]" />
      <Skeleton className="min-h-[35px] mb-2 h-8 w-52" />
      <CharacterEditorSkeleton />
    </>
  );
}
