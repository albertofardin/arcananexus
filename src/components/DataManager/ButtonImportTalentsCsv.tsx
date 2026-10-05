"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RequirementType } from "@prisma/client";
import type { ContentEntry } from "./types";
import {
  CSV_HEADERS,
  CSV_OPTIONAL_HEADERS,
  buildTalentsCsv,
  diffTalentsCsv,
  downloadCsv,
  parseTalentsCsv,
  type CatalogEntryRef,
  type ParsedTalentRow,
  type RequirementEdgeRef,
  type ResolvedRequirement,
  type TalentCsvDiff,
} from "./talentsCsv";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import InputFile from "@/components/_core/InputFile";
import { useToast } from "@/components/_core/Toast";
import { REQUIREMENT_TYPE_LABELS } from "@/lib/labels";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface IButtonImportTalentsCsv {
  campaignSlug: string;
  dataTypeId: number;
  entries: ContentEntry[];
  catalogEntries: CatalogEntryRef[];
  requirementEdges: RequirementEdgeRef[];
}

type Step = "select" | "preview";

function toReferenceDataBody(row: ParsedTalentRow) {
  return {
    description: row.description || null,
    visibility: row.visibility,
    flags: {
      cost: row.cost,
      repeatable: row.repeatable,
      creationOnly: row.creationOnly,
      isDowntimeUsable: row.isDowntimeUsable,
      isMissivePointBonus: row.isMissivePointBonus,
      isDowntimePointBonus: row.isDowntimePointBonus,
      ...(row.maxRepetitions !== undefined
        ? { maxRepetitions: row.maxRepetitions }
        : {}),
      ...(row.category ? { category: row.category } : {}),
    },
  };
}

function toRequirementBody(
  requiredDefinitionId: number,
  requirement: ResolvedRequirement
) {
  return {
    requiredDefinitionId,
    type: requirement.type,
    ...((requirement.type === "requires" ||
      requirement.type === "visibleWith") &&
    requirement.groupId != null
      ? { groupId: requirement.groupId }
      : {}),
  };
}

function formatRequirementChange({
  requiredName,
  type,
  groupId,
}: {
  requiredName: string;
  type: RequirementType;
  groupId: number | null;
}): string {
  const group = groupId != null ? ` (gruppo ${groupId})` : "";
  return `${REQUIREMENT_TYPE_LABELS[type]}: ${requiredName}${group}`;
}

