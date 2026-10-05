import { routes } from "@/app/routes";

export interface IProfileNavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  matchPrefix?: boolean;
}

// Voci di navigazione del profilo, condivise tra SidePanel (link diretti)
// e BtnUser (menu a popover) così ordine e icone restano allineati.
export const profileNavItems: IProfileNavItem[] = [
  {
    id: "support",
    label: "Supporto",
    icon: "support_agent",
    route: routes.profileSupport(),
    matchPrefix: true,
  },
  {
    id: "conventions",
    label: "Convenzioni",
    icon: "chat_favourite",
    route: routes.profileConventions(),
  },
  {
    id: "tessera",
    label: "Tesseramento",
    icon: "identity_card",
    route: routes.profileMembership(),
  },
  {
    id: "profile",
    label: "Profilo",
    icon: "person",
    route: routes.profile(),
  },
];

// Shortcut di amministrazione piattaforma, visibili solo a chi è
// direttivo o sviluppo web (vedi BtnAdmin).
export const adminNavItems: IProfileNavItem[] = [
  {
    id: "admin-users",
    label: "Gestione Utenti",
    icon: "groups",
    route: routes.adminUsers(),
  },
  {
    id: "admin-roles",
    label: "Gestione Ruoli",
    icon: "master",
    route: routes.adminRoles(),
  },
  {
    id: "admin-campaigns",
    label: "Gestione Campagne",
    icon: "tower",
    route: routes.adminCampaigns(),
  },
];
