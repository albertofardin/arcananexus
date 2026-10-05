/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectCampaignFileKeys,
  cleanupCampaignFiles,
} from "./campaignFileCleanup";
import { utapi } from "@/lib/uploadthing";
import type { CampaignUploadThingRefs } from "@/lib/repositories/types";

vi.mock("@/lib/uploadthing", () => ({
  utapi: {
    deleteFiles: vi.fn(),
  },
}));

const emptyRefs: CampaignUploadThingRefs = {
  logoKey: null,
  coverKey: null,
  galleryKeys: [],
  referenceDataFileKeys: [],
  characterAvatarUrls: [],
  referenceDataDescriptions: [],
  actionData: [],
};

describe("collectCampaignFileKeys", () => {
  it("returns an empty array when the campaign has no file references", () => {
    expect(collectCampaignFileKeys(emptyRefs)).toEqual([]);
  });

  it("collects keys from every source, extracting them where needed", () => {
    const refs: CampaignUploadThingRefs = {
      logoKey: "logo-key",
      coverKey: "cover-key",
      galleryKeys: ["gallery-key-1", "gallery-key-2"],
      referenceDataFileKeys: ["document-key"],
      characterAvatarUrls: [
        "https://utfs.io/f/avatar-key",
        // Avatar esterno (OAuth): non produce alcuna key, ignorato.
        "https://example.com/avatar.png",
      ],
      referenceDataDescriptions: [
        '<p>Vedi <img src="https://utfs.io/f/inline-doc-key"></p>',
      ],
      actionData: [
        {
          subject: "Oggetto",
          description: '<p><img src="https://utfs.io/f/missive-key"></p>',
        },
      ],
    };

    expect(new Set(collectCampaignFileKeys(refs))).toEqual(
      new Set([
        "logo-key",
        "cover-key",
        "gallery-key-1",
        "gallery-key-2",
        "document-key",
        "avatar-key",
        "inline-doc-key",
        "missive-key",
      ])
    );
  });

  it("deduplicates keys shared across sources", () => {
    const refs: CampaignUploadThingRefs = {
      ...emptyRefs,
      logoKey: "shared-key",
      galleryKeys: ["shared-key"],
    };

    expect(collectCampaignFileKeys(refs)).toEqual(["shared-key"]);
  });
});

describe("cleanupCampaignFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call UploadThing when there are no files to clean up", async () => {
    await cleanupCampaignFiles(emptyRefs, "campagna-prova");

    expect(utapi.deleteFiles).not.toHaveBeenCalled();
  });

  it("bulk-deletes every collected key", async () => {
    (utapi.deleteFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      deletedCount: 1,
    });
    const refs: CampaignUploadThingRefs = {
      ...emptyRefs,
      logoKey: "logo-key",
    };

    await cleanupCampaignFiles(refs, "campagna-prova");

    expect(utapi.deleteFiles).toHaveBeenCalledWith(["logo-key"]);
  });

  it("is best-effort: a storage failure is logged, not thrown", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (utapi.deleteFiles as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error")
    );
    const refs: CampaignUploadThingRefs = {
      ...emptyRefs,
      logoKey: "logo-key",
    };

    await expect(
      cleanupCampaignFiles(refs, "campagna-prova")
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
