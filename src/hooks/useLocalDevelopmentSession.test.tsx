// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalDevelopmentSession } from "./useLocalDevelopmentSession";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLocalDevelopmentSession", () => {
  it("loads a local development user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { name: "Local User", email: "local@example.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLocalDevelopmentSession());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.user).toEqual({ name: "Local User", email: "local@example.com" });
    expect(fetchMock).toHaveBeenCalledWith("/api/local-development-session", {
      cache: "no-store",
      credentials: "include",
    });
  });

  it("falls back cleanly when local authentication is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));

    const { result } = renderHook(() => useLocalDevelopmentSession());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("does not block normal authentication when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useLocalDevelopmentSession());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.user).toBeNull();
  });
});
