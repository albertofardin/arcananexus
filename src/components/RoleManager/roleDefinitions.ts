import { Role } from "@prisma/client";
import type { Role as RoleDefinition } from "./ManagerRoles";
import { ROLE_COLORS } from "@/lib/constants";

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: Role.head_master,
    name: "Head Master",
    icon: "headmaster",
    color: ROLE_COLORS[Role.head_master],
    description:
      "Responsabile della campagna, ne gestisce lo staff e le azioni irreversibili, oltre ad avere gli stessi poteri del Master",
  },
  {
    id: Role.master,
    name: "Master",
    icon: "master",
    color: ROLE_COLORS[Role.master],
    description:
      "Gestisce tutti gli aspetti della campagna, dalla modifica di contenuti e impostazioni fino alle schede personaggio",
  },
  {
    id: Role.supporter,
    name: "Supporter",
    icon: "supporter",
    color: ROLE_COLORS[Role.supporter],
    description:
      "Può vedere tutti i contenuti della campagna, anche quelli nascosti dai master, ma senza poter modificare nulla",
  },
];

export const ROLE_LABELS: Record<Role, string> = Object.fromEntries(
  ROLE_DEFINITIONS.map(({ id, name }) => [id, name])
) as Record<Role, string>;
