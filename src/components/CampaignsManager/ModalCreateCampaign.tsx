"use client";

import * as React from "react";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import { useToast } from "@/components/_core/Toast";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import type { Campaign } from "@/lib/validations/campaign";

// Slugify minimale, coerente con SLUG_REGEX di `validations/campaign.ts`
// (solo lettere minuscole, numeri e trattini singoli): normalizza gli
// accenti (NFD + strip diacritici) prima di sostituire ogni sequenza di
// caratteri non alfanumerici con un trattino.
const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

interface IModalCreateCampaign {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}

const ModalCreateCampaign = ({
  open,
  onClose,
  onCreated,
}: IModalCreateCampaign) => {
  const { showToast } = useToast();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  // Diventa `true` al primo edit manuale dello slug: da lì in poi lo slug
  // non segue più automaticamente il nome (pattern standard "slug touched").
  const slugTouched = React.useRef(false);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setName("");
    setSlug("");
    slugTouched.current = false;
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleChangeName = React.useCallback((value: string) => {
    setName(value);
    if (!slugTouched.current) {
      setSlug(slugify(value));
    }
  }, []);

  const handleChangeSlug = React.useCallback((value: string) => {
    slugTouched.current = true;
    setSlug(value);
  }, []);

  const canSubmit =
    name.trim().length > 0 && slug.trim().length > 0 && !submitting;

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          orgSlug: ARCANA_DOMINE_SLUG,
        }),
      });

      if (!response.ok) {
        showToast({
          variant: "error",
          message:
            response.status === 409
              ? "Esiste già una campagna con questo slug"
              : "Errore durante la creazione della campagna",
        });
        return;
      }

      const campaign = (await response.json()) as Campaign;
      onCreated(campaign);
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la creazione della campagna",
      });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, name, slug, showToast, onCreated, reset, onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nuova campagna"
      contentClassName="gap-3"
      content={
        <div className="flex w-[420px] max-w-full flex-col gap-3">
          <FieldText
            label="Nome campagna"
            placeholder="Nome della campagna..."
            value={name}
            onChange={handleChangeName}
          />
          <FieldText
            label="Slug"
            placeholder="slug-campagna"
            value={slug}
            onChange={handleChangeSlug}
          />
        </div>
      }
      actions={
        <Btn
          variant="bold"
          label="Crea campagna"
          disabled={!canSubmit}
          onClick={handleSubmit}
        />
      }
    />
  );
};

export default ModalCreateCampaign;
