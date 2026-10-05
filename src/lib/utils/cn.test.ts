import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn utility", () => {
  it("should merge class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("should handle conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("should merge tailwind classes correctly", () => {
    // tailwind-merge should keep the last conflicting class
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should handle undefined and null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("should handle arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("should handle objects", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });
});
