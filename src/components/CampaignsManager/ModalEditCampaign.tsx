"use client";

import * as React from "react";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import { useToast } from "@/components/_core/Toast";
import type { Campaign } from "@/lib/validations/campaign";

// Stesso slug regex di `validations/campaign.ts` (SLUG_REGEX), duplicato qui
// solo per la validazione lato client del form.
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface IModalEditCampaign {
  campaign: Campaign | null;
  onClose: () => void;
  onUpdated: () => void;
}

// Modale di modifica campagna (nome/slug) dalla vista "god view" di
// Amministrazione > Gestione Campagne, riservata a Sviluppo Web — vedi
// `PUT /api/admin/campaigns/[campaignSlug]`. Resta montato anche a modale
// chiusa (così l'animazione di chiusura non perde il testo); i campi si
// ripopolano ogni volta che `campaign` cambia.
const ModalEditCampaign = ({
  campaign,
  onClose,
  onUpdated,
}: IModalEditCampaign) => {
  const { showToast } = useToast();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setSlug(campaign.slug);
    }
  }, [campaign]);

  const canSubmit =
    !!campaign &&
    name.trim().length > 0 &&
    SLUG_REGEX.test(slug.trim()) &&
    !submitting;

  const handleSubmit = React.useCallback(async () => {
    if (!campaign || !canSubmit) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaign.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });

      if (!response.ok) {
        showToast({
          variant: "error",
          message:
            response.status === 409
              ? "Esiste già una campagna con questo slug"
              : "Errore durante la modifica della campagna",
        });
        return;
      }

      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la modifica della campagna",
      });
    } finally {
      setSubmitting(false);
    }
  }, [campaign, canSubmit, name, slug, showToast, onUpdated, onClose]);

  return (
    <Modal
      open={!!campaign}
      onClose={onClose}
      title="Modifica campagna"
      contentClassName="gap-3"
      content={
        <div className="flex w-[420px] max-w-full flex-col gap-3">
          <FieldText
            label="Nome campagna"
            placeholder="Nome della campagna..."
            value={name}
            onChange={setName}
          />
          <FieldText
            label="Slug"
            placeholder="slug-campagna"
            value={slug}
            onChange={setSlug}
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <Btn
          variant="bold"
          label="Salva modifiche"
          disabled={!canSubmit}
          onClick={handleSubmit}
        />
      }
    />
  );
};

export default ModalEditCampaign;
