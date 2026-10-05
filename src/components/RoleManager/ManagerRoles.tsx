"use client";

import * as React from "react";
import { Role as PrismaRole } from "@prisma/client";
import Avatar from "../_core/Avatar";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Btn from "@/components/_core/Btn";
import AvatarUser from "@/components/AvatarUser";
import Modal from "@/components/_core/Modal";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useToast } from "@/components/_core/Toast";
import SaveBar from "@/components/SaveBar";
import { cn } from "@/lib/utils";
import Toolbar from "@/components/_core/Toolbar";
import BtnCampaign from "@/components/BtnCampaign";
import type { Campaign } from "@/lib/validations/campaign";
import { useIsMobile } from "@/hooks/use-mobile";

export interface Role {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface Assignment {
  userId: string;
  roleId: string;
}

export interface MockCampaign {
  id: string;
  name: string;
  slug: string;
  campaign: Campaign;
  assignments: Assignment[];
}

// Un "gruppo flat" è uno scope organizzativo con appartenenza semplice
// (dentro o fuori, nessun ruolo interno da scegliere): il Direttivo e, allo
// stesso modo, Sviluppo Web. `FLAT_GROUPS` ne fissa l'ordine di
// visualizzazione — chi chiama passa via `flatGroups` quali di questi
// gruppi mostrare e i loro membri attuali (vedi ManagerRolesAdmin).
interface FlatGroupDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  // Cosa comporta l'appartenenza al gruppo: mostrata nella "Legenda gruppi"
  // (vedi più sotto), stesso posto in cui i ruoli di campagna spiegano i
  // loro poteri.
  description: string;
  // Il gruppo è visibile in UI (per farne discutere il team) ma non ancora
  // collegato a un backend reale: niente membri, niente editing, un
  // pannello "in arrivo" al posto della gestione normale.
  comingSoon?: boolean;
}

export interface FlatGroupMembers {
  id: string;
  memberIds: string[];
  // Un gruppo flat visibile ma non editabile da chi guarda (default `true`):
  // niente pulsante "Aggiungi membro" né rimozione, solo consultazione. Usato
  // per "Sviluppo Web", visibile a chi ha accesso ad Amministrazione ma
  // gestibile solo da chi è effettivamente Sviluppo Web (vedi
  // ManagerRolesAdmin).
  editable?: boolean;
  // Membri di questo gruppo che non possono essere rimossi, anche quando il
  // gruppo è editabile (`editable: true`): mostra comunque il pulsante di
  // rimozione, ma disabilitato. Usato per le email cablate di Sviluppo Web
  // (`HARDCODED_SVILUPPO_EMAILS`), che non sono mai rimovibili dal gruppo.
  nonRemovableUserIds?: string[];
}

// Esportati perché le pagine chiamanti devono riconoscere questi scope
// quando calcolano il diff da inviare alle API (vedi rolesAssignmentsSync.ts).
export const DIRETTIVO_ID = "direttivo";
export const SVILUPPO_ID = "sviluppo";

const FLAT_GROUPS: FlatGroupDef[] = [
  {
    id: DIRETTIVO_ID,
    name: "Direttivo",
    icon: "account_balance",
    color: "#7c38ca",
    description:
      "Accede a tutte le pagine di Amministrazione dell'Associazione in modalità sola lettura.",
  },
  {
    id: SVILUPPO_ID,
    name: "Sviluppo Web",
    icon: "important_devices",
    color: "#ff7504",
    description:
      "Accede a tutte le pagine di Amministrazione dell'Associazione in modalità editing. Inoltre può modificare i ruoli di tutti gli utenti ed usare l'impersonazione.",
  },
];
const FLAT_GROUPS_BY_ID: Record<string, FlatGroupDef> = Object.fromEntries(
  FLAT_GROUPS.map(g => [g.id, g])
);

