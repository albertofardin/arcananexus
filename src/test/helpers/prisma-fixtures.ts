import {
  CharacterType,
  Role,
  DataVisibility,
  DataTypeKind,
  DataTypeAssignability,
  DataTypeRender,
  XpReason,
  UserStatus,
  CampaignType,
  CampaignColor,
  CampaignTexture,
  type User,
  type Organization,
  type Campaign,
  type CampaignImage,
  type Character,
  type ReferenceData,
  type CharacterData,
  type XpTransaction,
  type Action,
  type Event,
  type Grant,
  type DataType,
  type Booking,
  type Membership,
  type Payment,
  type PersonalData,
  type FeatureType,
  type Feature,
  NotificationType,
  type Notification,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// User fixtures
export const mockUser = (overrides?: Partial<User>): User => ({
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  isDirettivo: false,
  isSviluppo: false,
  status: UserStatus.active,
  role: null,
  banned: false,
  banReason: null,
  banExpires: null,
  emailNotificationsEnabled: true,
  ...overrides,
});

// Organization fixtures
export const mockOrganization = (
  overrides?: Partial<Organization>
): Organization => ({
  id: 1,
  name: "Test Organization",
  slug: "test-org",
  description: "Test org description",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

// Campaign fixtures
export const mockCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: 1,
  name: "Test Campaign",
  slug: "test-campaign",
  description: "Test campaign description",
  type: CampaignType.campaign,
  visibility: true,
  organizationId: 1,
  logo: null,
  logoKey: null,
  cover: null,
  coverKey: null,
  color: CampaignColor.cobalt,
  texture: CampaignTexture.none,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

// CampaignImage fixtures (T-045, galleria di presentazione).
export const mockCampaignImage = (
  overrides?: Partial<CampaignImage>
): CampaignImage => ({
  id: 1,
  campaignId: 1,
  url: "https://utfs.io/f/gallery-key_gallery-1.webp",
  key: "gallery-key",
  order: 0,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

// Character fixtures
export const mockCharacter = (overrides?: Partial<Character>): Character => ({
  id: 1,
  campaignId: 1,
  userId: "user-1",
  type: CharacterType.pg,
  name: "Test Character",
  avatar: null,
  background: "Test background",
  creationDate: new Date("2024-01-01"),
  approvalDate: new Date("2024-01-02"),
  deathDate: null,
  parkDate: null,
  playerNotes: "Visible notes",
  masterPublicNotes: "Public master notes",
  masterNotes: "Hidden notes",
  downtimePoints: 0,
  missivePoints: 0,
  downtimePointsBonus: 0,
  missivePointsBonus: 0,
  lastUpdateDate: new Date("2024-01-01"),
  ...overrides,
});

// DataType fixtures
// `cardinality: null` di default (T-035), coerente con `assignability:
// "none"` (l'invariante che li lega, `validations/dataType.ts`): un override
// `{ assignability: "always" }` senza toccare `cardinality` andrebbe
// comunque integrato con un `cardinality` esplicito dal chiamante se il test
// ne ha bisogno (nessun default "multi" fantasma da qui in poi).
export const mockDataType = (overrides?: Partial<DataType>): DataType => ({
  id: 1,
  campaignId: 1,
  name: "Test Data Type",
  kind: DataTypeKind.generic,
  description: null,
  cardinality: null,
  assignability: DataTypeAssignability.none,
  mandatory: false,
  sidebarShow: false,
  sidebarOrder: null,
  icon: null,
  renderAs: DataTypeRender.catalog,
  visibility: DataVisibility.visible,
  ...overrides,
});

// ReferenceData fixtures (catalog entry / definition)
export const mockReferenceData = (
  overrides?: Partial<ReferenceData>
): ReferenceData => ({
  id: 1,
  dataTypeId: 1,
  name: "Test Reference Data",
  description: null,
  flags: null,
  visibility: DataVisibility.visible,
  fileUrl: null,
  fileKey: null,
  externalId: null,
  order: 0,
  ...overrides,
});

// CharacterData fixtures (instance / assignment to a PG or user)
export const mockCharacterData = (
  overrides?: Partial<CharacterData>
): CharacterData => ({
  id: 1,
  characterId: null,
  userId: null,
  referenceDataId: 1,
  dataTypeId: 1,
  value: null,
  visibility: DataVisibility.visible,
  grantedById: null,
  grantedByOverride: false,
  actionId: null,
  externalId: null,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

// XpTransaction fixtures (XP ledger entry)
export const mockXpTransaction = (
  overrides?: Partial<XpTransaction>
): XpTransaction => ({
  id: 1,
  characterId: 1,
  amount: 10,
  reason: XpReason.initialGrant,
  referenceDataId: null,
  actionId: null,
  sourceCharacterId: null,
  updatedById: null,
  note: null,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

// Action fixtures
export const mockAction = (overrides?: Partial<Action>): Action => ({
  id: 1,
  characterId: 1,
  featureId: 1,
  creationDate: new Date("2024-01-01"),
  actionData: null,
  authorUserId: null,
  ...overrides,
});

// Event fixtures
export const mockEvent = (overrides?: Partial<Event>): Event => ({
  id: 1,
  organizationId: 1,
  campaignId: 1,
  name: "Test Event",
  place: "Test Location",
  image: null,
  description: "Full description",
  datePublicationStart: new Date("2025-01-01"),
  datePublicationEnd: new Date("2025-05-25"),
  dateEventStart: new Date("2025-06-01"),
  dateEventEnd: new Date("2025-06-02"),
  price: new Decimal("0"),
  visibility: "visible",
  ...overrides,
});

// Grant fixtures
export const mockGrant = (overrides?: Partial<Grant>): Grant => ({
  userId: "user-1",
  campaignId: 1,
  role: Role.head_master,
  ...overrides,
});

// Booking fixtures
export const mockBooking = (overrides?: Partial<Booking>): Booking => ({
  id: 1,
  userId: "user-1",
  eventId: 1,
  characterId: 1,
  paymentId: null,
  couponId: null,
  price: null,
  paymentOptionLabel: null,
  present: null,
  note: null,
  addedByStaff: false,
  bookingDate: new Date("2025-01-01"),
  paymentDate: null,
  ...overrides,
});

// Payment fixtures
export const mockPayment = (overrides?: Partial<Payment>): Payment => ({
  id: 1,
  paymentData: {},
  value: new Decimal("50.00"),
  userId: "user-1",
  createdAt: new Date("2025-01-01"),
  ...overrides,
});

// Membership fixtures
export const mockMembership = (
  overrides?: Partial<Membership>
): Membership => ({
  id: 1,
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-12-31"),
  year: 2025,
  userId: "user-1",
  paymentId: 1,
  ...overrides,
});

// FeatureType fixtures (catalogo funzioni feature, T-019 — platform-wide,
// nessun campaignId: il mapping functionName → handler vive nel registry
// dev-side, `src/lib/features/`)
export const mockFeatureType = (
  overrides?: Partial<FeatureType>
): FeatureType => ({
  id: 1,
  featureName: "Test Feature Type",
  functionName: "testFunction",
  actionSchema: {},
  featureSchema: {},
  ...overrides,
});

// Feature fixtures (configurazione per campagna di un `FeatureType`, T-019)
export const mockFeature = (overrides?: Partial<Feature>): Feature => ({
  id: 1,
  featureTypeId: 1,
  campaignId: 1,
  active: true,
  paused: false,
  featureData: {},
  ...overrides,
});

// PersonalData fixtures
export const mockPersonalData = (
  overrides?: Partial<PersonalData>
): PersonalData => ({
  id: 1,
  userId: "user-1",
  firstName: "Mario",
  lastName: "Rossi",
  ssn: "RSSMRA80A01H501Z",
  address: "Via Roma 1, 20100 Milano",
  dateOfBirth: new Date("1980-01-01"),
  placeOfBirth: "Milano",
  phone: null,
  nationality: null,
  guardianName: null,
  guardianPhone: null,
  guardianEmail: null,
  ...overrides,
});

// Notification fixtures (T-0xx, pannello notifiche)
export const mockNotification = (
  overrides?: Partial<Notification>
): Notification => ({
  id: 1,
  userId: "user-1",
  campaignId: 1,
  type: NotificationType.missive,
  entityId: 1,
  read: false,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

// Factory functions for creating test data variations
export function createMockUser(overrides?: Partial<User>): User {
  return mockUser(overrides);
}

export function createMockOrganization(
  overrides?: Partial<Organization>
): Organization {
  return mockOrganization(overrides);
}

export function createMockCampaign(overrides?: Partial<Campaign>): Campaign {
  return mockCampaign(overrides);
}

export function createMockCharacter(overrides?: Partial<Character>): Character {
  return mockCharacter(overrides);
}

export function createMockReferenceData(
  overrides?: Partial<ReferenceData>
): ReferenceData {
  return mockReferenceData(overrides);
}

export function createMockCharacterData(
  overrides?: Partial<CharacterData>
): CharacterData {
  return mockCharacterData(overrides);
}

export function createMockEvent(overrides?: Partial<Event>): Event {
  return mockEvent(overrides);
}

export function createMockGrant(overrides?: Partial<Grant>): Grant {
  return mockGrant(overrides);
}

export function createMockBooking(overrides?: Partial<Booking>): Booking {
  return mockBooking(overrides);
}

export function createMockPayment(overrides?: Partial<Payment>): Payment {
  return mockPayment(overrides);
}

export function createMockMembership(
  overrides?: Partial<Membership>
): Membership {
  return mockMembership(overrides);
}

export function createMockPersonalData(
  overrides?: Partial<PersonalData>
): PersonalData {
  return mockPersonalData(overrides);
}

// Complex fixture with relations
export const mockCharacterWithRelations = () => ({
  ...mockCharacter(),
  campaign: mockCampaign(),
  user: mockUser(),
  characterData: [mockCharacterData({ characterId: 1 })],
  bookings: [],
  actions: [],
  inbox: [],
  outbox: [],
});

export const mockCampaignWithRelations = () => ({
  ...mockCampaign(),
  organization: mockOrganization(),
  dataTypes: [mockDataType()],
  events: [mockEvent()],
  characters: [mockCharacter()],
  grants: [],
  feature: [],
});
