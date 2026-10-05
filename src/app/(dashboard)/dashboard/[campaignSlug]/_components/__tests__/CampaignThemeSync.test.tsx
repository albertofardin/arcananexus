import { describe, it, expect } from "vitest";
import CampaignThemeSync from "../CampaignThemeSync";
import { render, cleanup } from "@/test/helpers/test-utils";
import { defaultColor, defaultTexture } from "@/app/themes";

describe("CampaignThemeSync", () => {
  it("applies the campaign color and texture to <html> on mount", () => {
    render(<CampaignThemeSync color="amethyst" texture="texture_fallout" />);

    expect(document.documentElement.getAttribute("data-color")).toBe(
      "amethyst"
    );
    expect(document.documentElement.getAttribute("data-texture")).toBe(
      "texture_fallout"
    );

    cleanup();
  });

  it("updates data-color/data-texture when the campaign changes", () => {
    const { rerender } = render(
      <CampaignThemeSync color="amethyst" texture="texture_fallout" />
    );

    rerender(<CampaignThemeSync color="gold" texture="none" />);

    expect(document.documentElement.getAttribute("data-color")).toBe("gold");
    expect(document.documentElement.getAttribute("data-texture")).toBe("none");

    cleanup();
  });

  it("restores the default color/texture on unmount", () => {
    const { unmount } = render(
      <CampaignThemeSync color="amethyst" texture="texture_fallout" />
    );

    unmount();

    expect(document.documentElement.getAttribute("data-color")).toBe(
      defaultColor
    );
    expect(document.documentElement.getAttribute("data-texture")).toBe(
      defaultTexture
    );
  });
});
