"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import HeroSection from "../HeroSection";
import HeroBanner from "@/components/HeroBanner";
import ModalImageCrop from "@/components/ModalImageCrop";
import Card from "@/components/_core/Card";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Badge from "@/components/_core/Badge";
import Modal from "@/components/_core/Modal";
import FieldText from "@/components/_core/FieldText";
import FieldDate from "@/components/_core/FieldDate";
import FieldSelect from "@/components/_core/FieldSelect";
import CircularProgress from "@/components/_core/CircularProgress";
import { useToast } from "@/components/_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";
import {
  NO_CAMPAIGN_LABEL,
  type EventVisibility,
} from "@/lib/validations/event";
import { routes } from "@/app/routes";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // allineato a `supportAttachmentUploader`
const NO_CAMPAIGN = "__none__";

export interface EventFormValues {
  id: number;
  name: string;
  image: string | null;
  description: string;
  place: string | null;
  dateEventStart: string; // ISO
  dateEventEnd: string;
  datePublicationStart: string;
  datePublicationEnd: string;
  price: number;
  campaignSlug: string | null;
  visibility: EventVisibility;
  bookingCount: number;
  // Con iscrizioni a pagamento l'evento non è eliminabile, solo nascondibile.
  paidBookingCount: number;
  paymentOptions: { label: string; amount: number }[];
}

export interface IEventWriter {
  /** Assente = creazione. */
  event?: EventFormValues;
  /** Campagne in cui l'utente può creare eventi. */
  campaigns: { slug: string; name: string }[];
  /** Solo direttivo/sviluppo possono creare eventi senza campagna. */
  canChooseNoCampaign: boolean;
  /** Campagna preselezionata (creazione da dentro una campagna). */
  defaultCampaignSlug?: string;
}

