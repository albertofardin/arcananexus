import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
import ActionPage from "../page";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignMaster } from "@/lib/authorization";
import {
  mockCampaign,
  mockCharacter,
  mockFeature,
  mockFeatureType,
} from "@/test/helpers/prisma-fixtures";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/authorization", () => ({
  isUserCampaignMaster: vi.fn(),
  isUserCampaignHelper: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    character: { findUnique: vi.fn(), findMany: vi.fn() },
    feature: { findFirst: vi.fn(), findMany: vi.fn() },
    characterData: { findMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, id: string, actionType: string) => ({
  params: Promise.resolve({ campaignSlug, id, actionType }),
});

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

const ownerCharacter = mockCharacter({
  id: 1,
  campaignId: 1,
  userId: "user-owner",
  downtimePoints: 3,
});

const missiveFeature = {
  ...mockFeature({ id: 6, campaignId: 1 }),
  featureType: mockFeatureType({
    id: 2,
    featureName: "Missive",
    functionName: "missive",
  }),
};

const downtimeContainerFeature = {
  ...mockFeature({ id: 7, campaignId: 1 }),
  featureType: mockFeatureType({
    id: 3,
    featureName: "Downtime",
    functionName: "downtime",
  }),
};

describe("Player Feature Action Page (T-033)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.feature.findMany as Mock).mockResolvedValue([]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.characterData.findMany as Mock).mockResolvedValue([]);
  });

  it("calls notFound when there is no session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    await expect(
      ActionPage(buildParams("campaign-a", "1", "downtime"))
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-owner", email: "owner@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    await expect(
      ActionPage(buildParams("unknown", "1", "downtime"))
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound when the character does not belong to the resolved campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-owner", email: "owner@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(null);

    await expect(
      ActionPage(buildParams("campaign-a", "999", "downtime"))
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  // Questa pagina gestisce solo due `functionName`: `FT_DOWNTIME`
  // (contenitore, la categoria si sceglie dentro `DowntimeWriter`) e
  // `FT_MISSIVE` — gli unici due verso cui l'app genera link
  // (`ActionRow`/`ActionRowMissive` in `CharacterEditor.tsx`). Ogni altro
  // `functionName` — una categoria specifica come `downtimeWork` (non più
  // un punto d'ingresso diretto), `talents` (UX dedicata nella scheda,
  // `ModalTalentsLearn`), `deathXpRecovery`, o qualunque stringa arbitraria —
  // risulta 404 qui, prima ancora di interrogare la `Feature` della
  // campagna.
  it.each(["downtimeWork", "talents", "deathXpRecovery", "somethingElse"])(
    "calls notFound for a functionName outside the downtime-container/missive families (%s)",
    async functionName => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);

      await expect(
        ActionPage(buildParams("campaign-a", "1", functionName))
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(prisma.feature.findFirst).not.toHaveBeenCalled();
    }
  );

  // Il gate "owner o master, altrimenti 404" per uno sconosciuto vive ora in
  // characters/[id]/layout.tsx (guardia condivisa con la scheda personaggio),
  // non più qui: la pagina non lo ripete più.
  it("does not gate access itself for a stranger (delegated to the parent layout)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-stranger", email: "stranger@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
    (isUserCampaignMaster as unknown as Mock).mockResolvedValue(false);
    (prisma.feature.findFirst as Mock).mockResolvedValue(
      downtimeContainerFeature
    );

    const result = await ActionPage(buildParams("campaign-a", "1", "downtime"));

    expect(notFound).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("renders the missive placeholder for a missive functionName", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-owner", email: "owner@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
    (isUserCampaignMaster as unknown as Mock).mockResolvedValue(false);
    (prisma.feature.findFirst as Mock).mockResolvedValue(missiveFeature);

    const result = await ActionPage(buildParams("campaign-a", "1", "missive"));

    expect(notFound).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(prisma.feature.findMany).not.toHaveBeenCalled();
  });

  // Regressione: il badge "punti/max missive" deve sommare il massimale
  // configurato sulla Feature al bonus personale del personaggio
  // (`missivePointsBonus`, accumulato dai talenti "Aggiungi punto Missiva"
  // — vedi `grantCharacterPointBonus`), non mostrare solo il massimale di
  // campagna come se il bonus non esistesse.
  it("adds the character's missivePointsBonus to the max shown in the points badge", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-owner", email: "owner@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(
      mockCharacter({
        id: 1,
        campaignId: 1,
        userId: "user-owner",
        missivePoints: 2,
        missivePointsBonus: 2,
      })
    );
    (isUserCampaignMaster as unknown as Mock).mockResolvedValue(false);
    (prisma.feature.findFirst as Mock).mockResolvedValue({
      ...missiveFeature,
      featureData: { maxPerEvent: 3 },
    });

    const result = await ActionPage(buildParams("campaign-a", "1", "missive"));

    const [, heroPage] = result.props.children;
    const [badge] = heroPage.props.action.props.children;
    expect(badge.props.label).toBe("2/5 missive");
  });

  it("lets a campaign master view the page for a PG they do not own", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-master", email: "master@example.com" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
    (isUserCampaignMaster as unknown as Mock).mockResolvedValue(true);
    (prisma.feature.findFirst as Mock).mockResolvedValue(
      downtimeContainerFeature
    );

    const result = await ActionPage(buildParams("campaign-a", "1", "downtime"));

    expect(result).toBeDefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  // `FT_DOWNTIME` (il contenitore, mai eseguibile come azione,
  // `handlers/downtime.ts`) è il punto d'ingresso generico alla dichiarazione
  // di un'azione downtime: la categoria si sceglie dentro `DowntimeWriter`.
  describe("FT_DOWNTIME container entry point", () => {
    beforeEach(() => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-owner", email: "owner@example.com" },
      });
      (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (isUserCampaignMaster as unknown as Mock).mockResolvedValue(false);
    });

    it("renders when no Feature row exists for the container (no row = active by default)", async () => {
      (prisma.feature.findFirst as Mock).mockResolvedValue(null);

      const result = await ActionPage(
        buildParams("campaign-a", "1", "downtime")
      );

      expect(notFound).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("renders using the container's own featureName when a Feature row exists and is active", async () => {
      (prisma.feature.findFirst as Mock).mockResolvedValue(
        downtimeContainerFeature
      );

      const result = await ActionPage(
        buildParams("campaign-a", "1", "downtime")
      );

      expect(notFound).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("calls notFound when the container Feature row is explicitly inactive", async () => {
      (prisma.feature.findFirst as Mock).mockResolvedValue({
        ...downtimeContainerFeature,
        active: false,
      });

      await expect(
        ActionPage(buildParams("campaign-a", "1", "downtime"))
      ).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });
});
