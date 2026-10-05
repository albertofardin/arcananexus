import { describe, it, expect } from "vitest";
import { authorizeSupportAttachmentUpload } from "./supportAttachmentUpload";

describe("authorizeSupportAttachmentUpload", () => {
  it("rejects an unauthenticated request", async () => {
    const result = await authorizeSupportAttachmentUpload({ userId: null });

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Non autenticato",
    });
  });

  it("authorizes any authenticated user, no role/campaign required", async () => {
    const result = await authorizeSupportAttachmentUpload({ userId: "user-1" });

    expect(result).toEqual({ ok: true, context: {} });
  });
});
