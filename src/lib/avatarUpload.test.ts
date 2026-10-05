/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { Role } from "@prisma/client";
import {
  authorizeAvatarUpload,
  applyAvatarUpload,
  convertUploadedAvatarToWebp,
  validateUploadedWebpAvatar,
  extractUploadThingKey,
} from "./avatarUpload";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCharacter,
  mockGrant,
  mockUser,
} from "@/test/helpers/prisma-fixtures";

describe("authorizeAvatarUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the caller is not authenticated", async () => {
    const result = await authorizeAvatarUpload(prismaClient, {
      userId: null,
      input: { target: "user" },
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Non autenticato",
    });
  });

  describe("target: user", () => {
    it("returns 404 when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "user" },
      });

      expect(result).toEqual({
        ok: false,
        status: 404,
        message: "Utente non trovato",
      });
    });

    it("allows the caller and resolves the previous image", async () => {
      prismaMock.user.findUnique.mockResolvedValue(
        mockUser({ id: "user-1", image: "https://utfs.io/f/old-key" })
      );

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "user" },
      });

      expect(result).toEqual({
        ok: true,
        context: {
          target: "user",
          userId: "user-1",
          previousImage: "https://utfs.io/f/old-key",
        },
      });
    });
  });

  describe("target: character", () => {
    it("returns 404 when the character does not exist", async () => {
      prismaMock.character.findUnique.mockResolvedValue(null);

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "character", characterId: 10 },
      });

      expect(result).toEqual({
        ok: false,
        status: 404,
        message: "Personaggio non trovato",
      });
    });

    it("allows the character owner", async () => {
      const characterWithCampaign = {
        ...mockCharacter({
          id: 10,
          userId: "user-1",
          campaignId: 1,
          avatar: "https://utfs.io/f/old-key",
        }),
        campaign: { slug: "test-campaign" },
      };
      prismaMock.character.findUnique.mockResolvedValue(characterWithCampaign);
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "character", characterId: 10 },
      });

      expect(result).toEqual({
        ok: true,
        context: {
          target: "character",
          characterId: 10,
          previousAvatar: "https://utfs.io/f/old-key",
          campaignSlug: "test-campaign",
        },
      });
    });

    it("allows campaign staff even when not the owner", async () => {
      const characterWithCampaign = {
        ...mockCharacter({ id: 10, userId: "other-user", campaignId: 1 }),
        campaign: { slug: "test-campaign" },
      };
      prismaMock.character.findUnique.mockResolvedValue(characterWithCampaign);
      prismaMock.grant.findUnique.mockResolvedValue(
        mockGrant({ userId: "user-1", campaignId: 1, role: Role.supporter })
      );

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "character", characterId: 10 },
      });

      expect(result.ok).toBe(true);
    });

    it("returns 403 for a non-owner without a campaign role", async () => {
      prismaMock.character.findUnique.mockResolvedValue(
        mockCharacter({ id: 10, userId: "other-user", campaignId: 1 })
      );
      prismaMock.grant.findUnique.mockResolvedValue(null);

      const result = await authorizeAvatarUpload(prismaClient, {
        userId: "user-1",
        input: { target: "character", characterId: 10 },
      });

      expect(result).toEqual({
        ok: false,
        status: 403,
        message: "Permessi insufficienti",
      });
    });
  });
});

describe("extractUploadThingKey", () => {
  it("extracts the key from a UploadThing URL", () => {
    expect(extractUploadThingKey("https://utfs.io/f/abc123")).toBe("abc123");
    expect(extractUploadThingKey("https://app-id.ufs.sh/f/abc123?x=1")).toBe(
      "abc123"
    );
  });

  it("returns null for a non-UploadThing URL", () => {
    expect(extractUploadThingKey("https://example.com/avatar.png")).toBeNull();
    expect(extractUploadThingKey("/uploads/users/old.webp")).toBeNull();
  });

  it("returns null for a missing url", () => {
    expect(extractUploadThingKey(null)).toBeNull();
    expect(extractUploadThingKey(undefined)).toBeNull();
  });
});

