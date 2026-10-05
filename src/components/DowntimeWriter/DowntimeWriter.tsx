"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldText from "@/components/_core/FieldText";
import FieldRichText from "@/components/_core/FieldRichText";
import { useApiAction } from "@/hooks/useApiAction";
import { routes } from "@/app/routes";
import { FT_DOWNTIME } from "@/lib/features/featuresName";

export interface DowntimeTalentOption {
  id: number;
  name: string;
  description: string | null;
}

export interface DowntimeWriterProps {
  characterId: number;
  campaignSlug: string;
  downtimePoints: number;
  categories: string[];
  talents?: DowntimeTalentOption[];
}

// Valore sentinella per la voce "Uso talento" nel FieldSelect "Tipologia":
// mai inviato come `category` finale, sostituito dal nome del talento scelto
// prima dell'invio (stesso campo/pattern di lettura di `readCategory` in
// `downtime.repository.ts`, nessuna modifica lato schema/handler necessaria).
const TALENT_CATEGORY = "__talent__";

const DowntimeWriter = ({
  characterId,
  campaignSlug,
  downtimePoints,
  categories,
  talents = [],
}: DowntimeWriterProps) => {
  const router = useRouter();
  const { pending, run } = useApiAction();

  const [category, setCategory] = React.useState<string | undefined>();
  const [talentId, setTalentId] = React.useState<number | undefined>();
  const [subject, setSubject] = React.useState("");
  const [content, setContent] = React.useState("");

  const resourceExhausted = downtimePoints < 1;
  const usingTalent = category === TALENT_CATEGORY;
  const selectedTalent = talents.find(t => t.id === talentId);

  const categoryItems = [
    ...categories.map(c => ({ id: c, label: c })),
    ...(talents.length > 0
      ? [{ id: TALENT_CATEGORY, label: "Uso talento" }]
      : []),
  ];

  const canSubmit =
    !!category &&
    (!usingTalent || !!selectedTalent) &&
    subject.trim() !== "" &&
    content.trim() !== "";

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit || !category) return;
    const resolvedCategory = usingTalent ? selectedTalent?.name : category;
    if (!resolvedCategory) return;

    return run(
      `/api/campaigns/${campaignSlug}/characters/${characterId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          functionName: FT_DOWNTIME,
          actionData: {
            category: resolvedCategory,
            subject,
            description: content,
          },
        }),
      },
      {
        errorMessage: "Errore durante l'invio dell'azione",
        successMessage: "Azione inviata",
        onSuccess: () => {
          router.push(routes.campaignDowntime(campaignSlug));
          // invalida la router cache (staleTimes): la lista non è stantia
          router.refresh();
        },
      }
    );
  }, [
    campaignSlug,
    canSubmit,
    category,
    characterId,
    content,
    run,
    router,
    selectedTalent,
    subject,
    usingTalent,
  ]);

  return (
    <Card className="flex-col items-stretch gap-3 p-3">
      <FieldSelect
        label="Tipologia"
        labelMandatory
        placeholder={
          categoryItems.length > 0
            ? "Seleziona..."
            : "Nessuna tipologia di downtime attiva in questa campagna"
        }
        disabled={categoryItems.length === 0}
        value={category}
        items={categoryItems}
        onChange={value => {
          setCategory(value as string);
          setTalentId(undefined);
        }}
      />

      {usingTalent && (
        <>
          <FieldSelect
            label="Talento"
            labelMandatory
            placeholder="Seleziona il talento..."
            value={talentId}
            items={talents.map(t => ({ id: t.id, label: t.name }))}
            onChange={value => setTalentId(value as number)}
          />
          {selectedTalent && (
            <FieldText
              className="border-0"
              value={
                selectedTalent.description || "- Nessun contenuto disponibile -"
              }
              multiline
              disabled
            />
          )}
        </>
      )}

      {resourceExhausted ? (
        <Text
          className="text-muted-fg"
          children="Punti downtime esauriti: non puoi effettuare azioni downtime."
        />
      ) : (
        <>
          <FieldText
            label="Oggetto"
            labelMandatory
            value={subject}
            onChange={setSubject}
          />
          <FieldRichText
            label="Descrizione"
            labelMandatory
            placeholder="Descrivi cosa vuole fare il personaggio..."
            value={content}
            onChange={setContent}
            campaignSlug={campaignSlug}
          />
          <Btn
            className="text-center self-end w-[200px]"
            variant="bold"
            color="var(--succ)"
            icon="send"
            label="INVIA"
            labelPosition
            disabled={pending || !canSubmit}
            onClick={handleSubmit}
          />
        </>
      )}
    </Card>
  );
};

export default DowntimeWriter;
