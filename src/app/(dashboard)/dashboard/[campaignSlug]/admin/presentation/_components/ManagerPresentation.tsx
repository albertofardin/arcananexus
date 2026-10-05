"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import FieldUploadLogo from "./FieldUploadLogo";
import FieldUploadCover from "./FieldUploadCover";
import FieldGallery from "./FieldGallery";
import PreviewTheme from "./PreviewTheme";
import PreviewCover from "./PreviewCover";
import Card from "@/components/_core/Card";
import Skeleton from "@/components/_core/Skeleton";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useToast } from "@/components/_core/Toast";
import { ErrorCard } from "@/components/Feedback";
import HeroPage from "@/components/HeroPage";
import HeroSection from "@/components/HeroSection";
import SaveBar from "@/components/SaveBar";
import Badge from "@/components/_core/Badge";
import { SelectType } from "@/components/_core/Checkbox/Checkbox";
import {
  useQueryCampaignPresentation,
  campaignPresentationQueryKey,
} from "@/lib/queries/campaignPresentation";
import { campaignsQueryKey } from "@/lib/queries/campaigns";
import {
  type CampaignPresentation,
  MAX_CAMPAIGN_GALLERY_IMAGES,
} from "@/lib/validations/campaignPresentationUpload";
import type { Campaign } from "@/lib/validations/campaign";
import { routes } from "@/app/routes";
import {
  themeColors,
  themeTextures,
  defaultColor,
  defaultTexture,
  type ThemeColor,
  type ThemeTexture,
} from "@/app/themes";

// Stesso vincolo di `slugField` in `src/lib/validations/campaign.ts`, usato
// qui solo per dare un riscontro immediato in UI: la validazione che conta
// resta quella server-side in `updateCampaignSchema`.
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface IManagerPresentation {
  readOnly?: boolean;
}