// Permesso dell'utente corrente sugli scope campagna (i gruppi flat hanno una
// propria regola indipendente, vedi `isFlatGroup` più sotto):
// - "full": nessuna restrizione (Sviluppo Web nella vista "god view" di
//   Amministrazione, o head_master nella pagina staff della propria
//   campagna);
// - "head_master": può gestire chiunque e qualunque ruolo, ma deve restare
//   sempre almeno un head_master nella campagna;
// - "readonly": può solo vedere (master e supporter, nessuna distinzione, o
//   un direttivo non-sviluppo nella vista "god view" di Amministrazione).
export type EditMode = "full" | "head_master" | "readonly";

interface IManagerRoles {
  campaigns: MockCampaign[];
  users: MockUser[];
  roles: Role[];
  flatGroups?: FlatGroupMembers[];
  editMode?: EditMode;
  onSave: (assignmentsByScope: Record<string, Assignment[]>) => Promise<void>;
  // Scope selezionato in modalità controllata: chi chiama tiene questo stato
  // fuori da ManagerRoles perché quest'ultimo può essere rimontato (es. via
  // `key`) per risincronizzarsi con dati freschi dopo un salvataggio — senza
  // sollevare la selezione, il remount la resetterebbe sempre al primo
  // gruppo flat (Direttivo). Se omesso, lo stato resta interno (non
  // controllato), utile ai chiamanti con un solo scope.
  scopeId?: string;
  onChangeScopeId?: (id: string) => void;
}

const MAX_VISIBLE_USERS = 20;

// Da mobile (< lg) gli scope sono tile verticali in uno strip a scorrimento
// orizzontale; da desktop righe di una lista verticale.
const SCOPE_ITEM_CLASS =
  "flex shrink-0 snap-start flex-col items-start gap-1.5 rounded border border-transparent p-1.5 text-left hover:bg-accent w-[102px] lg:w-full lg:flex-row lg:items-center lg:gap-3 lg:p-1 lg:pr-3";
const SCOPE_ITEM_ACTIVE_CLASS =
  "border-primary bg-[var(--bg)] max-lg:shadow-sm lg:border-transparent";

const BtnFlatGroup = ({
  group,
  size,
}: {
  group: FlatGroupDef;
  size: [number, number];
}) => (
  <div
    style={{
      width: size[0],
      height: size[1],
      backgroundColor: `color-mix(in srgb, ${group.color} 15%, var(--bg))`,
    }}
    className="flex rounded justify-center items-center border border-white"
  >
    <Icon style={{ color: group.color, fontSize: 24 }} children={group.icon} />
  </div>
);

// Sostantivo per i membri di uno scope: nei gruppi flat si parla di
// "membro/membri", nelle campagne di "staffer".
const memberNoun = (isFlatGroup: boolean, count: number) =>
  isFlatGroup ? (count === 1 ? "membro" : "membri") : "staffer";