describe("convertUploadedAvatarToWebp", () => {
  // PNG 1x1 valido: sharp rifiuterebbe un buffer che non è un'immagine reale.
  const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  it("downloads, converts to webp, uploads under the given name and deletes the original", async () => {
    const original = Buffer.from(TINY_PNG_BASE64, "base64");
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(original),
      uploadFile: vi.fn().mockResolvedValue({
        url: "https://utfs.io/f/new-key",
        key: "new-key",
      }),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await convertUploadedAvatarToWebp(
      { url: "https://utfs.io/f/raw-key", key: "raw-key" },
      "user-1-123.webp",
      deps
    );

    expect(result).toEqual({
      url: "https://utfs.io/f/new-key",
      key: "new-key",
    });
    expect(deps.fetchBuffer).toHaveBeenCalledWith("https://utfs.io/f/raw-key");
    expect(deps.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      "user-1-123.webp"
    );
    expect(deps.deleteFile).toHaveBeenCalledWith("raw-key");
  });

  it("does not fail the request when deleting the original upload errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const original = Buffer.from(TINY_PNG_BASE64, "base64");
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(original),
      uploadFile: vi.fn().mockResolvedValue({
        url: "https://utfs.io/f/new-key",
        key: "new-key",
      }),
      deleteFile: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const result = await convertUploadedAvatarToWebp(
      { url: "https://utfs.io/f/raw-key", key: "raw-key" },
      "user-1-123.webp",
      deps
    );

    expect(result).toEqual({
      url: "https://utfs.io/f/new-key",
      key: "new-key",
    });
    consoleErrorSpy.mockRestore();
  });

  it("cleans up the orphaned raw upload when the download fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const downloadError = new Error("download failed");
    const deps = {
      fetchBuffer: vi.fn().mockRejectedValue(downloadError),
      uploadFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      convertUploadedAvatarToWebp(
        { url: "https://utfs.io/f/raw-key", key: "raw-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow(downloadError);

    expect(deps.deleteFile).toHaveBeenCalledWith("raw-key");
    expect(deps.uploadFile).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("cleans up the orphaned raw upload when sharp conversion fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // buffer non valido: sharp rifiuta un formato immagine non riconoscibile.
    const invalid = Buffer.from("not an image");
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(invalid),
      uploadFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      convertUploadedAvatarToWebp(
        { url: "https://utfs.io/f/raw-key", key: "raw-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow();

    expect(deps.deleteFile).toHaveBeenCalledWith("raw-key");
    expect(deps.uploadFile).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("cleans up the orphaned raw upload when the webp re-upload fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const original = Buffer.from(TINY_PNG_BASE64, "base64");
    const uploadError = new Error("upload failed");
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(original),
      uploadFile: vi.fn().mockRejectedValue(uploadError),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      convertUploadedAvatarToWebp(
        { url: "https://utfs.io/f/raw-key", key: "raw-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow(uploadError);

    expect(deps.deleteFile).toHaveBeenCalledWith("raw-key");
    consoleErrorSpy.mockRestore();
  });

  it("does not mask the original error when the orphan cleanup itself fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const downloadError = new Error("download failed");
    const deps = {
      fetchBuffer: vi.fn().mockRejectedValue(downloadError),
      uploadFile: vi.fn(),
      deleteFile: vi.fn().mockRejectedValue(new Error("cleanup boom")),
    };

    await expect(
      convertUploadedAvatarToWebp(
        { url: "https://utfs.io/f/raw-key", key: "raw-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow(downloadError);

    consoleErrorSpy.mockRestore();
  });
});

describe("validateUploadedWebpAvatar", () => {
  // PNG 1x1 valido riconvertito in WebP con sharp (stessa libreria usata
  // dalla funzione sotto test): niente base64 WebP hardcoded, e la fixture
  // resta un WebP realmente decodificabile anche se cambia l'encoder.
  const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  it("returns the file unchanged (no re-upload, no re-encode) and renames it to the neutral name when it decodes as a valid image", async () => {
    const webpBuffer = await sharp(Buffer.from(TINY_PNG_BASE64, "base64"))
      .webp({ quality: 82 })
      .toBuffer();
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(webpBuffer),
      renameFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn(),
    };

    const result = await validateUploadedWebpAvatar(
      { url: "https://utfs.io/f/webp-key", key: "webp-key" },
      "user-1-123.webp",
      deps
    );

    expect(result).toEqual({
      url: "https://utfs.io/f/webp-key",
      key: "webp-key",
    });
    expect(deps.fetchBuffer).toHaveBeenCalledWith("https://utfs.io/f/webp-key");
    // Nessun percorso di re-upload esiste in questa funzione (le sue `deps`
    // non includono nemmeno `uploadFile`): il "un solo upload" del criterio
    // di accettazione è garantito staticamente, non solo verificato a runtime.
    expect(deps.deleteFile).not.toHaveBeenCalled();
    // Rename di sola metadata al nome neutro `<id>-<timestamp>.webp`, così
    // il nome scelto dall'utente lato client non resta nei record
    // UploadThing di questo ramo (nome passato dal chiamante, vedi
    // `buildUploadedFileName` in `src/lib/uploadedFileName.ts`).
    expect(deps.renameFile).toHaveBeenCalledWith("webp-key", "user-1-123.webp");
  });

  it("does not fail the request when renaming the validated file errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const webpBuffer = await sharp(Buffer.from(TINY_PNG_BASE64, "base64"))
      .webp({ quality: 82 })
      .toBuffer();
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(webpBuffer),
      renameFile: vi.fn().mockRejectedValue(new Error("boom")),
      deleteFile: vi.fn(),
    };

    const result = await validateUploadedWebpAvatar(
      { url: "https://utfs.io/f/webp-key", key: "webp-key" },
      "user-1-123.webp",
      deps
    );

    expect(result).toEqual({
      url: "https://utfs.io/f/webp-key",
      key: "webp-key",
    });
    consoleErrorSpy.mockRestore();
  });

  it("deletes the file and throws when the payload decodes as an image but is not webp (e.g. a PNG declared as image/webp)", async () => {
    // Bypass del componente React: chi chiama l'endpoint UploadThing
    // direttamente può dichiarare `image/webp` per un PNG (o altro formato)
    // realmente decodificabile da sharp. Il guard deve rigettarlo comunque:
    // "decodificabile" non implica "webp".
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const pngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(pngBuffer),
      renameFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      validateUploadedWebpAvatar(
        { url: "https://utfs.io/f/fake-webp-key", key: "fake-webp-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow(/webp/i);

    expect(deps.deleteFile).toHaveBeenCalledWith("fake-webp-key");
    consoleErrorSpy.mockRestore();
  });

  it("deletes the file and throws when the payload is not a decodable image", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(Buffer.from("not an image")),
      renameFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      validateUploadedWebpAvatar(
        { url: "https://utfs.io/f/bad-key", key: "bad-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow();

    expect(deps.deleteFile).toHaveBeenCalledWith("bad-key");
    consoleErrorSpy.mockRestore();
  });

  it("does not mask the validation error when the cleanup itself fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = {
      fetchBuffer: vi.fn().mockResolvedValue(Buffer.from("not an image")),
      renameFile: vi.fn(),
      deleteFile: vi.fn().mockRejectedValue(new Error("cleanup boom")),
    };

    await expect(
      validateUploadedWebpAvatar(
        { url: "https://utfs.io/f/bad-key", key: "bad-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow();

    expect(deps.deleteFile).toHaveBeenCalledWith("bad-key");
    consoleErrorSpy.mockRestore();
  });

  it("deletes the file and throws when downloading the just-uploaded file fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const downloadError = new Error("download failed");
    const deps = {
      fetchBuffer: vi.fn().mockRejectedValue(downloadError),
      renameFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      validateUploadedWebpAvatar(
        { url: "https://utfs.io/f/raw-key", key: "raw-key" },
        "user-1-123.webp",
        deps
      )
    ).rejects.toThrow(downloadError);

    expect(deps.deleteFile).toHaveBeenCalledWith("raw-key");
    consoleErrorSpy.mockRestore();
  });
});

describe("applyAvatarUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates User.image for target: user", async () => {
    prismaMock.user.update.mockResolvedValue(mockUser({ id: "user-1" }));
    const deleteFile = vi.fn();

    const result = await applyAvatarUpload(
      prismaClient,
      { target: "user", userId: "user-1", previousImage: null },
      { url: "https://utfs.io/f/new-key", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual({ url: "https://utfs.io/f/new-key" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { image: "https://utfs.io/f/new-key" },
    });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("deletes the previous avatar file when replacing an existing one", async () => {
    prismaMock.user.update.mockResolvedValue(mockUser({ id: "user-1" }));
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    await applyAvatarUpload(
      prismaClient,
      {
        target: "user",
        userId: "user-1",
        previousImage: "https://utfs.io/f/old-key",
      },
      { url: "https://utfs.io/f/new-key", key: "new-key" },
      deleteFile
    );

    expect(deleteFile).toHaveBeenCalledWith("old-key");
  });

  it("does not try to delete a previous avatar with no recognizable UploadThing key", async () => {
    prismaMock.user.update.mockResolvedValue(mockUser({ id: "user-1" }));
    const deleteFile = vi.fn();

    await applyAvatarUpload(
      prismaClient,
      {
        target: "user",
        userId: "user-1",
        previousImage: "https://example.com/avatar.png",
      },
      { url: "https://utfs.io/f/new-key", key: "new-key" },
      deleteFile
    );

    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does not fail the request when deleting the previous avatar errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    prismaMock.user.update.mockResolvedValue(mockUser({ id: "user-1" }));
    const deleteFile = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await applyAvatarUpload(
      prismaClient,
      {
        target: "user",
        userId: "user-1",
        previousImage: "https://utfs.io/f/old-key",
      },
      { url: "https://utfs.io/f/new-key", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual({ url: "https://utfs.io/f/new-key" });
    consoleErrorSpy.mockRestore();
  });

  it("updates Character.avatar for target: character", async () => {
    prismaMock.character.update.mockResolvedValue(mockCharacter({ id: 10 }));
    const deleteFile = vi.fn();

    const result = await applyAvatarUpload(
      prismaClient,
      { target: "character", characterId: 10, previousAvatar: null },
      { url: "https://utfs.io/f/new-key", key: "new-key" },
      deleteFile
    );

    expect(result).toEqual({ url: "https://utfs.io/f/new-key" });
    expect(prismaMock.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ avatar: "https://utfs.io/f/new-key" }),
      })
    );
  });
});
