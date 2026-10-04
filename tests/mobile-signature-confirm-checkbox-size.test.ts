// tests/mobile-signature-confirm-checkbox-size.test.ts
//
// Regression guard: the inspection signature "I confirm..." checkbox was
// invisible on mobile (a thin vertical bar). `@tailwindcss/forms` renders
// checkboxes with `appearance: none`, and
// `.mobile-command-route input[type="checkbox"] { width: auto }` out-ranks both
// the plugin's 1rem and the control's own `w-3.5`, collapsing the box to its
// border. `.pfx-sized-checkbox` opts a checkbox into an explicit size that wins.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const routeSurfacesCss = readFileSync(
  "app/mobile/mobile-route-surfaces.css",
  "utf8",
);
const signaturePanelSource = readFileSync(
  "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
  "utf8",
);

// Stand-ins for what Tailwind + @tailwindcss/forms emit for these controls.
const stub = `
  [type='checkbox'] { appearance: none; width: 1rem; height: 1rem }
  .w-3\\.5 { width: 0.875rem }
  .h-3\\.5 { height: 0.875rem }
`;

function render() {
  return new JSDOM(
    `<!doctype html><html><head><style>${stub}\n${routeSurfacesCss}</style></head>
    <body>
      <div class="mobile-command-route mobile-command-route--inspections">
        <label>
          <input id="confirm" class="pfx-sized-checkbox h-3.5 w-3.5 shrink-0" type="checkbox" />
        </label>
        <label>
          <input id="plain" class="h-4 w-4" type="checkbox" />
        </label>
      </div>
    </body></html>`,
    { pretendToBeVisual: true },
  );
}

describe("mobile sized checkbox opt-in", () => {
  it("gives an opted-in checkbox a real, visible box", () => {
    const dom = render();
    const el = dom.window.document.getElementById("confirm") as Element;
    const style = dom.window.getComputedStyle(el);
    expect(style.width).toBe("1.25rem");
    expect(style.height).toBe("1.25rem");
  });

  it("leaves other checkboxes on the existing width:auto behavior", () => {
    const dom = render();
    const el = dom.window.document.getElementById("plain") as Element;
    expect(dom.window.getComputedStyle(el).width).toBe("auto");
  });

  it("source: the signature confirmation checkbox uses the opt-in class", () => {
    const checkbox = signaturePanelSource.match(
      /<input\s+type="checkbox"[\s\S]*?\/>/,
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox?.[0]).toContain("pfx-sized-checkbox");
  });
});