const ManagerPresentation = ({ readOnly = false }: IManagerPresentation) => {
  const params = useParams<{ campaignSlug: string }>();
  const campaignSlug = params.campaignSlug;
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } =
    useQueryCampaignPresentation(campaignSlug);

  // Le campagne mostrate dal SidePanel vengono mostrate da `useQueryCampaigns()`
  // Va aggiornata esplicitamente qui ogni volta che cambia un campo
  const patchCampaignInList = React.useCallback(
    (patch: Partial<Campaign>) => {
      queryClient.setQueryData<Campaign[]>(campaignsQueryKey(), prev =>
        prev?.map(c => (c.slug === campaignSlug ? { ...c, ...patch } : c))
      );
    },
    [campaignSlug, queryClient]
  );

  const patchPresentation = React.useCallback(
    (patch: Partial<CampaignPresentation>) => {
      queryClient.setQueryData<CampaignPresentation>(
        campaignPresentationQueryKey(campaignSlug),
        prev => (prev ? { ...prev, ...patch } : prev)
      );
      patchCampaignInList(patch);
      router.refresh();
    },
    [campaignSlug, queryClient, router, patchCampaignInList]
  );

  const [name, setName] = React.useState("");
  const [savedName, setSavedName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [savedSlug, setSavedSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [savedDescription, setSavedDescription] = React.useState("");
  const [color, setColor] = React.useState<ThemeColor>(defaultColor);
  const [savedColor, setSavedColor] = React.useState<ThemeColor>(defaultColor);
  const [texture, setTexture] = React.useState<ThemeTexture>(defaultTexture);
  const [savedTexture, setSavedTexture] =
    React.useState<ThemeTexture>(defaultTexture);
  const [saving, setSaving] = React.useState(false);
  const seededRef = React.useRef(false);

  React.useEffect(() => {
    if (!seededRef.current && data) {
      setName(data.name);
      setSavedName(data.name);
      setSlug(data.slug);
      setSavedSlug(data.slug);
      setDescription(data.description ?? "");
      setSavedDescription(data.description ?? "");
      setColor(data.color);
      setSavedColor(data.color);
      setTexture(data.texture);
      setSavedTexture(data.texture);
      seededRef.current = true;
    }
  }, [data]);

  const dirty =
    name !== savedName ||
    slug !== savedSlug ||
    description !== savedDescription ||
    color !== savedColor ||
    texture !== savedTexture;

  const slugValid = SLUG_REGEX.test(slug);

  const selectedSwatch =
    themeColors.find(c => c.id === color)?.swatch ?? themeColors[0].swatch;

  const handleSave = React.useCallback(async () => {
    if (!slugValid) {
      showToast({
        variant: "error",
        message:
          "Lo slug può contenere solo lettere minuscole, numeri e trattini",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, color, texture }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Errore durante il salvataggio");
      }

      setSavedName(name);
      setSavedSlug(slug);
      setSavedDescription(description);
      setSavedColor(color);
      setSavedTexture(texture);
      patchCampaignInList({ name, slug, color, texture });

      // Aggiorna subito la cache della query di questa pagina: senza
      // questo, se si esce e si rientra prima che un eventuale refetch
      // in background sia completato, il componente si riseeda dal
      // valore ancora vecchio in cache e vi resta bloccato (`seededRef`
      // impedisce un secondo seed).
      queryClient.setQueryData<CampaignPresentation>(
        campaignPresentationQueryKey(campaignSlug),
        prev =>
          prev ? { ...prev, name, slug, description, color, texture } : prev
      );

      showToast({
        variant: "success",
        message: "Modifiche salvate",
      });

      // Lo slug è nell'URL: se cambia, va aggiornato il path e la query
      // (chiave `campaignPresentationQueryKey`) o la pagina resta bloccata
      // sullo slug vecchio. Si preseed la cache sulla nuova chiave con i
      // dati già in mano per evitare uno skeleton di caricamento subito
      // dopo il redirect.
      if (slug !== campaignSlug && data) {
        queryClient.setQueryData<CampaignPresentation>(
          campaignPresentationQueryKey(slug),
          { ...data, name, slug, description, color, texture }
        );
        // `router.replace` naviga sul nuovo path e riesegue i Server
        // Component di destinazione: già equivalente a un refresh.
        router.replace(routes.campaignAdminPresentation(slug));
      } else {
        // Nome/descrizione/colore/trama sono mostrati anche da Server
        // Component fuori da questa pagina (sidebar, header): un
        // `router.refresh()` li riallinea senza perdere lo stato client.
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message:
          err instanceof Error
            ? err.message
            : "Errore durante il salvataggio delle modifiche",
      });
    } finally {
      setSaving(false);
    }
  }, [
    campaignSlug,
    name,
    slug,
    slugValid,
    description,
    color,
    texture,
    data,
    queryClient,
    router,
    showToast,
    patchCampaignInList,
  ]);

  const handleDiscard = React.useCallback(() => {
    setName(savedName);
    setSlug(savedSlug);
    setDescription(savedDescription);
    setColor(savedColor);
    setTexture(savedTexture);
  }, [savedName, savedSlug, savedDescription, savedColor, savedTexture]);

  return (
    <>
      <HeroPage
        title="Presentazione"
        subtitle="Nome, logo, copertina, colore, trama, descrizione e galleria"
        action={
          readOnly && <Badge label="Sola lettura" icon="visibility" disabled />
        }
      />

      {isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[180px] w-full" />
          <Skeleton className="h-[140px] w-full" />
        </div>
      ) : error ? (
        <ErrorCard onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Card className="relative flex-col items-stretch overflow-hidden gap-2 p-4">
            <FieldText
              label="Nome campagna"
              placeholder="Nome della campagna..."
              value={name}
              onChange={setName}
              disabled={readOnly}
            />
            <FieldText
              label="URL della campagna"
              placeholder="slug-campagna"
              error={slug.length > 0 && !slugValid}
              value={slug}
              onChange={setSlug}
              disabled={readOnly}
            />
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex flex-1 flex-col gap-2">
                <FieldUploadLogo
                  campaignSlug={campaignSlug}
                  src={data?.logo ?? null}
                  onChange={url => patchPresentation({ logo: url })}
                  disabled={readOnly}
                />
                <FieldUploadCover
                  campaignSlug={campaignSlug}
                  src={data?.cover ?? null}
                  onChange={url => patchPresentation({ cover: url })}
                  disabled={readOnly}
                />
              </div>
              <PreviewCover
                className="mx-auto sm:mx-0 sm:mt-5"
                name={name}
                logo={data?.logo ?? null}
                cover={data?.cover ?? null}
                color={color}
                texture={texture}
              />
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex flex-1 flex-col gap-2">
                <FieldSelect
                  label="Colore principale"
                  icon="palette"
                  iconStyle={{ color: selectedSwatch }}
                  value={color}
                  items={themeColors.map(c => ({
                    id: c.id,
                    label: c.label,
                    icon: "palette",
                    iconStyle: { color: c.swatch },
                  }))}
                  onChange={value => setColor(value as ThemeColor)}
                  disabled={readOnly}
                />
                <FieldSelect
                  label="Trama decorativa"
                  icon="texture"
                  value={texture}
                  items={themeTextures.map(t => ({
                    id: t.id,
                    label: t.label,
                    selectType: SelectType.RADIO,
                  }))}
                  onChange={value => setTexture(value as ThemeTexture)}
                  disabled={readOnly}
                />
              </div>
              <PreviewTheme
                className="mx-auto sm:mx-0 sm:mt-5"
                color={color}
                texture={texture}
              />
            </div>
            <FieldText
              label="Descrizione della campagna"
              placeholder="Racconta ai giocatori di cosa parla questa campagna..."
              value={description}
              onChange={setDescription}
              multiline
              disabled={readOnly}
            />
          </Card>

          <Card className="flex-col items-stretch gap-3 p-5 justify-start">
            <HeroSection
              icon="photo_library"
              title="Galleria"
              subtitle={`Fino a ${MAX_CAMPAIGN_GALLERY_IMAGES} immagini aggiuntive`}
            />
            <FieldGallery
              campaignSlug={campaignSlug}
              images={data?.images ?? []}
              onChanged={() => {
                void refetch();
                router.refresh();
              }}
              disabled={readOnly}
            />
          </Card>
        </div>
      )}

      {!readOnly && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={false}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </>
  );
};

export default ManagerPresentation;
