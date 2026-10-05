import { describe, it, expect, vi } from "vitest";
import { sendNotificationEmail, campaignColorHex } from "./notificationEmail";
import { sendTransactionalEmail } from "./client";

vi.mock("./client", () => ({ sendTransactionalEmail: vi.fn() }));

describe("sendNotificationEmail", () => {
  it("includes the campaign header (color + logo), heading and CTA link", async () => {
    await sendNotificationEmail({
      to: "user@example.com",
      subject: "Nuova missiva — Nuova Frontiera",
      heading: "In Nuova Frontiera è arrivata una nuova missiva per Aria",
      ctaLabel: "Leggi la missiva",
      ctaUrl: "http://localhost:3000/dashboard/nuova-frontiera/missive/1",
      campaignName: "Nuova Frontiera",
      campaignLogo: "https://utfs.io/f/campaign-logo.png",
      colorHex: "#0f62fe",
    });

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.to).toEqual({ email: "user@example.com" });
    expect(call.subject).toBe("Nuova missiva — Nuova Frontiera");
    expect(call.htmlContent).toContain("Nuova Frontiera");
    expect(call.htmlContent).toContain("https://utfs.io/f/campaign-logo.png");
    expect(call.htmlContent).toContain("#0f62fe");
    expect(call.htmlContent).toContain(
      "In Nuova Frontiera è arrivata una nuova missiva per Aria"
    );
    expect(call.htmlContent).toContain(
      "http://localhost:3000/dashboard/nuova-frontiera/missive/1"
    );
    expect(call.htmlContent).toContain("/dashboard/profile");
    expect(call.textContent).toContain("Nuova Frontiera");
    expect(call.textContent).toContain(
      "http://localhost:3000/dashboard/nuova-frontiera/missive/1"
    );
  });

  it("omits the campaign header when no campaign is given (Supporto notifications)", async () => {
    await sendNotificationEmail({
      to: "user@example.com",
      subject: "Supporto — Arcana Domine",
      heading: "Hai ricevuto una risposta alla tua segnalazione di supporto",
      ctaLabel: "Vai alla segnalazione",
      ctaUrl: "http://localhost:3000/dashboard/profile/support/1",
    });

    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.htmlContent).not.toContain("border-radius: 50%");
  });

  it("propagates errors from the underlying transactional client (never swallowed)", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(
      new Error("Brevo down")
    );

    await expect(
      sendNotificationEmail({
        to: "user@example.com",
        subject: "x",
        heading: "x",
        ctaLabel: "x",
        ctaUrl: "http://x",
      })
    ).rejects.toThrow("Brevo down");
  });
});

describe("campaignColorHex", () => {
  it("maps a known CampaignColor to its swatch hex", () => {
    expect(campaignColorHex("cobalt")).toBe("#0f62fe");
  });

  it("falls back to a default hex for an unmapped value", () => {
    expect(campaignColorHex("not-a-color" as never)).toBe("#a4161a");
  });
});
