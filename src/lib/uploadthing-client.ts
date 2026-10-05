import {
  generateReactHelpers,
  type UseUploadthingProps,
} from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import type { DocumentUploadInput } from "@/lib/validations/documentUpload";
import type { AvatarUploadInput } from "@/lib/validations/avatarUpload";
import type { CampaignPresentationImageUploadInput } from "@/lib/validations/campaignPresentationUpload";
import type { RichTextImageUploadInput } from "@/lib/validations/richTextImageUpload";
import type { SupportAttachmentUploadInput } from "@/lib/validations/supportAttachmentUpload";

// Helper tipizzati generati dall'SDK per i componenti client di upload
// (T-021, esteso per gli avatar). Import di `OurFileRouter` è solo di tipo
// (`import type`): non porta con sé il modulo server (`core.ts`, che tocca
// Prisma/auth) nel bundle client.
const { useUploadThing: useUploadThingUntyped } =
  generateReactHelpers<OurFileRouter>();

type UntypedHelpers = ReturnType<typeof useUploadThingUntyped>;

// Wrapper tipizzato esplicitamente sull'input/output di ciascun endpoint
// invece di affidarsi alla firma condizionale di `useUploadThing`. Due
// problemi, entrambi falsi positivi dell'SDK sotto la configurazione di
// questo progetto, non dei chiamanti:
// 1) `input` opzionale/obbligatorio è scelto in base a `undefined extends
//    inferEndpointInput<...>`: con `strictNullChecks: false` (vedi CLAUDE.md/
//    tsconfig.json) `undefined` è assegnabile a qualunque tipo, quindi quella
//    condizione risolve sempre al ramo "opzionale" e TypeScript rifiuta un
//    `input` reale come "non assegnabile a `undefined`".
// 2) `Parameters<typeof useUploadThingUntyped>[1]` (usato per tipare `opts`
//    senza fissare l'endpoint) collassa il parametro di tipo generico
//    `TEndpoint` al suo vincolo (`keyof OurFileRouter`), quindi `opts.
//    onClientUploadComplete` vedrebbe l'unione degli output di *tutti* gli
//    endpoint invece di quello giusto: `UseUploadthingProps<OurFileRouter[E]>`,
//    istanziato per l'endpoint di ciascun overload, risolve anche questo.
// Il cast resta isolato qui, i componenti che lo usano (`DocumentsManager`,
// `AvatarUpload`) restano pienamente tipati.
export function useUploadThing(
  endpoint: "documentUploader",
  opts?: UseUploadthingProps<OurFileRouter["documentUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: DocumentUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "avatarUploader",
  opts?: UseUploadthingProps<OurFileRouter["avatarUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: AvatarUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "campaignLogoUploader",
  opts?: UseUploadthingProps<OurFileRouter["campaignLogoUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: CampaignPresentationImageUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "campaignCoverUploader",
  opts?: UseUploadthingProps<OurFileRouter["campaignCoverUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: CampaignPresentationImageUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "campaignGalleryUploader",
  opts?: UseUploadthingProps<OurFileRouter["campaignGalleryUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: CampaignPresentationImageUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "richTextImageUploader",
  opts?: UseUploadthingProps<OurFileRouter["richTextImageUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: RichTextImageUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint: "supportAttachmentUploader",
  opts?: UseUploadthingProps<OurFileRouter["supportAttachmentUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: SupportAttachmentUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
// Overload aggiuntivo (T-0xx, "Supporto"): `ImageUploadButton` in
// `FieldRichText.tsx` sceglie l'endpoint a runtime tramite la prop
// `uploadEndpoint`, quindi chiama questo hook con un valore tipato
// `"richTextImageUploader" | "supportAttachmentUploader"` — un'unione, non
// un letterale singolo. Nessuno dei due overload sopra combacia con
// un'unione (TypeScript risolve gli overload sul tipo ESATTO
// dell'argomento), serve quindi questa terza firma dedicata. L'input è
// tipato largo (l'unione dei due), il chiamante passa sempre la forma
// corretta per l'endpoint scelto.
export function useUploadThing(
  endpoint: "richTextImageUploader" | "supportAttachmentUploader",
  opts?: UseUploadthingProps<OurFileRouter["richTextImageUploader"]>
): Omit<UntypedHelpers, "startUpload"> & {
  startUpload: (
    files: File[],
    input: RichTextImageUploadInput | SupportAttachmentUploadInput
  ) => ReturnType<UntypedHelpers["startUpload"]>;
};
export function useUploadThing(
  endpoint:
    | "documentUploader"
    | "avatarUploader"
    | "campaignLogoUploader"
    | "campaignCoverUploader"
    | "campaignGalleryUploader"
    | "richTextImageUploader"
    | "supportAttachmentUploader",
  opts?: Parameters<typeof useUploadThingUntyped>[1]
) {
  const helpers = useUploadThingUntyped(endpoint, opts);

  return {
    ...helpers,
    startUpload: (
      files: File[],
      input:
        | DocumentUploadInput
        | AvatarUploadInput
        | CampaignPresentationImageUploadInput
        | RichTextImageUploadInput
        | SupportAttachmentUploadInput
    ) =>
      (
        helpers.startUpload as unknown as (
          files: File[],
          input:
            | DocumentUploadInput
            | AvatarUploadInput
            | CampaignPresentationImageUploadInput
            | RichTextImageUploadInput
            | SupportAttachmentUploadInput
        ) => ReturnType<typeof helpers.startUpload>
      )(files, input),
  };
}
