import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingMediaAsset } from "@/features/marketing/media/types";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

import {
  MARKETING_MEDIA_CONTENT_BUCKET,
  publishMarketingPageMediaDraft,
  saveMarketingPageMediaDraft,
} from "@/features/marketing/media/server";

class FakeStorage {
  private readonly buckets = new Map<string, Map<string, Uint8Array>>();
  private readonly downloadFailures = new Map<string, { statusCode: number; message: string }>();
  private afterUpload: ((bucket: string, path: string) => void) | null = null;

  from = (bucket: string) => ({
    download: async (path: string) => {
      const key = `${bucket}:${path}`;
      const failure = this.downloadFailures.get(key);
      if (failure) {
        this.downloadFailures.delete(key);
        return { data: null, error: failure };
      }

      const value = this.bucket(bucket).get(path);
      if (!value) {
        return {
          data: null,
          error: { statusCode: 404, message: "Object not found" },
        };
      }

      return {
        data: {
          text: async () => Buffer.from(value).toString("utf8"),
        },
        error: null,
      };
    },
    upload: async (
      path: string,
      body: Uint8Array,
      options?: { upsert?: boolean },
    ) => {
      const map = this.bucket(bucket);
      if (!options?.upsert && map.has(path)) {
        return {
          data: null,
          error: {
            statusCode: 409,
            code: "ResourceAlreadyExists",
            message: "Resource already exists",
          },
        };
      }

      map.set(path, new Uint8Array(body));
      this.afterUpload?.(bucket, path);
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      const map = this.bucket(bucket);
      for (const path of paths) map.delete(path);
      return { data: null, error: null };
    },
    list: async () => ({ data: [], error: null }),
  });

  seedJson(bucket: string, path: string, value: unknown) {
    this.bucket(bucket).set(path, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
  }

  failNextDownload(bucket: string, path: string) {
    this.downloadFailures.set(`${bucket}:${path}`, {
      statusCode: 500,
      message: "Temporary storage failure",
    });
  }

  onNextReservationUpload(callback: (path: string) => void) {
    this.afterUpload = (bucket, path) => {
      if (
        bucket === MARKETING_MEDIA_CONTENT_BUCKET &&
        path.startsWith(`assigning/${A.id}/`)
      ) {
        this.afterUpload = null;
        callback(path);
      }
    };
  }

  has(bucket: string, path: string) {
    return this.bucket(bucket).has(path);
  }

  hasPrefix(bucket: string, prefix: string) {
    return Array.from(this.bucket(bucket).keys()).some((path) => path.startsWith(prefix));
  }

  private bucket(name: string) {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(name, bucket);
    }
    return bucket;
  }
}

const A: MarketingMediaAsset = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "image",
  url: "https://example.com/a.jpg",
  storagePath: "uploads/a.jpg",
  filename: "a.jpg",
  contentType: "image/jpeg",
  alt: "A alt",
  caption: null,
  createdAt: "2026-10-15T00:00:00.000Z",
};

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  mocks.createAdminSupabase.mockReset();
  mocks.createAdminSupabase.mockReturnValue({ storage: { from: storage.from } });
  storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, `assets/${A.id}.json`, A);
});

describe("marketing media library deletion fence compatibility", () => {
  it("blocks draft assignment while an active library deletion fence exists", async () => {
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, `library-deleting/${A.id}.json`, {
      assetId: A.id,
      state: "deleting",
    });

    await expect(saveMarketingPageMediaDraft("home", "hero", A)).rejects.toThrow(
      "Marketing media asset is unavailable",
    );

    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json")).toBe(false);
    expect(storage.hasPrefix(MARKETING_MEDIA_CONTENT_BUCKET, `assigning/${A.id}/`)).toBe(false);
  });

  it("blocks publish reservations while a terminal library deletion fence exists", async () => {
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json", {
      draft: A,
      published: null,
      publishedAt: null,
    });
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, `library-deleted/${A.id}.json`, {
      assetId: A.id,
      state: "deleted",
    });

    expect(await publishMarketingPageMediaDraft("home", "hero")).toBeNull();
    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/published.json")).toBe(false);
    expect(storage.hasPrefix(MARKETING_MEDIA_CONTENT_BUCKET, `assigning/${A.id}/`)).toBe(false);
  });

  it("removes a reservation when a library fence appears between the two availability checks", async () => {
    storage.onNextReservationUpload(() => {
      storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, `library-deleting/${A.id}.json`, {
        assetId: A.id,
        state: "deleting",
      });
    });

    await expect(saveMarketingPageMediaDraft("home", "hero", A)).rejects.toThrow(
      "Marketing media asset became unavailable before assignment",
    );

    expect(storage.hasPrefix(MARKETING_MEDIA_CONTENT_BUCKET, `assigning/${A.id}/`)).toBe(false);
    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json")).toBe(false);
  });

  it("removes a reservation when the post-create library fence read fails", async () => {
    storage.onNextReservationUpload(() => {
      storage.failNextDownload(
        MARKETING_MEDIA_CONTENT_BUCKET,
        `library-deleting/${A.id}.json`,
      );
    });

    await expect(saveMarketingPageMediaDraft("home", "hero", A)).rejects.toThrow(
      "Marketing media read failed",
    );

    expect(storage.hasPrefix(MARKETING_MEDIA_CONTENT_BUCKET, `assigning/${A.id}/`)).toBe(false);
    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json")).toBe(false);
  });
});
