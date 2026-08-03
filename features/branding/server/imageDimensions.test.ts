import { describe, expect, it } from "vitest";
import { readRasterImageDimensions } from "./imageDimensions";

describe("readRasterImageDimensions", () => {
  it("reads dimensions from a PNG header", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1024);
    view.setUint32(20, 512);
    expect(readRasterImageDimensions(bytes)).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("rejects unknown image data", () => {
    expect(readRasterImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
