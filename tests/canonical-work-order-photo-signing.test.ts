import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [
    {
      shop_id: "shop-a",
      work_order_id: "work-order-a",
      storage_bucket: "job-photos",
      storage_path: "wo/work-order-a/lines/line-a/internal.jpg",
      visibility: "internal",
    },
    {
      shop_id: "shop-a",
      work_order_id: "work-order-a",
      storage_bucket: "job-photos",
      storage_path: "wo/work-order-a/lines/line-a/customer.jpg",
      visibility: "customer",
    },
  ],
  createSignedUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { signCanonicalWorkOrderPhotoUrls } from "@/features/inspections/server/signCanonicalWorkOrderPhotoUrls";

function adminClient() {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((column: string, value: unknown) => {
    filters.push([column, value]);
    return query;
  });
  query.not.mockReturnValue(query);
  query.then.mockImplementation((resolve: (result: unknown) => unknown) =>
    Promise.resolve({
      data: mocks.rows.filter((row) =>
        filters.every(([column, value]) =>
          column in row
            ? row[column as keyof typeof row] === value
            : true,
        ),
      ),
      error: null,
    }).then(resolve),
  );
  return {
    from: vi.fn(() => query),
    storage: {
      from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })),
    },
  };
}

describe("canonical Work Order photo signing", () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.createSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed.test/${path}` },
      error: null,
    }));
  });

  it("omits internal report evidence for portal actors", async () => {
    const urls = await signCanonicalWorkOrderPhotoUrls({
      admin: adminClient() as never,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      customerVisibleOnly: true,
      urls: [
        "/storage/v1/object/public/job-photos/wo/work-order-a/lines/line-a/internal.jpg",
        "/storage/v1/object/public/job-photos/wo/work-order-a/lines/line-a/customer.jpg",
      ],
    });

    expect(urls).toEqual([
      null,
      "https://signed.test/wo/work-order-a/lines/line-a/customer.jpg",
    ]);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("allows canonical internal evidence for staff PDF rendering", async () => {
    const [url] = await signCanonicalWorkOrderPhotoUrls({
      admin: adminClient() as never,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      urls: ["wo/work-order-a/lines/line-a/internal.jpg"],
    });
    expect(url).toBe(
      "https://signed.test/wo/work-order-a/lines/line-a/internal.jpg",
    );
  });
});
