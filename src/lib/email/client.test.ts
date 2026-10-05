import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendTransactionalEmail } from "./client";

const ORIGINAL_ENV = { ...process.env };

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    process.env.BREVO_TRANSACTIONAL_API_KEY = "test-api-key";
    process.env.BREVO_SENDER_EMAIL = "no-reply@arcanadomine.it";
    process.env.BREVO_SENDER_NAME = "Arcana Domine";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("calls the Brevo HTTP API with the expected payload and auth header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageId: "abc" }), {
        status: 201,
      })
    );

    await sendTransactionalEmail({
      to: { email: "user@example.com" },
      subject: "Oggetto",
      htmlContent: "<p>Ciao</p>",
      textContent: "Ciao",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe(
      "test-api-key"
    );
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: "no-reply@arcanadomine.it", name: "Arcana Domine" },
      to: [{ email: "user@example.com" }],
      subject: "Oggetto",
      htmlContent: "<p>Ciao</p>",
      textContent: "Ciao",
    });
  });

  it("normalizes a single recipient into an array and defaults the sender name", async () => {
    delete process.env.BREVO_SENDER_NAME;
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendTransactionalEmail({
      to: { email: "a@example.com" },
      subject: "S",
      htmlContent: "<p>x</p>",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual([{ email: "a@example.com" }]);
    expect(body.sender.name).toBe("Arcana Domine");
  });

  it("throws without calling fetch when BREVO_TRANSACTIONAL_API_KEY is missing", async () => {
    delete process.env.BREVO_TRANSACTIONAL_API_KEY;
    const fetchSpy = vi.spyOn(global, "fetch");

    await expect(
      sendTransactionalEmail({
        to: { email: "a@example.com" },
        subject: "S",
        htmlContent: "<p>x</p>",
      })
    ).rejects.toThrow(/BREVO_TRANSACTIONAL_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws without calling fetch when BREVO_SENDER_EMAIL is missing", async () => {
    delete process.env.BREVO_SENDER_EMAIL;
    const fetchSpy = vi.spyOn(global, "fetch");

    await expect(
      sendTransactionalEmail({
        to: { email: "a@example.com" },
        subject: "S",
        htmlContent: "<p>x</p>",
      })
    ).rejects.toThrow(/BREVO_SENDER_EMAIL/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws with the response body when Brevo responds with a non-2xx status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("quota exceeded", {
        status: 402,
        statusText: "Payment Required",
      })
    );

    await expect(
      sendTransactionalEmail({
        to: { email: "a@example.com" },
        subject: "S",
        htmlContent: "<p>x</p>",
      })
    ).rejects.toThrow(/402/);
  });
});
