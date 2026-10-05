/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authorizeRichTextImageUpload,
  extractUploadThingKeysFromRichText,
  extractUploadThingKeysFromActionData,
} from "./richTextImageUpload";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockCampaign } from "@/test/helpers/prisma-fixtures";

describe("authorizeRichTextImageUpload", () => {
  const campaign = mockCampaign({ id: 1, slug: "test-campaign" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findFirst.mockResolvedValue(campaign);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    const result = await authorizeRichTextImageUpload(prismaClient, {
      userId: null,
      campaignSlug: "test-campaign",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Non autenticato",
    });
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    prismaMock.campaign.findFirst.mockResolvedValue(null);

    const result = await authorizeRichTextImageUpload(prismaClient, {
      userId: "user-1",
      campaignSlug: "unknown",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Campagna non trovata",
    });
  });

  it("allows any authenticated user, no role check", async () => {
    const result = await authorizeRichTextImageUpload(prismaClient, {
      userId: "user-1",
      campaignSlug: "test-campaign",
    });

    expect(result).toEqual({
      ok: true,
      context: { campaignId: 1, campaignSlug: "test-campaign" },
    });
  });
});

describe("extractUploadThingKeysFromRichText", () => {
  it("returns an empty array for null/undefined/empty content", () => {
    expect(extractUploadThingKeysFromRichText(null)).toEqual([]);
    expect(extractUploadThingKeysFromRichText(undefined)).toEqual([]);
    expect(extractUploadThingKeysFromRichText("")).toEqual([]);
  });

  it("extracts every UploadThing key embedded in the HTML", () => {
    const html =
      '<p>Testo <img src="https://utfs.io/f/key-one.png"> e ' +
      '<img src="https://utfs.io/f/key-two?foo=bar"></p>';

    expect(extractUploadThingKeysFromRichText(html)).toEqual([
      "key-one.png",
      "key-two",
    ]);
  });

  it("ignores plain text and non-UploadThing image URLs", () => {
    const html = '<p>Testo <img src="https://example.com/foo.png"></p>';

    expect(extractUploadThingKeysFromRichText(html)).toEqual([]);
  });
});

describe("extractUploadThingKeysFromActionData", () => {
  it("returns an empty array for null/undefined actionData", () => {
    expect(extractUploadThingKeysFromActionData(null)).toEqual([]);
    expect(extractUploadThingKeysFromActionData(undefined)).toEqual([]);
  });

  it("walks nested objects/arrays and extracts keys from every string value", () => {
    const actionData = {
      subject: "Oggetto",
      description: '<p><img src="https://utfs.io/f/missive-key"></p>',
      communication: true,
      receiverCharacterId: 42,
      thread: [{ response: '<p><img src="https://utfs.io/f/reply-key"></p>' }],
    };

    expect(extractUploadThingKeysFromActionData(actionData)).toEqual([
      "missive-key",
      "reply-key",
    ]);
  });

  it("returns an empty array when no string contains an UploadThing URL", () => {
    const actionData = { subject: "Oggetto", communication: true };

    expect(extractUploadThingKeysFromActionData(actionData)).toEqual([]);
  });
});
