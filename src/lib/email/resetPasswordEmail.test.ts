import { describe, it, expect, vi } from "vitest";
import { sendResetPasswordEmail } from "./resetPasswordEmail";
import { sendTransactionalEmail } from "./client";

vi.mock("./client", () => ({ sendTransactionalEmail: vi.fn() }));

describe("sendResetPasswordEmail", () => {
  it("sends an Italian email with subject and a body containing the reset link", async () => {
    const url =
      "http://localhost:3000/api/auth/reset-password/abc123?callbackURL=%2F";

    await sendResetPasswordEmail({ to: "user@example.com", url });

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.to).toEqual({ email: "user@example.com" });
    expect(call.subject).toMatch(/password/i);
    expect(call.htmlContent).toContain(url);
    expect(call.htmlContent).toContain("http://localhost:3000/email/logo.png");
    expect(call.textContent).toContain(url);
  });

  it("propagates errors from the underlying transactional client (never swallowed)", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(
      new Error("Brevo down")
    );

    await expect(
      sendResetPasswordEmail({ to: "user@example.com", url: "http://x" })
    ).rejects.toThrow("Brevo down");
  });
});
