const eventsBase = (camp?: string | null) =>
  camp ? `/dashboard/${camp}/events` : "/dashboard/events";

export const routes = {
  home: () => "/dashboard",
  profile: () => "/dashboard/profile",
  profileMembership: () => "/dashboard/profile/membership",
  profileConventions: () => "/dashboard/profile/conventions",
  profileSupport: () => "/dashboard/profile/support",
  profileSupportTicket: (ticketId: string | number) =>
    `/dashboard/profile/support/${ticketId}`,

  events: () => "/dashboard/events",
  // Eventi: sotto la campagna se ne hanno una, altrimenti (eventi
  // dell'associazione) sotto `/dashboard/events`. `camp` nullo/assente = senza campagna.
  eventNew: (camp?: string | null) => `${eventsBase(camp)}/new`,
  event: (camp: string | null | undefined, id: string | number) =>
    `${eventsBase(camp)}/${id}`,
  eventEdit: (camp: string | null | undefined, id: string | number) =>
    `${eventsBase(camp)}/${id}/edit`,
  eventRegister: (camp: string | null | undefined, id: string | number) =>
    `${eventsBase(camp)}/${id}/iscrizione`,

  admin: () => "/dashboard/admin",
  adminUsers: () => "/dashboard/admin/users",
  adminRoles: () => "/dashboard/admin/roles",
  adminCampaigns: () => "/dashboard/admin/campaigns",

  campaign: (camp: string) => `/dashboard/${camp}`,
  campaignEvents: (camp: string) => `/dashboard/${camp}/events`,
  campaignEvent: (camp: string, eventId: string | number) =>
    `/dashboard/${camp}/events/${eventId}`,
  campaignMissive: (camp: string) => `/dashboard/${camp}/missive`,
  campaignMissiveNew: (camp: string) => `/dashboard/${camp}/missive/new`,
  campaignMissiveDetail: (camp: string, id: string | number) =>
    `/dashboard/${camp}/missive/${id}`,
  campaignDowntime: (camp: string) => `/dashboard/${camp}/downtime`,
  campaignDowntimeNew: (camp: string) => `/dashboard/${camp}/downtime/new`,
  campaignDowntimeDetail: (camp: string, id: string | number) =>
    `/dashboard/${camp}/downtime/${id}`,
  campaignCharacters: (camp: string) => `/dashboard/${camp}/characters`,
  campaignCharacterNew: (camp: string) => `/dashboard/${camp}/characters/new`,
  campaignCharacter: (camp: string, characterId: string | number) =>
    `/dashboard/${camp}/characters/${characterId}`,
  campaignCharacterAction: (
    camp: string,
    characterId: string | number,
    actionType: string
  ) => `/dashboard/${camp}/characters/${characterId}/${actionType}`,
  campaignData: (camp: string, dataName: string) =>
    `/dashboard/${camp}/data/${dataName}`,
  campaignDataPage: (
    camp: string,
    dataName: string,
    entryId: string | number
  ) => `/dashboard/${camp}/data/${dataName}/${entryId}`,

  campaignAdmin: (camp: string) => `/dashboard/${camp}/admin`,
  campaignAdminPresentation: (camp: string) =>
    `/dashboard/${camp}/admin/presentation`,
  campaignAdminRoles: (camp: string) => `/dashboard/${camp}/admin/roles`,
  campaignAdminCharacters: (camp: string) =>
    `/dashboard/${camp}/admin/characters`,
  campaignAdminCharacter: (camp: string, characterId: string | number) =>
    `/dashboard/${camp}/admin/characters/${characterId}`,
  campaignAdminProgress: (camp: string) => `/dashboard/${camp}/admin/progress`,
  campaignAdminFeatures: (camp: string) => `/dashboard/${camp}/admin/features`,
  campaignAdminDataTypes: (camp: string) =>
    `/dashboard/${camp}/admin/data-types`,
  campaignAdminDataType: (camp: string, dataSlug: string) =>
    `/dashboard/${camp}/admin/data-types/${dataSlug}`,
  campaignAdminReport: (camp: string) => `/dashboard/${camp}/admin/report`,
  campaignAdminPrint: (camp: string) => `/dashboard/${camp}/admin/print`,
} as const;
