import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVehiclePhotoUrl } from "./useVehiclePhotoUrl";

type MediaRow = { storage_path: string | null; created_at: string };
type MediaResult = { data: MediaRow[] | null; error: { message: string } | null };

function buildSupabase(mediaRows: () => MediaResult) {
  const createSignedUrls = vi.fn((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://signed.example/${path}`,
        error: null,
      })),
      error: null,
    }),
  );

  const mediaBuilder = {
    select: vi.fn(() => mediaBuilder),
    eq: vi.fn(() => mediaBuilder),
    order: vi.fn(() => mediaBuilder),
    limit: vi.fn(() => Promise.resolve(mediaRows())),
  };

  const from = vi.fn((table: string) => {
    if (table === "vehicle_media") return mediaBuilder;
    throw new Error(`Unexpected table: ${table}`);
  });

  const storage = { from: vi.fn(() => ({ createSignedUrls })) };

  return {
    supabase: { from, storage } as unknown as Parameters<
      typeof useVehiclePhotoUrl
    >[0],
    createSignedUrls,
    mediaBuilder,
  };
}

describe("useVehiclePhotoUrl", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns the signed URL for the newest photo, scoped to the vehicle and type", async () => {
    const { supabase, mediaBuilder } = buildSupabase(() => ({
      data: [{ storage_path: "veh-1/photo.jpg", created_at: "2026-01-02" }],
      error: null,
    }));

    const { result } = renderHook(() =>
      useVehiclePhotoUrl(supabase, "veh-1", 3600),
    );

    await waitFor(() =>
      expect(result.current).toBe("https://signed.example/veh-1/photo.jpg"),
    );

    expect(mediaBuilder.eq).toHaveBeenCalledWith("vehicle_id", "veh-1");
    expect(mediaBuilder.eq).toHaveBeenCalledWith("type", "photo");
  });

  it("skips a blank storage_path for an older valid one", async () => {
    // storage_path is nullable/blank-able in the schema; a stray blank row
    // must not shadow a real photo underneath it, matching the canonical
    // board view's own filter.
    const { supabase } = buildSupabase(() => ({
      data: [
        { storage_path: "   ", created_at: "2026-01-02" },
        { storage_path: "veh-1/older.jpg", created_at: "2026-01-01" },
      ],
      error: null,
    }));

    const { result } = renderHook(() =>
      useVehiclePhotoUrl(supabase, "veh-1", 3600),
    );

    await waitFor(() =>
      expect(result.current).toBe("https://signed.example/veh-1/older.jpg"),
    );
  });

  it("falls back to null on a query error or no rows, without throwing", async () => {
    const { supabase } = buildSupabase(() => ({
      data: null,
      error: { message: "boom" },
    }));

    const { result } = renderHook(() =>
      useVehiclePhotoUrl(supabase, "veh-1", 3600),
    );

    await waitFor(() => {
      // Nothing to assert asynchronously beyond "it never becomes a URL" --
      // give the effect a tick to run.
    });
    expect(result.current).toBeNull();

    const empty = buildSupabase(() => ({ data: [], error: null }));
    const { result: emptyResult } = renderHook(() =>
      useVehiclePhotoUrl(empty.supabase, "veh-2", 3600),
    );
    await waitFor(() => {});
    expect(emptyResult.current).toBeNull();
  });

  it("returns null immediately when there is no vehicle id, without querying", () => {
    const { supabase, mediaBuilder } = buildSupabase(() => ({
      data: [{ storage_path: "veh-1/photo.jpg", created_at: "2026-01-02" }],
      error: null,
    }));

    const { result } = renderHook(() =>
      useVehiclePhotoUrl(supabase, null, 3600),
    );

    expect(result.current).toBeNull();
    expect(mediaBuilder.limit).not.toHaveBeenCalled();
  });

  it("renews the signed URL before the TTL expires, without waiting for the vehicle to change", async () => {
    vi.useFakeTimers();
    const { supabase, createSignedUrls } = buildSupabase(() => ({
      data: [{ storage_path: "veh-1/photo.jpg", created_at: "2026-01-02" }],
      error: null,
    }));

    const { result } = renderHook(() =>
      useVehiclePhotoUrl(supabase, "veh-1", 100),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe("https://signed.example/veh-1/photo.jpg");
    expect(createSignedUrls).toHaveBeenCalledTimes(1);

    // renewInMs = max((100 - 60) * 1000, 30_000) = 40_000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("cancels a stale in-flight lookup so it cannot clobber a newer vehicle's result", async () => {
    let resolveFirst: (value: MediaResult) => void = () => {};
    const first = new Promise<MediaResult>((resolve) => {
      resolveFirst = resolve;
    });
    const mediaBuilder = {
      select: vi.fn(() => mediaBuilder),
      eq: vi.fn(() => mediaBuilder),
      order: vi.fn(() => mediaBuilder),
      limit: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(
          Promise.resolve({
            data: [{ storage_path: "veh-2/photo.jpg", created_at: "2026-01-02" }],
            error: null,
          }),
        ),
    };
    const createSignedUrls = vi.fn((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({
          path,
          signedUrl: `https://signed.example/${path}`,
          error: null,
        })),
        error: null,
      }),
    );
    const supabase = {
      from: vi.fn(() => mediaBuilder),
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    } as unknown as Parameters<typeof useVehiclePhotoUrl>[0];

    const { result, rerender } = renderHook(
      ({ vehicleId }: { vehicleId: string }) =>
        useVehiclePhotoUrl(supabase, vehicleId, 3600),
      { initialProps: { vehicleId: "veh-1" } },
    );

    rerender({ vehicleId: "veh-2" });
    await waitFor(() =>
      expect(result.current).toBe("https://signed.example/veh-2/photo.jpg"),
    );

    // The superseded veh-1 lookup resolving afterward must not overwrite
    // the already-correct veh-2 result.
    await act(async () => {
      resolveFirst({
        data: [{ storage_path: "veh-1/photo.jpg", created_at: "2026-01-01" }],
        error: null,
      });
      await Promise.resolve();
    });
    expect(result.current).toBe("https://signed.example/veh-2/photo.jpg");
  });
});
