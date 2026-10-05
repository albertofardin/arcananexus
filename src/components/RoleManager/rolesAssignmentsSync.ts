import type { Assignment } from "./ManagerRoles";

async function ensureOk(response: Response, action: string) {
  if (!response.ok) {
    throw new Error(`${action} non riuscito (status ${response.status})`);
  }
}

// Confronta lo stato precedente (persistito) con quello corrente (in editing)
// per uno scope e ne ricava le operazioni da inviare al backend.
function diffAssignments(previous: Assignment[], next: Assignment[]) {
  const prevRoleByUser = new Map(previous.map(a => [a.userId, a.roleId]));
  const nextRoleByUser = new Map(next.map(a => [a.userId, a.roleId]));

  const created: Assignment[] = [];
  const updated: Assignment[] = [];
  const removedUserIds: string[] = [];

  for (const [userId, roleId] of nextRoleByUser) {
    if (!prevRoleByUser.has(userId)) {
      created.push({ userId, roleId });
    } else if (prevRoleByUser.get(userId) !== roleId) {
      updated.push({ userId, roleId });
    }
  }
  for (const userId of prevRoleByUser.keys()) {
    if (!nextRoleByUser.has(userId)) {
      removedUserIds.push(userId);
    }
  }

  return { created, updated, removedUserIds };
}

// Sincronizza le assegnazioni di ruolo staff (Grant) di una campagna con il
// backend, chiamando create/update/delete solo per le voci cambiate.
export async function syncCampaignGrants(
  campaignSlug: string,
  previous: Assignment[],
  next: Assignment[]
): Promise<void> {
  const { created, updated, removedUserIds } = diffAssignments(previous, next);
  const base = `/api/campaigns/${campaignSlug}/grants`;

  for (const { userId, roleId } of created) {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: roleId }),
    });
    await ensureOk(response, "Assegnazione ruolo");
  }
  for (const { userId, roleId } of updated) {
    const response = await fetch(`${base}/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: roleId }),
    });
    await ensureOk(response, "Cambio ruolo");
  }
  for (const userId of removedUserIds) {
    const response = await fetch(`${base}/${userId}`, { method: "DELETE" });
    await ensureOk(response, "Rimozione ruolo");
  }
}

// Sincronizza l'appartenenza a uno dei due gruppi flat della sezione
// Amministrazione ("direttivo" o "sviluppo", `User.isDirettivo`/`isSviluppo`).
// Nessun ruolo distinto al loro interno: qui contano solo le aggiunte e le
// rimozioni, sulla stessa base `/api/admin/association-roles`.
export async function syncGroupMembers(
  group: "direttivo" | "sviluppo",
  previous: Assignment[],
  next: Assignment[]
): Promise<void> {
  const { created, removedUserIds } = diffAssignments(previous, next);
  const base = "/api/admin/association-roles";
  const groupLabel = group === "direttivo" ? "direttivo" : "sviluppo web";

  for (const { userId } of created) {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, group }),
    });
    await ensureOk(response, `Aggiunta a ${groupLabel}`);
  }
  for (const userId of removedUserIds) {
    const response = await fetch(`${base}/${userId}?group=${group}`, {
      method: "DELETE",
    });
    await ensureOk(response, `Rimozione da ${groupLabel}`);
  }
}
