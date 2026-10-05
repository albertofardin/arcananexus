import { describe, it, expect } from "vitest";
import Loading from "./loading";
import { render } from "@/test/helpers/test-utils";

describe("Root Loading State", () => {
  it("should render loading skeletons", () => {
    const { container } = render(<Loading />);

    // Check for skeleton elements
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("should render a full-viewport centered fallback", () => {
    const { container } = render(<Loading />);

    const root = container.querySelector(".h-screen");
    expect(root).toBeInTheDocument();
  });
});
