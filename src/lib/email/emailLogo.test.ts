import { describe, it, expect } from "vitest";
import { buildLogoHtml } from "./emailLogo";

describe("buildLogoHtml", () => {
  it("points the img src at the origin of the given url", () => {
    const html = buildLogoHtml(
      "https://arcanadomine.netlify.app/api/auth/verify-email?token=abc"
    );

    expect(html).toContain(
      'src="https://arcanadomine.netlify.app/email/logo.png"'
    );
    expect(html).toContain('alt="Arcana Domine"');
  });
});