const ManagerRoles = ({
  campaigns,
  users,
  roles,
  flatGroups = [],
  editMode = "full",
  onSave,
  scopeId,
  onChangeScopeId,
}: IManagerRoles) => {
  const defaultRoleId = roles[roles.length - 1]?.id ?? "";
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  // I gruppi flat effettivamente passati da chi chiama, più quelli
  // "in arrivo" (visibili in anteprima anche senza dati reali, ma solo dove
  // il concetto di gruppo flat esiste già — non nella pagina campagna, che
  // non passa mai `flatGroups`), nell'ordine canonico di `FLAT_GROUPS`
  // (Direttivo, poi Sviluppo Web) indipendentemente dall'ordine di
  // `flatGroups`.
  const visibleFlatGroups =
    flatGroups.length === 0
      ? []
      : FLAT_GROUPS.filter(
          g => g.comingSoon || flatGroups.some(fg => fg.id === g.id)
        );

  const buildInitial = (): Record<string, Assignment[]> => ({
    ...Object.fromEntries(
      flatGroups.map(g => [
        g.id,
        g.memberIds.map(userId => ({ userId, roleId: g.id })),
      ])
    ),
    ...Object.fromEntries(campaigns.map(c => [c.id, [...c.assignments]])),
  });

  // Stato corrente e ultimo stato salvato: il confronto determina il "dirty".
  const [assignmentsByScope, setAssignmentsByScope] =
    React.useState<Record<string, Assignment[]>>(buildInitial);
  const [savedSnapshot, setSavedSnapshot] =
    React.useState<Record<string, Assignment[]>>(buildInitial);

  // Il primo gruppo flat (Direttivo, se presente) è preselezionato — livello
  // più alto della gerarchia; altrimenti si parte dalla prima campagna.
  // Non usato quando `controlledSelectedScopeId` è fornito (vedi IManagerRoles).
  const [internalSelectedScopeId, setInternalSelectedScopeId] = React.useState(
    () =>
      visibleFlatGroups.length > 0
        ? visibleFlatGroups[0].id
        : (campaigns[0]?.id ?? "")
  );
  const selectedScopeId = scopeId ?? internalSelectedScopeId;
  const setSelectedScopeId = onChangeScopeId ?? setInternalSelectedScopeId;
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [legendOpen, setLegendOpen] = React.useState(false);

  const dirty = React.useMemo(
    () => JSON.stringify(assignmentsByScope) !== JSON.stringify(savedSnapshot),
    [assignmentsByScope, savedSnapshot]
  );

  const selectedFlatGroup = FLAT_GROUPS_BY_ID[selectedScopeId];
  const isFlatGroup = selectedFlatGroup !== undefined;
  const isComingSoon = !!selectedFlatGroup?.comingSoon;

  // I gruppi flat hanno una regola di permesso indipendente (vedi
  // ManagerRolesAdmin); `mode` riguarda solo gli scope campagna. Un gruppo
  // "in arrivo" non è mai editabile, a prescindere: non c'è ancora un
  // backend a cui salvare. `editable` (dal `flatGroups` prop, default
  // `true`) permette invece di mostrare un gruppo in sola lettura a chi non
  // ha i permessi per modificarlo (es. "Sviluppo Web" per un direttivo
  // non-sviluppo).
  const isHeadMasterScope = !isFlatGroup && editMode === "head_master";
  const selectedFlatGroupMembers = flatGroups.find(
    fg => fg.id === selectedScopeId
  );
  const isEditableFlatGroup = selectedFlatGroupMembers?.editable ?? true;
  const nonRemovableUserIds = selectedFlatGroupMembers?.nonRemovableUserIds;
  const canAddMembers =
    (isFlatGroup && !isComingSoon && isEditableFlatGroup) ||
    (!isFlatGroup && editMode !== "readonly");

  const usersById = React.useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u])),
    [users]
  );
  const rolesById = React.useMemo(
    () => Object.fromEntries(roles.map(r => [r.id, r])),
    [roles]
  );
  const roleItems = React.useMemo(
    () =>
      roles.map(r => ({
        id: r.id,
        label: r.name,
        icon: r.icon,
        iconStyle: { color: r.color },
        color: r.color,
      })),
    [roles]
  );

  const selectedCampaign = campaigns.find(c => c.id === selectedScopeId);
  const selectedName = isFlatGroup
    ? selectedFlatGroup.name
    : (selectedCampaign?.name ?? "Seleziona una campagna");
  const assignments = React.useMemo(
    () => assignmentsByScope[selectedScopeId] ?? [],
    [assignmentsByScope, selectedScopeId]
  );

  // Head master presenti nello scope corrente (stato in editing, non ancora
  // salvato): serve a bloccare la retrocessione/rimozione dell'ultimo
  // head_master rimasto, così l'invariante "ce n'è sempre uno" vale già in
  // UI, prima ancora del controllo lato server.
  const headMasterCountInScope = React.useMemo(
    () =>
      isFlatGroup
        ? 0
        : assignments.filter(a => a.roleId === PrismaRole.head_master).length,
    [isFlatGroup, assignments]
  );

  const isRowLocked = React.useCallback(
    (roleId: string) => {
      if (isFlatGroup) return false;
      if (editMode === "readonly") return true;
      if (isHeadMasterScope) {
        return roleId === PrismaRole.head_master && headMasterCountInScope <= 1;
      }
      return false;
    },
    [isFlatGroup, editMode, isHeadMasterScope, headMasterCountInScope]
  );

  const setRole = React.useCallback(
    (userId: string, roleId: string) => {
      setAssignmentsByScope(prev => ({
        ...prev,
        [selectedScopeId]: (prev[selectedScopeId] ?? []).map(a =>
          a.userId === userId ? { ...a, roleId } : a
        ),
      }));
    },
    [selectedScopeId]
  );

  const addUser = React.useCallback(
    (userId: string) => {
      setAssignmentsByScope(prev => {
        const current = prev[selectedScopeId] ?? [];
        if (current.some(a => a.userId === userId)) return prev;
        // Nei gruppi flat il ruolo è fisso (l'id del gruppo stesso); nelle
        // campagne parte dal default.
        const roleId = isFlatGroup ? selectedScopeId : defaultRoleId;
        return {
          ...prev,
          [selectedScopeId]: [...current, { userId, roleId }],
        };
      });
    },
    [selectedScopeId, isFlatGroup, defaultRoleId]
  );

  const removeUser = React.useCallback(
    (userId: string) => {
      setAssignmentsByScope(prev => ({
        ...prev,
        [selectedScopeId]: (prev[selectedScopeId] ?? []).filter(
          a => a.userId !== userId
        ),
      }));
    },
    [selectedScopeId]
  );

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      await onSave(assignmentsByScope);

      setSavedSnapshot(assignmentsByScope);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      showToast({
        variant: "success",
        message: "Modifiche salvate con successo",
      });
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il salvataggio",
      });
    } finally {
      setSaving(false);
    }
  }, [assignmentsByScope, onSave, showToast]);

  const handleDiscard = React.useCallback(() => {
    setAssignmentsByScope(savedSnapshot);
  }, [savedSnapshot]);

  // Utenti non ancora associati allo scope selezionato, filtrati dalla ricerca.
  const availableUsers = React.useMemo(() => {
    const assignedIds = new Set(assignments.map(a => a.userId));
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (assignedIds.has(u.id)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    });
  }, [users, assignments, search]);

  // Con molti utenti (centinaia) la lista va limitata: mostriamo solo i primi
  // risultati e invitiamo a restringere la ricerca per trovare gli altri.
  const visibleUsers = availableUsers.slice(0, MAX_VISIBLE_USERS);
  const hiddenUsersCount = availableUsers.length - visibleUsers.length;

  const memberCount = assignments.length;
  const totalScopes = visibleFlatGroups.length + campaigns.length;

  return (
    <>
      <div
        className={cn(
          "min-h-0 flex-1 grid grid-cols-1 gap-2 lg:grid-rows-1",
          totalScopes > 1 ? "lg:grid-cols-[320px_1fr]" : "lg:grid-cols-1"
        )}
      >
        {/* Colonna sinistra: scelta dello scope (gruppo flat o campagna) */}
        {totalScopes <= 1 ? null : (
          <Card className="min-h-0 flex-col items-stretch overflow-hidden p-0">
            <Toolbar className="py-8 pr-2 max-lg:hidden">
              <div className="min-w-0 flex-1">
                <Text size={2} weight="bolder" ellipsis children="Gruppi" />
                <Text
                  size={0}
                  className="text-muted-fg"
                  ellipsis
                  children="Seleziona il gruppo"
                />
              </div>
            </Toolbar>
            <Divider className="max-lg:hidden" />
            <div className="flex min-h-0 flex-1 snap-x gap-0.5 overflow-x-auto p-2 lg:snap-none lg:flex-col lg:gap-0 lg:overflow-x-visible lg:overflow-y-auto lg:pb-28">
              {visibleFlatGroups.map(group => {
                const count = (assignmentsByScope[group.id] ?? []).length;
                const active = group.id === selectedScopeId;
                return (
                  <React.Fragment key={group.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedScopeId(group.id)}
                      className={cn(
                        SCOPE_ITEM_CLASS,
                        active && SCOPE_ITEM_ACTIVE_CLASS
                      )}
                    >
                      <BtnFlatGroup group={group} size={[90, 50]} />
                      <div className="w-full min-w-0 lg:w-auto lg:flex-1">
                        <Text
                          weight={active ? "bolder" : "regular"}
                          ellipsis
                          className={cn(active && "text-primary")}
                          children={group.name}
                        />
                        <Text
                          size={0}
                          className="text-muted-fg"
                          ellipsis
                          children={
                            group.comingSoon
                              ? "Presto disponibile"
                              : `${count} ${memberNoun(true, count)}`
                          }
                        />
                      </div>
                      <Icon
                        className={cn(
                          "max-lg:hidden",
                          active ? "text-primary" : "text-muted-fg"
                        )}
                        children="chevron_right"
                      />
                    </button>
                    <Divider className="last:hidden mx-2 max-lg:hidden" />
                  </React.Fragment>
                );
              })}
              {campaigns.map(campaign => {
                const count = (assignmentsByScope[campaign.id] ?? []).length;
                const active = campaign.id === selectedScopeId;
                return (
                  <React.Fragment key={campaign.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedScopeId(campaign.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedScopeId(campaign.id);
                        }
                      }}
                      className={cn(
                        SCOPE_ITEM_CLASS,
                        active && SCOPE_ITEM_ACTIVE_CLASS
                      )}
                    >
                      <BtnCampaign
                        size={[90, 50]}
                        camps={[campaign.campaign]}
                        slcCamp={campaign.campaign}
                      />
                      <div className="w-full min-w-0 lg:w-auto lg:flex-1">
                        <Text
                          weight={active ? "bolder" : "regular"}
                          ellipsis
                          className={cn(active && "text-primary")}
                          children={campaign.name}
                        />
                        <Text
                          size={0}
                          className="text-muted-fg"
                          ellipsis
                          children={`${count} ${memberNoun(false, count)}`}
                        />
                      </div>
                      {!campaign.campaign.visibility && (
                        <Icon
                          className="text-muted-fg max-lg:hidden"
                          title="Campagna non pubblica"
                          children="visibility_off"
                        />
                      )}
                      <Icon
                        className={cn(
                          "max-lg:hidden",
                          active ? "text-primary" : "text-muted-fg"
                        )}
                        children="chevron_right"
                      />
                    </div>
                    <Divider className="last:hidden mx-2 max-lg:hidden" />
                  </React.Fragment>
                );
              })}
            </div>
          </Card>
        )}
        {/* Colonna destra: gestione dei membri dello scope selezionato */}
        <Card className="min-h-0 flex-1 flex-col items-stretch overflow-hidden p-0">
          <Toolbar className="px-2 py-8 gap-2 max-lg:px-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* Da mobile la miniatura è già nello strip degli scope */}
              <div
                className={cn("contents", totalScopes > 1 && "max-lg:hidden")}
              >
                {isFlatGroup ? (
                  <BtnFlatGroup group={selectedFlatGroup} size={[90, 50]} />
                ) : (
                  selectedCampaign && (
                    <BtnCampaign
                      size={[90, 50]}
                      camps={[selectedCampaign.campaign]}
                      slcCamp={selectedCampaign.campaign}
                    />
                  )
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Text
                    size={2}
                    weight="bolder"
                    ellipsis
                    children={selectedName}
                  />
                  {!isFlatGroup &&
                    selectedCampaign &&
                    !selectedCampaign.campaign.visibility && (
                      <Icon
                        className="text-muted-fg"
                        title="Campagna non pubblica"
                        children="visibility_off"
                      />
                    )}
                </div>
                <Text
                  size={0}
                  className="text-muted-fg"
                  ellipsis
                  children={
                    isComingSoon
                      ? "Presto disponibile"
                      : memberCount === 0
                        ? isFlatGroup
                          ? "Nessun membro associato"
                          : "Nessuno staffer associato"
                        : `${memberCount} ${memberNoun(isFlatGroup, memberCount)}`
                  }
                />
              </div>
            </div>
            <Btn
              icon="help_center"
              label={
                isMobile
                  ? undefined
                  : isFlatGroup
                    ? "Legenda gruppi"
                    : "Legenda ruoli"
              }
              tooltip={isFlatGroup ? "Legenda gruppi" : "Legenda ruoli"}
              selected={legendOpen}
              onClick={() => setLegendOpen(o => !o)}
            />
            {canAddMembers && (
              <Btn
                variant="bold"
                icon="person_add"
                label={
                  isMobile
                    ? "Aggiungi"
                    : isFlatGroup
                      ? "Aggiungi membro"
                      : "Aggiungi staffer"
                }
                onClick={() => {
                  setSearch("");
                  setAddOpen(true);
                }}
              />
            )}
          </Toolbar>
          <Divider />

          {legendOpen && (
            <>
              <div className="flex flex-col gap-3 p-4 bg-bg">
                {(isFlatGroup
                  ? FLAT_GROUPS.filter(g => !g.comingSoon)
                  : roles
                ).map(item => (
                  <div key={item.id} className="flex items-start gap-3">
                    <Avatar
                      circle
                      icon={item.icon}
                      iconStyle={{ color: item.color }}
                      style={{
                        backgroundColor: `color-mix(in srgb, ${item.color} 15%, var(--bg))`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <Text size={2} weight="bolder" children={item.name} />
                      <Text
                        size={0}
                        className="text-muted-fg"
                        children={item.description}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Divider />
            </>
          )}

          {isComingSoon ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 flex-1 justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
                <Icon size="lg" className="text-muted-fg" children="upcoming" />
              </div>
              <Text
                size={2}
                weight="bolder"
                children="Funzionalità in arrivo"
              />
              <Text
                className="text-muted-fg max-w-[420px] text-center"
                children={`La gestione del gruppo "${selectedFlatGroup?.name}" non è ancora attiva. Da prendere in carico con l'eliminazione della gestione "super-user"`}
              />
            </div>
          ) : memberCount === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 flex-1 justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
                <Icon size="lg" className="text-muted-fg" children="person" />
              </div>
              <Text
                size={2}
                weight="bolder"
                children="Nessun utente in questo gruppo"
              />
              <Text
                className="text-muted-fg text-center"
                children={
                  isFlatGroup
                    ? "Aggiungi gli utenti che fanno parte di questo gruppo."
                    : "Aggiungi gli utenti che gestiscono la campagna."
                }
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 pb-28">
              {assignments.map(({ userId, roleId }) => {
                const user = usersById[userId];
                const role = rolesById[roleId];
                if (!user) return null;
                const isNonRemovable =
                  isFlatGroup &&
                  (nonRemovableUserIds?.includes(userId) ?? false);
                const locked = isNonRemovable || isRowLocked(roleId);
                const deleteTooltip = !locked
                  ? "Rimuovi"
                  : isNonRemovable
                    ? "Questo utente non può essere rimosso da questo gruppo"
                    : editMode === "readonly"
                      ? "Sola lettura"
                      : "Deve rimanere sempre almeno un head master";
                return (
                  <React.Fragment key={userId}>
                    {/* Da mobile: riga utente (avatar | nome | rimuovi) con il
                        ruolo a tutta larghezza sotto; da sm in su tutto in
                        riga (`sm:contents` appiattisce il blocco superiore). */}
                    <div className="flex shrink-0 flex-col gap-2 rounded p-2 hover:bg-accent sm:min-h-[58px] sm:flex-row sm:items-center">
                      <div className="flex min-w-0 items-center gap-3 sm:contents">
                        <AvatarUser
                          circle
                          src={user.image ?? undefined}
                          text={user.name}
                        />
                        <div className="min-w-0 flex-1">
                          <Text
                            size={2}
                            weight="bolder"
                            ellipsis
                            children={user.name}
                          />
                          <Text
                            size={0}
                            className="text-muted-fg"
                            ellipsis
                            children={user.email}
                          />
                        </div>
                        {canAddMembers && (
                          <Btn
                            className="sm:order-last"
                            icon="close"
                            tooltip={deleteTooltip}
                            color="var(--fail)"
                            disabled={locked}
                            onClick={() => removeUser(userId)}
                          />
                        )}
                      </div>
                      {isFlatGroup && selectedFlatGroup ? (
                        // Ruolo unico e non modificabile nei gruppi flat.
                        // Da mobile è ridondante (tutti i membri hanno lo stesso).
                        <div
                          className="flex h-[40px] w-[170px] min-w-[170px] items-center gap-2 rounded border px-3 max-sm:hidden"
                          style={{ borderColor: selectedFlatGroup.color }}
                        >
                          <Icon
                            style={{ color: selectedFlatGroup.color }}
                            children={selectedFlatGroup.icon}
                          />
                          <Text ellipsis children={selectedFlatGroup.name} />
                        </div>
                      ) : (
                        <FieldSelect
                          className="w-full sm:w-[170px] sm:min-w-[170px]"
                          style={{ borderColor: role?.color }}
                          placeholder="Ruolo"
                          icon={role?.icon}
                          iconStyle={{ color: role?.color }}
                          value={roleId}
                          items={roleItems}
                          disabled={locked}
                          onChange={v => setRole(userId, String(v))}
                        />
                      )}
                    </div>
                    <Divider className="last:hidden mx-2" />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </Card>

        {/* Modale: aggiungi utenti registrati allo scope selezionato */}
        <Modal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title={`Aggiungi ${isFlatGroup ? "membri" : "staffer"} · ${selectedName}`}
          contentClassName="gap-3"
          content={
            <div className="flex w-[420px] max-w-full flex-col gap-3">
              <FieldText
                icon="search"
                placeholder="Cerca per nome o email..."
                value={search}
                onChange={setSearch}
              />
              {availableUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Icon size="lg" className="text-muted-fg" children="search" />
                  <Text
                    className="text-muted-fg text-center"
                    children={
                      search
                        ? "Nessun utente trovato"
                        : isFlatGroup
                          ? `Tutti gli utenti sono già in ${selectedName}`
                          : "Tutti gli utenti sono già associati"
                    }
                  />
                </div>
              ) : (
                <div className="flex max-h-[45vh] flex-col overflow-y-auto">
                  {visibleUsers.map(user => (
                    <React.Fragment key={user.id}>
                      <div className="flex items-center gap-3 rounded px-2 py-1.5 rounded hover:bg-accent">
                        <AvatarUser
                          circle
                          src={user.image ?? undefined}
                          text={user.name}
                        />
                        <div className="min-w-0 flex-1">
                          <Text weight="bolder" ellipsis children={user.name} />
                          <Text
                            size={0}
                            className="text-muted-fg"
                            ellipsis
                            children={user.email}
                          />
                        </div>
                        <Btn
                          icon="add"
                          label={isMobile ? undefined : "Aggiungi"}
                          tooltip="Aggiungi"
                          onClick={() => addUser(user.id)}
                        />
                      </div>
                      <Divider className="last:hidden mx-2" />
                    </React.Fragment>
                  ))}
                  {hiddenUsersCount > 0 && (
                    <div className="flex items-center justify-center gap-1.5 px-2 py-3 text-center">
                      <Icon className="text-muted-fg" children="search" />
                      <Text
                        size={0}
                        className="text-muted-fg"
                        children={`Altri ${hiddenUsersCount} utenti non mostrati — affina la ricerca per trovarli`}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          }
          actions={
            <Btn
              variant="bold"
              label="Fatto"
              onClick={() => setAddOpen(false)}
            />
          }
        />
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        saved={saveSuccess}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
};

export default ManagerRoles;
