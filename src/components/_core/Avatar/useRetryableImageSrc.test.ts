import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRetryableImageSrc } from "./useRetryableImageSrc";

describe("useRetryableImageSrc", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when no srcUrl is given", () => {
    const { result } = renderHook(() => useRetryableImageSrc(undefined));

    expect(result.current.src).toBeUndefined();
  });

  it("appends a `try` querystring to the first attempt too", () => {
    const { result } = renderHook(() =>
      useRetryableImageSrc("https://files.ufs.sh/f/avatar.jpg")
    );

    expect(result.current.src).toBe("https://files.ufs.sh/f/avatar.jpg?try=1");
  });

  it("appends with `&` when the src already has a querystring", () => {
    const { result } = renderHook(() =>
      useRetryableImageSrc("https://files.ufs.sh/f/avatar.jpg?v=2")
    );

    expect(result.current.src).toBe(
      "https://files.ufs.sh/f/avatar.jpg?v=2&try=1"
    );
  });

  it("retries with an incremented `try` after a failed load, up to retryMax", async () => {
    const { result } = renderHook(() =>
      useRetryableImageSrc("https://files.ufs.sh/f/avatar.jpg", 2)
    );

    act(() => result.current.onError());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.src).toBe("https://files.ufs.sh/f/avatar.jpg?try=2");

    // Secondo fallimento: retryMax (2) raggiunto, nessun altro tentativo —
    // il chiamante deve mostrare il fallback.
    act(() => result.current.onError());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.src).toBeUndefined();
  });

  it("leaves a local/relative path untouched (no retry querystring)", () => {
    const { result } = renderHook(() =>
      useRetryableImageSrc("/characters%20avatar%20mock/PNG/avatar.png")
    );

    expect(result.current.src).toBe(
      "/characters%20avatar%20mock/PNG/avatar.png"
    );
  });

  it("fails immediately on error for a local path, without retrying (a broken local asset never self-heals)", () => {
    const { result } = renderHook(() =>
      useRetryableImageSrc("/characters%20avatar%20mock/PNG/avatar.png")
    );

    act(() => result.current.onError());

    expect(result.current.src).toBeUndefined();
  });

  it("resets the retry count when srcUrl changes to a different image", async () => {
    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useRetryableImageSrc(src, 2),
      { initialProps: { src: "https://files.ufs.sh/f/old.jpg" } }
    );

    act(() => result.current.onError());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.src).toBe("https://files.ufs.sh/f/old.jpg?try=2");

    rerender({ src: "https://files.ufs.sh/f/new.jpg" });

    expect(result.current.src).toBe("https://files.ufs.sh/f/new.jpg?try=1");
  });
});
