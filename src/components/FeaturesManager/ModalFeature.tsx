"use client";

import * as React from "react";
import {
  buildFeatureDataPayload,
  buildInitialFormValues,
  isSimpleObjectSchema,
  isZodFlatten,
  mapFeatureErrorMessage,
  parseFeatureDataJson,
  stringifyFeatureData,
  type FeatureApiErrorBody,
  type FeatureFormValues,
  type FeatureObjectSchema,
} from "./features";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import Modal from "@/components/_core/Modal";
import { useToast } from "@/components/_core/Toast";
import type {
  FeatureTypeDto,
  FeatureWithTypeDto,
} from "@/lib/validations/feature";

// ── Form di attivazione/edit di una singola Feature ─────────────────────
// `featureType` è fisso per l'intera vita del modal (deciso dalla card da
// cui è stato aperto): non esiste un selettore di `FeatureType` qui dentro,
// coerente con `featureTypeId` immutabile in edit (T-019, `updateFeatureSchema`).

interface ModalFeatureProps {
  open: boolean;
  onClose: () => void;
  campaignSlug: string;
  featureType: FeatureTypeDto | null;
  /** `null` = mai configurata (POST); valorizzato = già esistente, attiva o
   * meno (PATCH) — vedi `isActive` per distinguere i due casi PATCH. */
  existingFeature: FeatureWithTypeDto | null;
  onSaved: () => void;
  /** Chiesta dal pulsante "DISATTIVA" qui dentro: la conferma vera e propria
   * resta centralizzata in `FeaturesManager` (stesso dialog per tutte le
   * feature), che chiude questa modale e apre quella di conferma. */
  onRequestDeactivate: (feature: FeatureWithTypeDto) => void;
}

const ModalFeature = ({
  open,
  onClose,
  campaignSlug,
  featureType,
  existingFeature,
  onSaved,
  onRequestDeactivate,
}: ModalFeatureProps) => {
  const isActive = !!existingFeature?.active;
  const { showToast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState<FeatureFormValues>({});
  const [rawJson, setRawJson] = React.useState("{}");
  const [rawJsonError, setRawJsonError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  const schema: FeatureObjectSchema | null = React.useMemo(() => {
    if (!featureType) return null;
    return isSimpleObjectSchema(featureType.featureSchema)
      ? featureType.featureSchema
      : null;
  }, [featureType]);
  const properties = React.useMemo(
    () => Object.entries(schema?.properties ?? {}),
    [schema]
  );

  React.useEffect(() => {
    if (!open || !featureType) return;
    const initialData = existingFeature?.featureData ?? {};
    if (schema) {
      setValues(buildInitialFormValues(schema, initialData));
    } else {
      setRawJson(stringifyFeatureData(initialData));
    }
    setRawJsonError(null);
    setFieldErrors({});
  }, [open, featureType, existingFeature, schema]);

  const handleSubmit = React.useCallback(async () => {
    if (!featureType) return;

    let featureData: unknown;
    if (schema) {
      featureData = buildFeatureDataPayload(schema, values);
    } else {
      const parsed = parseFeatureDataJson(rawJson);
      if (parsed.ok === false) {
        setRawJsonError(parsed.error);
        return;
      }
      featureData = parsed.data;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const url = existingFeature
        ? `/api/campaigns/${campaignSlug}/features/${existingFeature.id}`
        : `/api/campaigns/${campaignSlug}/features`;
      const response = await fetch(url, {
        method: existingFeature ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          existingFeature
            ? { featureData, ...(isActive ? {} : { active: true }) }
            : { featureTypeId: featureType.id, featureData }
        ),
      });

      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as FeatureApiErrorBody | null;
        if (isZodFlatten(json?.details)) {
          setFieldErrors(json.details.fieldErrors);
        }
        showToast({ variant: "error", message: mapFeatureErrorMessage(json) });
        return;
      }

      showToast({
        variant: "success",
        message: isActive ? "Feature aggiornata" : "Feature attivata",
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il salvataggio della feature",
      });
    } finally {
      setSaving(false);
    }
  }, [
    campaignSlug,
    existingFeature,
    featureType,
    isActive,
    onClose,
    onSaved,
    rawJson,
    schema,
    showToast,
    values,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        featureType
          ? `${isActive ? "Modifica" : "Attiva"}: ${featureType.featureName}`
          : ""
      }
      content={
        <div className="flex flex-col gap-4 sm:min-w-[320px]">
          {schema ? (
            properties.length === 0 ? (
              <Text
                className="text-muted-fg"
                children="Questa feature non richiede alcuna configurazione aggiuntiva."
              />
            ) : (
              properties.map(([key, prop]) => (
                <div key={key} className="flex flex-col gap-1">
                  {prop.type === "boolean" ? (
                    <BtnCheckbox
                      selected={!!values[key]}
                      label={prop.title ?? key}
                      onClick={selected =>
                        setValues(prev => ({ ...prev, [key]: selected }))
                      }
                    />
                  ) : (
                    <FieldText
                      label={prop.title ?? key}
                      labelMandatory={schema.required?.includes(key)}
                      inputType={
                        prop.type === "number" || prop.type === "integer"
                          ? "number"
                          : "text"
                      }
                      error={!!fieldErrors[key]?.length}
                      value={
                        typeof values[key] === "string"
                          ? (values[key] as string)
                          : ""
                      }
                      onChange={value =>
                        setValues(prev => ({ ...prev, [key]: value }))
                      }
                    />
                  )}
                  {fieldErrors[key]?.map(message => (
                    <Text
                      key={message}
                      size={0}
                      className="text-fail"
                      children={message}
                    />
                  ))}
                </div>
              ))
            )
          ) : (
            <div className="flex flex-col gap-1">
              <Text
                className="text-muted-fg"
                children="Configurazione avanzata (JSON): questa feature ha una struttura che l'editor guidato non supporta ancora."
              />
              <FieldText
                multiline
                error={!!rawJsonError}
                value={rawJson}
                onChange={value => {
                  setRawJson(value);
                  setRawJsonError(null);
                }}
              />
              {rawJsonError && (
                <Text size={0} className="text-fail" children={rawJsonError} />
              )}
            </div>
          )}
        </div>
      }
      actionsLoading={saving}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} disabled={saving} />
          {isActive && existingFeature && (
            <Btn
              label="DISATTIVA"
              color="var(--fail)"
              disabled={saving}
              onClick={() => {
                onClose();
                onRequestDeactivate(existingFeature);
              }}
            />
          )}
          <Btn
            color="var(--succ)"
            variant="bold"
            label={isActive ? "SALVA" : "ABILITA"}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalFeature;