// `datetime-local` lavora nel fuso del browser: la conversione avviene solo
// lato client (dopo il mount), mai durante l'SSR, per non avere valori
// diversi tra server e client.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Form di creazione/modifica evento. */
const EventWriter = ({
  event,
  campaigns,
  canChooseNoCampaign,
  defaultCampaignSlug,
}: IEventWriter) => {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState(event?.name ?? "");
  const [image, setImage] = React.useState<string | null>(event?.image ?? null);
  const [description, setDescription] = React.useState(
    event?.description ?? ""
  );
  const [place, setPlace] = React.useState(event?.place ?? "");
  const [dateEventStart, setDateEventStart] = React.useState("");
  const [dateEventEnd, setDateEventEnd] = React.useState("");
  const [datePublicationStart, setPublicationDate] = React.useState("");
  const [datePublicationEnd, setCloseDate] = React.useState("");
  const [price, setPrice] = React.useState(String(event?.price ?? 0));
  const [paymentOptions, setPaymentOptions] = React.useState(
    (event?.paymentOptions ?? []).map(option => ({
      label: option.label,
      amount: String(option.amount),
    }))
  );
  const [campaignSlug, setCampaignSlug] = React.useState<string>(
    event
      ? (event.campaignSlug ?? NO_CAMPAIGN)
      : (defaultCampaignSlug ?? NO_CAMPAIGN)
  );
  const [visibility, setVisibility] = React.useState<EventVisibility>(
    event?.visibility ?? "visible"
  );
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!event) return;
    setDateEventStart(toLocalInput(event.dateEventStart));
    setDateEventEnd(toLocalInput(event.dateEventEnd));
    setPublicationDate(toLocalInput(event.datePublicationStart));
    setCloseDate(toLocalInput(event.datePublicationEnd));
  }, [event]);

  const { startUpload, isUploading } = useUploadThing(
    "supportAttachmentUploader",
    {
      onClientUploadComplete: res => {
        const url = res?.[0]?.serverData?.url;
        if (url) setImage(url);
      },
      onUploadError: error =>
        showToast({
          variant: "error",
          message: error.message || "Errore durante il caricamento",
        }),
    }
  );
  const imageBusy = isUploading;
  // File scelto in attesa di ritaglio 16:9 (vedi `ModalImageCrop`).
  const [cropFile, setCropFile] = React.useState<File | null>(null);

  const handleImage = (changeEvent: React.ChangeEvent<HTMLInputElement>) => {
    setCropFile(changeEvent.target.files?.[0] ?? null);
    changeEvent.target.value = "";
  };

  const uploadCropped = async (cropped: File) => {
    setCropFile(null);
    if (cropped.size > MAX_IMAGE_BYTES) {
      showToast({
        variant: "error",
        message: "Immagine troppo grande (massimo 4MB)",
      });
      return;
    }
    await startUpload([cropped], {});
  };

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const remove = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante l'eliminazione",
        });
        return;
      }
      showToast({ variant: "success", message: "Evento eliminato" });
      router.push(
        (json.campaignSlug
          ? routes.campaignEvents(json.campaignSlug)
          : routes.events()) as never
      );
      router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const iso = (value: string) =>
        value ? new Date(value).toISOString() : "";
      const response = await fetch(
        event ? `/api/events/${event.id}` : "/api/events",
        {
          method: event ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            image,
            description,
            place,
            dateEventStart: iso(dateEventStart),
            dateEventEnd: iso(dateEventEnd),
            datePublicationStart: iso(datePublicationStart),
            datePublicationEnd: iso(datePublicationEnd),
            price,
            visibility,
            campaignSlug: campaignSlug === NO_CAMPAIGN ? null : campaignSlug,
            paymentOptions,
          }),
        }
      );
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors: Record<string, string[]> =
          json?.details?.fieldErrors ?? {};
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([key, msgs]) => [key, msgs[0]])
          )
        );
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante il salvataggio",
        });
        return;
      }
      showToast({ variant: "success", message: "Evento salvato" });
      router.push(routes.event(json.campaignSlug, json.id) as never);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const campaignItems = [
    ...(canChooseNoCampaign
      ? [
          {
            id: NO_CAMPAIGN,
            label: NO_CAMPAIGN_LABEL,
          },
        ]
      : []),
    ...campaigns.map(campaign => ({ id: campaign.slug, label: campaign.name })),
  ];
  const fieldError = (key: string) =>
    errors[key] ? (
      <Text size={0} className="text-red-600" children={errors[key]} />
    ) : null;

  // Modifica, creato da dentro una campagna o una sola scelta possibile: la
  // campagna non è modificabile, quindi il campo è nascosto.
  const campaignLocked =
    Boolean(event) || Boolean(defaultCampaignSlug) || campaignItems.length <= 1;

  // Niente `debounce={0}` sulle date: `FieldDate` con debounce nullo entra in loop
  // quando il valore arriva dall'esterno (modifica evento, vedi useEffect sopra).
  const dateField = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <div>
      <FieldDate
        withTime
        label={label}
        labelMandatory
        value={value}
        onChange={onChange}
        max="2030-12-31T23:59"
      />
      {fieldError(key)}
    </div>
  );

  const campaignLabel =
    campaignSlug === NO_CAMPAIGN
      ? NO_CAMPAIGN_LABEL
      : campaignItems.find(item => item.id === campaignSlug)?.label;

  return (
    <div className="flex flex-col gap-4">
      {/* ── hero ─────────────────────────────── */}
      <HeroBanner className="flex flex-col gap-3 p-4">
        <div className="flex flex-1 flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-black/10 sm:h-24 sm:w-auto">
            {image ? (
              <Image
                src={image}
                alt={name || "Immagine evento"}
                fill
                sizes="(min-width: 640px) 171px, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Icon className="text-white/40" children="image" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 self-stretch sm:self-auto">
            <FieldText
              className="border-transparent bg-transparent hover:border-white/30 focus-within:border-white/30"
              inputClassName="h-auto py-1 text-[22px] font-bold tracking-[0.012em] text-white sm:text-[28px]"
              placeholder="Titolo evento..."
              debounce={0}
              value={name}
              onChange={setName}
              error={Boolean(errors.name)}
            />
            {fieldError("name")}
            <div className="flex shrink-0 flex-row flex-wrap items-center gap-2">
              {imageBusy && <CircularProgress size={20} color="#fff" />}
              <Btn
                color="var(--primary)"
                icon="add_photo_alternate"
                iconClassName="text-white"
                labelClassName="text-white"
                label={image ? "Sostituisci immagine" : "Carica immagine"}
                disabled={imageBusy}
                onClick={() => fileInputRef.current?.click()}
              />
              {image && (
                <Btn
                  color="var(--primary)"
                  icon="delete"
                  iconClassName="text-white"
                  labelClassName="text-white"
                  label="Rimuovi immagine"
                  disabled={imageBusy}
                  onClick={() => setImage(null)}
                />
              )}
            </div>
          </div>
        </div>
      </HeroBanner>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImage}
      />
      <ModalImageCrop
        file={cropFile}
        onClose={() => setCropFile(null)}
        onConfirm={uploadCropped}
      />

      <Card className="flex-col items-stretch gap-3 p-3">
        {!campaignLocked && (
          <FieldSelect
            label="Campagna"
            labelMandatory
            items={campaignItems}
            value={campaignSlug}
            onChange={value => setCampaignSlug(value as string)}
            showAllItems
          />
        )}

        <div>
          <FieldText
            label="Prezzo di iscrizione"
            labelMandatory
            icon="euro"
            inputType="number"
            debounce={0}
            value={price}
            onChange={setPrice}
            error={Boolean(errors.price)}
          />
          {fieldError("price")}
        </div>

        <div className="flex flex-col gap-2">
          <Text
            size={0}
            className="text-muted-fg"
            children="Quote alternative opzionali (es. quota ridotta per solo un giorno di gioco o aggiunta pasto). In fase di iscrizione l'utente sceglierà se pagare la quota base oppure una di queste."
          />
          {paymentOptions.map((option, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <FieldText
                className="w-32"
                label="Importo"
                icon="euro"
                inputType="number"
                debounce={0}
                value={option.amount}
                onChange={value =>
                  setPaymentOptions(options =>
                    options.map((o, i) =>
                      i === index ? { ...o, amount: value } : o
                    )
                  )
                }
              />
              <FieldText
                className="min-w-[220px] flex-1"
                label="Descrizione"
                debounce={0}
                value={option.label}
                onChange={value =>
                  setPaymentOptions(options =>
                    options.map((o, i) =>
                      i === index ? { ...o, label: value } : o
                    )
                  )
                }
              />
              <Btn
                icon="delete"
                onClick={() =>
                  setPaymentOptions(options =>
                    options.filter((_, i) => i !== index)
                  )
                }
              />
            </div>
          ))}
          <Btn
            icon="add"
            label="Aggiungi opzione di pagamento"
            onClick={() =>
              setPaymentOptions(options => [
                ...options,
                { label: "", amount: "" },
              ])
            }
          />
          {fieldError("paymentOptions")}
        </div>

        <div>
          <FieldText
            label="Luogo"
            labelMandatory
            icon="location"
            debounce={0}
            value={place}
            onChange={setPlace}
            error={Boolean(errors.place)}
          />
          {fieldError("place")}
          <Text
            size={0}
            className="text-muted-fg"
            children="Per una mappa precisa scrivi l'indirizzo completo (es. Via Roma 1, Verona): la posizione viene cercata in automatico, non servono le coordinate."
          />
        </div>

        <FieldText
          label="Descrizione"
          labelMandatory
          multiline
          debounce={0}
          value={description}
          onChange={setDescription}
          error={Boolean(errors.description)}
        />
        {fieldError("description")}
      </Card>

      <Card className="flex-col items-stretch gap-2 p-3">
        <HeroSection icon="event_check" title="Svolgimento evento" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dateField(
            "dateEventStart",
            "Inizio gioco",
            dateEventStart,
            setDateEventStart
          )}
          {dateField(
            "dateEventEnd",
            "Fine gioco",
            dateEventEnd,
            setDateEventEnd
          )}
        </div>
      </Card>

      <Card className="flex-col items-stretch gap-2 p-3">
        <HeroSection icon="lock_open" title="Iscrizioni" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dateField(
            "datePublicationStart",
            "Apertura",
            datePublicationStart,
            setPublicationDate
          )}
          {dateField(
            "datePublicationEnd",
            "Chiusura",
            datePublicationEnd,
            setCloseDate
          )}
        </div>
      </Card>

      <Card className="flex-col items-stretch gap-2 p-3">
        <HeroSection
          icon="visibility"
          title="Visibilità"
          subtitle="Un evento nascosto è visibile e gestibile solo dallo staff"
        />
        <BtnCheckbox
          label="Nascondi ai giocatori"
          selected={visibility === "hidden"}
          onClick={hide => setVisibility(hide ? "hidden" : "visible")}
        />
        {event && event.paidBookingCount > 0 && (
          <Text
            size={0}
            className="text-muted-fg"
            children="Ci sono già iscrizioni a pagamento: l'evento non può più essere eliminato, solo nascosto."
          />
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        {event && (
          <>
            <Btn
              icon="delete"
              label="Elimina evento"
              color="var(--fail)"
              disabled={saving || deleting || event.paidBookingCount > 0}
              tooltip={
                event.paidBookingCount > 0
                  ? "Ci sono iscrizioni a pagamento: l'evento non può essere eliminato, solo nascosto"
                  : undefined
              }
              onClick={() => setConfirmDelete(true)}
            />
            <div className="flex-1" />
          </>
        )}
        <Btn label="Annulla" onClick={() => router.back()} />
        <Btn
          variant="bold"
          icon="check"
          label={event ? "Salva modifiche" : "Crea evento"}
          disabled={saving || imageBusy}
          onClick={submit}
        />
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Elimina evento"
        content={
          <Text
            children={
              event?.bookingCount
                ? `Eliminare "${event.name}"? Verranno eliminate anche le ${event.bookingCount} iscrizioni. L'operazione non è reversibile.`
                : `Eliminare "${event?.name}"? L'operazione non è reversibile.`
            }
          />
        }
        actionsLoading={deleting}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setConfirmDelete(false)} />
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              onClick={remove}
            />
          </>
        }
      />
    </div>
  );
};

export default EventWriter;
