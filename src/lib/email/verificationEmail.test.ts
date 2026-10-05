import { describe, it, expect, vi } from "vitest";
import { sendVerificationEmail } from "./verificationEmail";
import { sendTransactionalEmail } from "./client";

vi.mock("./client", () => ({ sendTransactionalEmail: vi.fn() }));

// Riproduce solo la forma del token generato da Better Auth
// (`createEmailVerificationToken`) che ci interessa qui: un payload JWT
// leggibile senza verificarne la firma (vedi `isChangeEmailToken`).
const fakeToken = (payload: Record<string, unknown>): string =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const signupToken = fakeToken({ email: "user@example.com" });
const changeEmailToken = fakeToken({
  email: "old@example.com",
  updateTo: "user@example.com",
});

describe("sendVerificationEmail", () => {
  it("sends an Italian signup email with subject and a body containing the verification link", async () => {
    const url =
      "http://localhost:3000/api/auth/verify-email?token=abc123&callbackURL=%2F";

    await sendVerificationEmail({
      to: "user@example.com",
      url,
      token: signupToken,
    });

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.to).toEqual({ email: "user@example.com" });
    expect(call.subject).toMatch(/conferma/i);
    expect(call.subject).not.toMatch(/nuovo indirizzo/i);
    expect(call.htmlContent).toContain(url);
    expect(call.htmlContent).toContain("http://localhost:3000/email/logo.png");
    expect(call.htmlContent).toMatch(/registrazione/i);
    expect(call.textContent).toContain(url);
  });

  it("sends a distinct copy when the token carries a change-email request (updateTo)", async () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=def456";

    await sendVerificationEmail({
      to: "user@example.com",
      url,
      token: changeEmailToken,
    });

    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.subject).toMatch(/nuovo indirizzo/i);
    expect(call.htmlContent).toMatch(/cambiare l'indirizzo email/i);
    expect(call.htmlContent).not.toMatch(/registrazione/i);
  });

  it("propagates errors from the underlying transactional client (never swallowed)", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(
      new Error("Brevo down")
    );

    await expect(
      sendVerificationEmail({
        to: "user@example.com",
        url: "http://x",
        token: signupToken,
      })
    ).rejects.toThrow("Brevo down");
  });
});