const ButtonImportTalentsCsv = ({
  campaignSlug,
  dataTypeId,
  entries,
  catalogEntries,
  requirementEdges,
}: IButtonImportTalentsCsv) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("select");
  const [diff, setDiff] = React.useState<TalentCsvDiff | null>(null);
  const [parseErrors, setParseErrors] = React.useState<string[]>([]);
  const [applying, setApplying] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const isMobile = useIsMobile();

  const reset = () => {
    setStep("select");
    setDiff(null);
    setParseErrors([]);
  };

  const handleClose = () => {
    if (applying) return;
    setOpen(false);
    reset();
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { rows, errors } = parseTalentsCsv(text);
    setParseErrors(errors);
    if (rows.length === 0) {
      showToast({
        variant: "error",
        message: "Nessuna riga valida trovata nel file CSV",
      });
      return;
    }
    setDiff(diffTalentsCsv(rows, entries, catalogEntries, requirementEdges));
    setStep("preview");
  };

  const handleConfirm = async () => {
    if (!diff) return;
    setApplying(true);
    try {
      let failed = 0;
      // Nomi creati in questa stessa importazione (minuscolo) → id reale:
      // serve a risolvere i requisiti "pending" (`requiredDefinitionId:
      // null`) che puntano a un talento creato da un'altra riga dello
      // stesso CSV, non ancora nel catalogo al momento del diff.
      const createdIdByName = new Map<string, number>();

      const applyRequirement = async (
        referenceDataId: number,
        requirement: ResolvedRequirement
      ) => {
        const requiredDefinitionId =
          requirement.requiredDefinitionId ??
          createdIdByName.get(requirement.requiredName.trim().toLowerCase());
        if (requiredDefinitionId === undefined) {
          failed++;
          return;
        }
        const response = await fetch(
          `/api/campaigns/${campaignSlug}/reference-data/${referenceDataId}/requirements`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              toRequirementBody(requiredDefinitionId, requirement)
            ),
          }
        );
        if (!response.ok) failed++;
      };

      // Fase 1: crea tutte le voci nuove prima di aggiungere requisiti, così
      // un talento che ne "richiede" un altro creato nella stessa importazione
      // trova già il suo id reale in `createdIdByName` in fase 2.
      const createdEntries: {
        id: number;
        requirementsToAdd: ResolvedRequirement[];
      }[] = [];
      for (const { row, requirementsToAdd } of diff.toCreate) {
        const response = await fetch(
          `/api/campaigns/${campaignSlug}/reference-data`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataTypeId,
              name: row.name,
              ...toReferenceDataBody(row),
            }),
          }
        );
        if (!response.ok) {
          failed++;
          continue;
        }
        const created = await response.json();
        createdIdByName.set(row.name.trim().toLowerCase(), created.id);
        createdEntries.push({ id: created.id, requirementsToAdd });
      }

      // Fase 2: ora che tutte le voci nuove esistono, applica i requisiti.
      for (const { id, requirementsToAdd } of createdEntries) {
        for (const requirement of requirementsToAdd) {
          await applyRequirement(id, requirement);
        }
      }

      for (const {
        row,
        existing,
        changes,
        requirementChanges,
      } of diff.toUpdate) {
        if (changes.length > 0) {
          const response = await fetch(
            `/api/campaigns/${campaignSlug}/reference-data/${existing.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(toReferenceDataBody(row)),
            }
          );
          if (!response.ok) failed++;
        }
        for (const removal of requirementChanges.toRemove) {
          const response = await fetch(
            `/api/campaigns/${campaignSlug}/reference-data/${existing.id}/requirements/${removal.id}`,
            { method: "DELETE" }
          );
          if (!response.ok) failed++;
        }
        for (const requirement of requirementChanges.toAdd) {
          await applyRequirement(existing.id, requirement);
        }
      }

      showToast(
        failed > 0
          ? {
              variant: "error",
              message: `${failed} operazioni non riuscite durante l'importazione`,
            }
          : {
              variant: "success",
              message: `Importazione completata: ${diff.toCreate.length} create, ${diff.toUpdate.length} aggiornate`,
            }
      );
      router.refresh();
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
      showToast({ variant: "error", message: "Errore durante l'importazione" });
    } finally {
      setApplying(false);
    }
  };

  const totalChanges = diff ? diff.toCreate.length + diff.toUpdate.length : 0;
  const allErrors = diff ? [...parseErrors, ...diff.errors] : parseErrors;

  return (
    <>
      <Btn
        icon="upload_file"
        label="Importa CSV"
        onClick={() => setOpen(true)}
      />
      <Modal
        open={open}
        onClose={handleClose}
        title="Importa talenti"
        fullscreen={isMobile}
        content={
          <div className="flex w-[480px] max-w-full flex-col gap-4">
            {step === "select" ? (
              <>
                <Text
                  className="text-muted-fg"
                  children="Le voci con lo stesso nome di un talento esistente verranno aggiornate, le altre create come nuove. Nessuna modifica viene applicata finché non confermi."
                />
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFile(file);
                  }}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragging
                      ? "border-primary bg-muted-bg"
                      : "border-border hover:border-primary hover:bg-muted-bg"
                  )}
                >
                  <Icon
                    size="lg"
                    className="text-primary"
                    children="upload_file"
                  />
                  <Text weight="bolder" children="Trascina qui il file CSV" />
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children="oppure clicca per sceglierlo"
                  />
                  <InputFile
                    acceptFiles=".csv,text/csv"
                    onChangeInput={e => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Text
                      size={0}
                      weight="bolder"
                      className="uppercase tracking-wide text-muted-fg"
                      children="Colonne attese"
                    />
                    <Btn
                      icon="download"
                      label="Scarica template"
                      labelSize={0}
                      onClick={() =>
                        downloadCsv("template-talenti.csv", buildTalentsCsv([]))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CSV_HEADERS.map(column => (
                      <ColumnChip
                        key={column}
                        label={column}
                        optional={CSV_OPTIONAL_HEADERS.has(column)}
                      />
                    ))}
                  </div>
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={`Nelle colonne "Regola" scrivi i nomi delle voci collegate, separati da ";". Le colonne tratteggiate sono facoltative: se una manca dal file, le regole esistenti di quel tipo restano invariate; se c'è ma è vuota, vengono rimosse.`}
                  />
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children='Gruppo OR (solo "Regola: Richiede" e "Regola: Visibile con"): aggiungi "(gruppo N)" alle voci alternative, es. "Umano (gruppo 1); Elfo (gruppo 1)" vuol dire che basta una delle due.'
                  />
                </div>
                <ErrorBox errors={parseErrors} />
              </>
            ) : (
              diff && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile
                      icon="add_circle"
                      color="var(--succ)"
                      value={diff.toCreate.length}
                      label="Da creare"
                    />
                    <StatTile
                      icon="edit"
                      color="var(--primary)"
                      value={diff.toUpdate.length}
                      label="Da aggiornare"
                    />
                  </div>
                  <ErrorBox errors={allErrors} />
                  {totalChanges === 0 ? (
                    <Text
                      className="py-4 text-center text-muted-fg"
                      children="Il file non contiene modifiche rispetto ai talenti attuali."
                    />
                  ) : (
                    <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
                      {diff.toCreate.length > 0 && (
                        <Section title="Nuovi talenti">
                          {diff.toCreate.map(({ row, requirementsToAdd }) => (
                            <ChangeCard
                              key={row.name}
                              name={row.name}
                              color="var(--succ)"
                              icon="add"
                            >
                              {requirementsToAdd.map((requirement, index) => (
                                <ChangeLine
                                  key={index}
                                  kind="add"
                                  children={formatRequirementChange(
                                    requirement
                                  )}
                                />
                              ))}
                            </ChangeCard>
                          ))}
                        </Section>
                      )}
                      {diff.toUpdate.length > 0 && (
                        <Section title="Talenti modificati">
                          {diff.toUpdate.map(
                            ({ row, changes, requirementChanges }) => (
                              <ChangeCard
                                key={row.name}
                                name={row.name}
                                color="var(--primary)"
                                icon="edit"
                              >
                                {changes.map((change, index) => (
                                  <div
                                    key={`f-${index}`}
                                    className="flex flex-wrap items-baseline gap-x-1.5"
                                  >
                                    <Text
                                      size={0}
                                      className="text-muted-fg"
                                      children={`${change.label}:`}
                                    />
                                    <Text
                                      size={0}
                                      className="text-muted-fg line-through"
                                      children={change.from || "—"}
                                    />
                                    <Icon
                                      size="sm"
                                      className="text-muted-fg"
                                      children="arrow_forward"
                                    />
                                    <Text
                                      size={0}
                                      children={change.to || "—"}
                                    />
                                  </div>
                                ))}
                                {requirementChanges.toAdd.map(
                                  (requirement, index) => (
                                    <ChangeLine
                                      key={`a-${index}`}
                                      kind="add"
                                      children={formatRequirementChange(
                                        requirement
                                      )}
                                    />
                                  )
                                )}
                                {requirementChanges.toRemove.map(
                                  (removal, index) => (
                                    <ChangeLine
                                      key={`r-${index}`}
                                      kind="remove"
                                      children={formatRequirementChange(
                                        removal
                                      )}
                                    />
                                  )
                                )}
                              </ChangeCard>
                            )
                          )}
                        </Section>
                      )}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        }
        actionsLoading={applying}
        actions={
          <>
            <Btn label="ANNULLA" onClick={handleClose} />
            <div className="flex-1" />
            {step === "preview" && (
              <>
                <Btn icon="arrow_back" label="CAMBIA FILE" onClick={reset} />
                <Btn
                  variant="bold"
                  color="var(--succ)"
                  label="CONFERMA IMPORTAZIONE"
                  disabled={totalChanges === 0}
                  onClick={handleConfirm}
                />
              </>
            )}
          </>
        }
      />
    </>
  );
};

