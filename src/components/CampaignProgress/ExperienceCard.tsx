"use client";

import * as React from "react";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import AvatarUser from "@/components/AvatarUser";
import Checkbox, { SelectType } from "@/components/_core/Checkbox";
import { useToast } from "@/components/_core/Toast";
import { ErrorCard } from "@/components/Feedback";
import Badge from "@/components/_core/Badge";
import {
  typeLabel,
  typeIcon,
  typeColor,
} from "@/components/BadgeCharacterType";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import { useQueryCampaignCharacters } from "@/lib/queries/campaignCharacters";
import HeroSection from "@/components/HeroSection";
import type { Character } from "@/lib/validations/character";
import Divider from "@/components/_core/Divider";
import BtnBase from "@/components/_core/BtnBase";

interface ApiErrorBody {
  error?: string;
}

type TypeFilter = "all" | Character["type"];

const TYPE_FILTER_ITEMS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "PG e PNG" },
  { id: "pg", label: "Solo PG" },
  { id: "png", label: "Solo PNG" },
];

// Aggiornamento bulk di XP (T-0xx): un unico importo (+ motivazione
// facoltativa) applicato ai personaggi con status attivo ("approved", PG o
// PNG) selezionati con la checkbox nella lista sottostante
// (`POST .../characters/xp-grant`, stesso filtro "attivo" applicato anche
// lato server).
const ExperienceCard = ({ campaignSlug }: { campaignSlug: string }) => {
  const { showToast } = useToast();

  const [amount, setAmount] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(
    () => new Set()
  );
  const [submitting, setSubmitting] = React.useState(false);

  const {
    data: characters,
    isLoading,
    error,
    refetch,
  } = useQueryCampaignCharacters(campaignSlug);

  // Solo personaggi con status attivo ("approved"): PG e PNG non ancora
  // approvati, parcheggiati o deceduti non sono selezionabili.
  const activeCharacters = React.useMemo(
    () =>
      (characters ?? [])
        .filter(c => getCharacterStatus(c) === "approved")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [characters]
  );

  const visibleCharacters = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCharacters.filter(c => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.userName ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeCharacters, search, typeFilter]);

  const allVisibleSelected =
    visibleCharacters.length > 0 &&
    visibleCharacters.every(c => selectedIds.has(c.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleCharacters.forEach(c => next.delete(c.id));
      } else {
        visibleCharacters.forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const toggleSelected = (characterId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  const parsedAmount = Number(amount.trim());
  const isAmountValid = Number.isInteger(parsedAmount) && parsedAmount !== 0;
  const canSubmit = isAmountValid && selectedIds.size > 0 && !submitting;

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/characters/xp-grant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parsedAmount,
            characterIds: Array.from(selectedIds),
            ...(note.trim() !== "" ? { note: note.trim() } : {}),
          }),
        }
      );

      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as ApiErrorBody | null;
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante l'aggiornamento degli XP",
        });
        return;
      }

      const json = await response.json();
      showToast({
        variant: "success",
        message: `XP aggiornati per ${json.updatedCount} personaggi`,
      });
      setSelectedIds(new Set());
      setNote("");
      refetch();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'aggiornamento degli XP",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    note,
    campaignSlug,
    parsedAmount,
    refetch,
    selectedIds,
    showToast,
  ]);

  return (
    <Card className="flex-col items-stretch gap-3 p-2">
      <HeroSection
        icon="stars"
        title="Esperienza"
        subtitle="Assegna XP ai personaggi della campagna"
      />
      <Text children="Imposta un importo di XP e una motivazione, poi seleziona dall'elenco qui sotto i personaggi a cui applicarli. Un valore positivo aggiunge XP, un valore negativo li rimuove. La motivazione comparirà nella cronologia XP di ogni personaggio coinvolto (es. nome evento, un bonus narrativo, una correzione). Puoi cercare per nome, filtrare per PG/PNG e selezionare tutti i personaggi visibili in un colpo solo." />
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <FieldText
          className="w-full sm:flex-1"
          label="Importo XP"
          labelMandatory
          inputType="number"
          icon="stars"
          error={amount.trim() !== "" && !isAmountValid}
          value={amount}
          onChange={setAmount}
        />
        <FieldText
          className="w-full sm:flex-[3]"
          icon="edit_note"
          label="Motivazione (opzionale)"
          placeholder="es. Nome dell'evento, artefatto magico, bonus pulizia location..."
          value={note}
          onChange={setNote}
        />
      </div>
      <Card className="flex flex-col w-full items-stretch">
        <div className="flex flex-wrap gap-3 items-center px-2 py-2">
          <BtnBase onClick={toggleSelectAllVisible}>
            <Checkbox type={SelectType.CHECK} selected={allVisibleSelected} />
          </BtnBase>
          <FieldText
            className="min-w-[200px] flex-[3]"
            icon="search"
            placeholder="Cerca per nome personaggio o giocatore..."
            disabled={isLoading || !!error}
            value={search}
            onChange={setSearch}
          />
          <FieldSelect
            className="min-w-[120px] flex-1"
            icon="filter_list"
            value={typeFilter}
            items={TYPE_FILTER_ITEMS}
            onChange={value => setTypeFilter(value as TypeFilter)}
            disabled={isLoading || !!error}
          />
        </div>

        <Divider />

        {error ? (
          <ErrorCard onRetry={() => refetch()} />
        ) : (
          <div className="w-full overflow-hidden max-h-[550px] overflow-scroll">
            {isLoading ? (
              <Text
                className="text-muted-fg p-4"
                children="Caricamento personaggi…"
              />
            ) : visibleCharacters.length === 0 ? (
              <Text
                className="text-muted-fg p-4"
                children="Nessun personaggio attivo trovato"
              />
            ) : (
              visibleCharacters.map(character => (
                <div
                  key={character.id}
                  role="presentation"
                  className="flex w-full cursor-pointer select-none items-center gap-3 p-2 text-left hover:bg-accent transition-colors"
                  onClick={() => toggleSelected(character.id)}
                >
                  <Checkbox
                    type={SelectType.CHECK}
                    selected={selectedIds.has(character.id)}
                  />
                  <AvatarUser
                    src={character.avatar ?? undefined}
                    text={character.name}
                  />
                  <div className="min-w-0 flex-1">
                    <Text weight="bolder" ellipsis children={character.name} />
                    <Text
                      size={0}
                      className="text-muted-fg"
                      ellipsis
                      children={character.userName}
                    />
                  </div>
                  <Badge
                    label={typeLabel(character.type)}
                    icon={typeIcon(character.type)}
                    color={typeColor(character.type)}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </Card>
      <div className="w-full flex items-center justify-between gap-3">
        <Text
          size={0}
          className="text-muted-fg ml-3"
          children={`${selectedIds.size} personaggi selezionati`}
        />
        <Btn
          className="text-center w-[200px]"
          variant="bold"
          icon="rocket_launch"
          label={submitting ? "Invio in corso…" : "INVIA"}
          labelPosition
          disabled={!canSubmit}
          onClick={handleSubmit}
        />
      </div>
    </Card>
  );
};

export default ExperienceCard;
