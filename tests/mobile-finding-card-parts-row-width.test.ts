// tests/mobile-finding-card-parts-row-width.test.ts
//
// Regression guard for the mobile inspection finding-card Parts row.
//
// `.mobile-command-route` forces every plain input to `width: 100%` so
// route-level controls stack full-width by default. A handful of controls
// (Labor hours, part Qty, the "No parts required" checkboxes) are meant to
// stay small and inline instead, and opt out via the `.pfx-inline-field`
// marker class in app/mobile/mobile-route-surfaces.css.
//
// That opt-out previously worked by declaring `width: auto !important` on
// `.pfx-inline-field`. Because `.mobile-command-route .pfx-inline-field`
// (two classes) is *more specific* than a bare Tailwind width utility like
// `.w-14` (one class), that declaration didn't just cancel the forced
// `width: 100%` -- it also beat each control's own intended fixed width,
// so `w-14`/`w-16` were silently dropped in favor of the browser's native
// (much wider) `input[type=number]` intrinsic width. In the Parts row,
// that made the Qty input balloon and squeeze the Part description input
// down to an unusable sliver on real phones.
//
// The fix excludes `.pfx-inline-field` from the forced-width rule instead
// of re-asserting its own competing width, so each control's own Tailwind
// width utility governs its size again. This test renders the same class
// combinations used by SectionDisplay.tsx against the real stylesheet and
// asserts the cascade resolves to the intended widths.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const routeSurfacesCss = readFileSync(
  "app/mobile/mobile-route-surfaces.css",
  "utf8",
);

// Minimal stand-ins for the Tailwind utilities actually involved, matching
// what the real build emits for these classes.
const tailwindStub = `
  .w-14 { width: 3.5rem }
  .w-16 { width: 4rem }
  .w-4 { width: 1rem }
  .flex-1 { flex: 1 1 0% }
  .min-w-0 { min-width: 0px }
  .shrink-0 { flex-shrink: 0 }
`;

function renderPartsRow() {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${tailwindStub}\n${routeSurfacesCss}</style></head>
    <body>
      <div class="mobile-command-route mobile-command-route--inspections">
        <div class="flex items-center gap-1.5">
          <input class="min-w-0 flex-1" placeholder="Part description" />
          <input class="pfx-inline-field h-9 w-14 shrink-0" type="number" placeholder="Qty" />
        </div>
        <input class="pfx-inline-field h-9 w-16 shrink-0" type="number" placeholder="0.0" />
        <input class="pfx-inline-field h-4 w-4 shrink-0" type="checkbox" />
      </div>
    </body></html>`,
    { pretendToBeVisual: true },
  );
  return dom;
}

describe("mobile finding-card Parts row width cascade", () => {
  it("gives the Qty input its small fixed width instead of the native input width", () => {
    const dom = renderPartsRow();
    const qtyInput = dom.window.document.querySelector(
      'input[placeholder="Qty"]',
    ) as Element;
    expect(dom.window.getComputedStyle(qtyInput).width).toBe("3.5rem");
  });

  it("leaves the Part description input free to flex (not forced to a fixed px width)", () => {
    const dom = renderPartsRow();
    const descriptionInput = dom.window.document.querySelector(
      'input[placeholder="Part description"]',
    ) as Element;
    // It still resolves the route-wide width:100% (harmless -- flex-basis
    // from `.flex-1` governs actual layout sizing, same as before this fix),
    // it must NOT have picked up a competing fixed rem width.
    const width = dom.window.getComputedStyle(descriptionInput).width;
    expect(width).not.toMatch(/rem$/);
  });

  it("gives the Labor input its own small fixed width", () => {
    const dom = renderPartsRow();
    const laborInput = dom.window.document.querySelector(
      'input[placeholder="0.0"]',
    ) as Element;
    expect(dom.window.getComputedStyle(laborInput).width).toBe("4rem");
  });

  it("does not regress the existing checkbox width exclusion", () => {
    const dom = renderPartsRow();
    const checkbox = dom.window.document.querySelector(
      'input[type="checkbox"]',
    ) as Element;
    expect(dom.window.getComputedStyle(checkbox).width).toBe("auto");
  });

  it("source: the forced full-width rule excludes .pfx-inline-field instead of re-asserting a competing width", () => {
    expect(routeSurfacesCss).toContain(
      ".mobile-command-route input:not(.pfx-inline-field),",
    );
    expect(routeSurfacesCss).not.toContain(
      ".mobile-command-route .pfx-inline-field {\n  width: auto !important;\n}",
    );
  });
});