const tint = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const ColumnChip = ({
  label,
  optional,
}: {
  label: string;
  optional?: boolean;
}) => (
  <span
    className={cn(
      "rounded border px-1.5 py-0.5 text-xs",
      optional
        ? "border-dashed border-border text-muted-fg"
        : "border-border bg-muted-bg text-fg"
    )}
  >
    {label}
  </span>
);

const ErrorBox = ({ errors }: { errors: string[] }) =>
  errors.length === 0 ? null : (
    <div
      className="flex gap-2 rounded-lg border p-3"
      style={{
        borderColor: tint("var(--fail)", 40),
        background: tint("var(--fail)", 8),
      }}
    >
      <Icon className="text-fail" children="warning" />
      <div className="flex min-w-0 flex-col gap-1">
        <Text weight="bolder" className="text-fail" children="Attenzione" />
        {errors.map((error, index) => (
          <Text key={index} size={0} className="text-fail" children={error} />
        ))}
      </div>
    </div>
  );

const StatTile = ({
  icon,
  color,
  value,
  label,
}: {
  icon: string;
  color: string;
  value: number;
  label: string;
}) => (
  <div
    className="flex items-center gap-3 rounded-lg p-3"
    style={{ background: tint(color, 10) }}
  >
    <Icon size="lg" style={{ color }} children={icon} />
    <div className="flex flex-col">
      <span className="text-2xl font-bold leading-none" style={{ color }}>
        {value}
      </span>
      <Text size={0} className="text-muted-fg" children={label} />
    </div>
  </div>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <Text
      size={0}
      weight="bolder"
      className="uppercase tracking-wide text-muted-fg"
      children={title}
    />
    {children}
  </div>
);

const ChangeCard = ({
  name,
  color,
  icon,
  children,
}: {
  name: string;
  color: string;
  icon: string;
  children: React.ReactNode;
}) => (
  <div
    className="flex flex-col gap-1 rounded-md border border-l-4 border-border bg-card px-3 py-2"
    style={{ borderLeftColor: color }}
  >
    <div className="flex items-center gap-1.5">
      <Icon size="sm" style={{ color }} children={icon} />
      <Text weight="bolder" children={name} />
    </div>
    {React.Children.count(children) > 0 && (
      <div className="flex flex-col gap-0.5 pl-5">{children}</div>
    )}
  </div>
);

const ChangeLine = ({
  kind,
  children,
}: {
  kind: "add" | "remove";
  children: string;
}) => (
  <div className="flex items-center gap-1.5">
    <Icon
      size="sm"
      className={kind === "add" ? "text-succ" : "text-fail"}
      children={kind === "add" ? "add" : "remove"}
    />
    <Text
      size={0}
      className={kind === "remove" ? "text-muted-fg line-through" : undefined}
      children={children}
    />
  </div>
);

export default ButtonImportTalentsCsv;
