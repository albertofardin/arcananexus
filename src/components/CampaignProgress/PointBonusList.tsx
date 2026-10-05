"use client";

import * as React from "react";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import Badge from "@/components/_core/Badge";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useToast } from "@/components/_core/Toast";
import AvatarUser from "@/components/AvatarUser";
import { useQueryCampaignCharacters } from "@/lib/queries/campaignCharacters";
import { pointBonusSchema, type PointBonus } from "@/lib/features/pointBonus";
import type { FeatureWithTypeDto } from "@/lib/validations/feature";

// Bonus/malus di punti per singolo personaggio, salvati in
// `featureData.pointBonuses` della feature (Missive o Downtime) con un PATCH
// che rimanda l'intero `featureData` (il server lo ri-valida). Si applicano
// al massimale del personaggio, quindi al prossimo "Reset punti".
const PointBonusList = ({
  campaignSlug,
  feature,
  onChanged,
}: {
  campaignSlug: string;
  feature: FeatureWithTypeDto;
  onChanged: () => void;
}) => {
  const { showToast } = useToast();
  const { data: characters = [] } = useQueryCampaignCharacters(campaignSlug);
  const featureData = (feature.featureData ?? {}) as Record<string, unknown>;
  const bonuses = React.useMemo(() => {
    const parsed = pointBonusSchema.array().safeParse(featureData.pointBonuses);
    return parsed.success ? parsed.data : [];
  }, [featureData.pointBonuses]);

  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [characterId, setCharacterId] = React.useState<number | undefined>();
  const [points, setPoints] = React.useState("");
  const [reason, setReason] = React.useState("");

  const save = async (next: PointBonus[]) => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/features/${feature.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            featureData: { ...featureData, pointBonuses: next },
          }),
        }
      );
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante il salvataggio",
        });
        return false;
      }
      onChanged();
      return true;
    } catch (err) {
      console.error(err);
      showToast({ variant: "error", message: "Errore durante il salvataggio" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const candidate = pointBonusSchema.safeParse({
    characterId,
    points: Number(points),
    reason,
  });

  const handleAdd = async () => {
    if (!candidate.success) return;
    if (await save([...bonuses, candidate.data])) {
      setAdding(false);
      setCharacterId(undefined);
      setPoints("");
      setReason("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Text weight="bolder" className="flex-1" children="Bonus e malus" />
        <Btn
          small
          icon="add"
          label="Aggiungi"
          onClick={() => setAdding(true)}
        />
      </div>

      {bonuses.length === 0 && (
        <Text
          size={0}
          className="text-muted-fg"
          children="Nessun bonus o malus configurato"
        />
      )}
      {bonuses.map((b, i) => {
        const character = characters.find(c => c.id === b.characterId);
        return (
          <div key={i} className="flex items-center gap-2">
            <AvatarUser
              src={character?.avatar ?? undefined}
              text={character?.name ?? "?"}
            />
            <div className="min-w-0 flex-1">
              <Text
                weight="bolder"
                ellipsis
                children={`${character?.name ?? `Personaggio #${b.characterId}`}${character?.userName ? ` (${character.userName})` : ""}`}
              />
              <Text size={0} className="text-muted-fg" children={b.reason} />
            </div>
            <Badge
              color={b.points > 0 ? "var(--succ)" : "var(--fail)"}
              label={`${b.points > 0 ? "+" : ""}${b.points}`}
            />
            <Btn
              small
              icon="delete"
              disabled={saving}
              onClick={() => save(bonuses.filter((_, j) => j !== i))}
            />
          </div>
        );
      })}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Aggiungi bonus/malus"
        content={
          <div className="flex flex-col gap-3">
            <FieldSelect
              label="Personaggio"
              value={characterId}
              onChange={v => setCharacterId(Number(v))}
              items={characters.map(c => ({
                id: c.id,
                label: c.name,
                subLabel: c.userName,
                avatar: c.avatar ?? undefined,
                avatarText: c.name,
              }))}
            />
            <FieldText
              label="Punti (negativi per un malus)"
              inputType="number"
              value={points}
              onChange={setPoints}
            />
            <FieldText
              label="Motivazione"
              value={reason}
              onChange={setReason}
            />
          </div>
        }
        actionsLoading={saving}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setAdding(false)} />
            <Btn
              variant="bold"
              label="AGGIUNGI"
              disabled={!candidate.success}
              onClick={handleAdd}
            />
          </>
        }
      />
    </div>
  );
};

export default PointBonusList;
