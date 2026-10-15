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
  deleteMarketingMediaAsset,
  getMarketingPageMediaDocument,
  MARKETING_MEDIA_BUCKET,
  MARKETING_MEDIA_CONTENT_BUCKET,
  publishMarketingPageMediaDraft,
  saveMarketingPageMediaDraft,
  updateMarketingMediaAssetMetadata,
} from "@/features/marketing/media/server";

class FakeStorage {
  private readonly buckets = new Map<string, Map<string, Uint8Array>>();
  private readonly downloadFailures = new Map<string, { statusCode: number; message: string }>();
  private gate:
    | {
        predicate: (bucket: string, path: string, text: string) => boolean;
        fired: boolean;
        reached: () => void;
        wait: Promise<void>;
        release: () => void;
      }
    | null = null;

  from = (bucket: string) => ({
    download: async (path: string) => {
      const failureKey = `${bucket}:${path}`;
      const failure = this.downloadFailures.get(failureKey);
      if (failure) {
        this.downloadFailures.delete(failureKey);
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

      const bytes = new Uint8Array(body);
      const text = Buffer.from(bytes).toString("utf8");
      const gate = this.gate;
      if (gate && !gate.fired && gate.predicate(bucket, path, text)) {
        gate.fired = true;
        gate.reached();
        await gate.wait;
      }

      map.set(path, bytes);
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      const map = this.bucket(bucket);
      for (const path of paths) map.delete(path);
      return { data: null, error: null };
    },
    list: async (prefix: string, options?: { limit?: number }) => {
      const map = this.bucket(bucket);
      const normalized = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
      const names = Array.from(map.keys())
        .filter((path) => path.startsWith(normalized))
        .map((path) => path.slice(normalized.length))
        .filter((name) => name && !name.includes("/"))
        .slice(0, options?.limit ?? 100)
        .map((name) => ({ name }));
      return { data: names, error: null };
    },
  });

  seedJson(bucket: string, path: string, value: unknown) {
    this.bucket(bucket).set(path, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
  }

  seedObject(bucket: string, path: string) {
    this.bucket(bucket).set(path, Buffer.from("media", "utf8"));
  }

  failNextDownload(bucket: string, path: string) {
    this.downloadFailures.set(`${bucket}:${path}`, {
      statusCode: 500,
      message: "Temporary storage failure",
    });
  }

  remove(bucket: string, path: string) {
    this.bucket(bucket).delete(path);
  }

  has(bucket: string, path: string) {
    return this.bucket(bucket).has(path);
  }

  readJson<T>(bucket: string, path: string): T | null {
    const value = this.bucket(bucket).get(path);
    return value ? (JSON.parse(Buffer.from(value).toString("utf8")) as T) : null;
  }

  blockNextUpload(
    predicate: (bucket: string, path: string, text: string) => boolean,
  ) {
    let markReached!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = {
      predicate,
      fired: false,
      reached: markReached,
      wait,
      release,
    };
    return { reached, release };
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

const asset = (id: string, name: string): MarketingMediaAsset => ({
  id,
  kind: "image",
  url: `https://example.com/${name}.jpg`,
  storagePath: `uploads/${name}.jpg`,
  filename: `${name}.jpg`,
  contentType: "image/jpeg",
  alt: `${name} alt`,
  caption: null,
  createdAt: "2026-10-15T00:00:00.000Z",
});

const A = asset("11111111-1111-4111-8111-111111111111", "a");
const C = asset("33333333-3333-4333-8333-333333333333", "c");

const actor = {
  operatorId: "operator-1",
  operatorEmail: "operator@example.com",
};

let storage: FakeStorage;

async function waitForStored(path: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (storage.has(MARKETING_MEDIA_CONTENT_BUCKET, path)) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

beforeEach(() => {
  storage = new FakeStorage();
  mocks.createAdminSupabase.mockReset();
  mocks.createAdminSupabase.mockReturnValue({ storage: { from: storage.from } });
  storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, `assets/${A.id}.json`, A);
  storage.seedObject(MARKETING_MEDIA_BUCKET, A.storagePath);
});

describe("marketing media concurrency", () => {
  it("lets an in-flight draft assignment finish before deletion evaluates usage", async () => {
    const gate = storage.blockNextUpload(
      (bucket, path) =>
        bucket === MARKETING_MEDIA_CONTENT_BUCKET &&
        path === "pages/home/hero/draft.json",
    );

    const save = saveMarketingPageMediaDraft("home", "hero", A);
    await gate.reached;

    const deleting = deleteMarketingMediaAsset(A.id, actor);
    await waitForStored(`deleting/${A.id}.json`);
    gate.release();

    await save;
    const result = await deleting;

    expect(result.deleted).toBe(false);
    expect(result.usages).toEqual(
      expect.arrayContaining([expect.objectContaining({ pageKey: "home", slotKey: "hero", state: "draft" })]),
    );
    expect(storage.has(MARKETING_MEDIA_BUCKET, A.storagePath)).toBe(true);
    expect(
      storage.readJson<{ draft: MarketingMediaAsset }>(
        MARKETING_MEDIA_CONTENT_BUCKET,
        "pages/home/hero/draft.json",
      )?.draft.id,
    ).toBe(A.id);
  });

  it("does not roll back a publication when deletion starts during its reserved write", async () => {
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json", {
      draft: A,
      published: null,
      publishedAt: null,
    });
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/published.json", {
      draft: null,
      published: C,
      publishedAt: "2026-10-14T00:00:00.000Z",
    });

    const gate = storage.blockNextUpload(
      (bucket, path) =>
        bucket === MARKETING_MEDIA_CONTENT_BUCKET &&
        path === "pages/home/hero/published.json",
    );

    const publishing = publishMarketingPageMediaDraft("home", "hero");
    await gate.reached;

    const deleting = deleteMarketingMediaAsset(A.id, actor);
    await waitForStored(`deleting/${A.id}.json`);
    gate.release();

    expect(await publishing).toEqual(A);
    const result = await deleting;

    expect(result.deleted).toBe(false);
    expect(
      storage.readJson<{ published: MarketingMediaAsset }>(
        MARKETING_MEDIA_CONTENT_BUCKET,
        "pages/home/hero/published.json",
      )?.published.id,
    ).toBe(A.id);
    expect(storage.has(MARKETING_MEDIA_BUCKET, A.storagePath)).toBe(true);
  });

  it("keeps terminal deletion authoritative when a stale blocked delete writes failed later", async () => {
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json", {
      draft: A,
      published: null,
      publishedAt: null,
    });

    const gate = storage.blockNextUpload(
      (bucket, path, text) =>
        bucket === MARKETING_MEDIA_CONTENT_BUCKET &&
        path === `deleting/${A.id}.json` &&
        text.includes('"state": "failed"'),
    );

    const staleDelete = deleteMarketingMediaAsset(A.id, actor);
    await gate.reached;

    storage.remove(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/draft.json");
    const winningDelete = await deleteMarketingMediaAsset(A.id, {
      operatorId: "operator-2",
      operatorEmail: "operator2@example.com",
    });
    expect(winningDelete.deleted).toBe(true);

    gate.release();
    expect((await staleDelete).deleted).toBe(false);

    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, `deleted/${A.id}.json`)).toBe(true);
    expect(storage.has(MARKETING_MEDIA_BUCKET, A.storagePath)).toBe(false);
    expect(await updateMarketingMediaAssetMetadata(A.id, { alt: "changed", caption: null })).toBeNull();
    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, `assets/${A.id}.json`)).toBe(false);
  });

  it("expires abandoned assignment reservations so deletion can recover", async () => {
    storage.seedJson(
      MARKETING_MEDIA_CONTENT_BUCKET,
      `assigning/${A.id}/abandoned.json`,
      {
        assetId: A.id,
        reservationId: "abandoned",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    );

    const result = await deleteMarketingMediaAsset(A.id, actor);

    expect(result.deleted).toBe(true);
    expect(storage.has(MARKETING_MEDIA_CONTENT_BUCKET, `assigning/${A.id}/abandoned.json`)).toBe(false);
    expect(storage.has(MARKETING_MEDIA_BUCKET, A.storagePath)).toBe(false);
  });

  it("preserves embedded published media when a terminal tombstone read fails transiently", async () => {
    storage.seedJson(MARKETING_MEDIA_CONTENT_BUCKET, "pages/home/hero/published.json", {
      draft: null,
      published: A,
      publishedAt: "2026-10-14T00:00:00.000Z",
    });
    storage.failNextDownload(MARKETING_MEDIA_CONTENT_BUCKET, `deleted/${A.id}.json`);

    const document = await getMarketingPageMediaDocument("home");

    expect(document.slots.hero?.published?.id).toBe(A.id);
  });
});
