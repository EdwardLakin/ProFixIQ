
"use client";

import { useState } from "react";

type Props = {
  onAgreeChange: (agreed: boolean) => void;
  defaultOpen?: boolean;
  /** Name to show in the first paragraph. Example: "Shop Test" */
  shopName?: string;
};

// NOTE: accept `any` at the export boundary to bypass Next’s
// “Props must be serializable” check, then cast internally.
export default function LegalTerms(rawProps: any) {
  const { onAgreeChange, defaultOpen = false, shopName = "the Shop" } = rawProps as Props;

  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [agreed, setAgreed] = useState<boolean>(false);

  return (
    <div className="mt-6 rounded border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-neutral-800 px-3 py-2 text-left"
      >
        <span className="font-semibold">Terms & Conditions</span>
        <span className="text-xs text-neutral-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="space-y-3 p-3 text-sm leading-6 text-neutral-200">
          <p>
            I authorize {shopName} (the “Shop”) to perform the listed inspections, diagnostics, and
            repairs (“Work”) on my vehicle. I agree the Shop may operate and test-drive the vehicle
            as needed for diagnosis and verification.
          </p>
          <p>
            <strong>Estimate &amp; Variance:</strong> Prices shown are good-faith estimates. Actual
            charges may vary due to parts availability, additional labor to safely complete the
            Work, and hidden damage. If additional Work is required that increases the estimate, the
            Shop will request approval before proceeding unless immediate action is required for
            safety or to prevent further damage.
          </p>
          <p>
            <strong>Parts &amp; Labor:</strong> New, remanufactured, or quality aftermarket parts
            may be used. Unless otherwise stated in writing, parts are warranted by their
            manufacturer and labor is warranted by the Shop for 12 months/12,000 miles (whichever
            occurs first). Normal wear items, fluids, maintenance adjustments, and customer-supplied
            parts are excluded.
          </p>
          {/* Storage & Fees + Mechanic's Lien sections intentionally removed */}
          <p>
            <strong>Limited Liability:</strong> The Shop is not responsible for loss or damage to
            the vehicle or articles left in the vehicle due to fire, theft, or causes beyond the
            Shop’s reasonable control.
          </p>
          <p>
            <strong>Electronic Authorization:</strong> By checking “I agree” and signing
            electronically, I certify I am the owner or authorized agent, I have read and agree to
            these terms, and my electronic authorization has the same force and effect as a written
            signature.
          </p>
        </div>
      )}

      <div className="flex items-start gap-2 border-t border-neutral-800 p-3">
        <input
          id="agree"
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={agreed}
          onChange={(e) => {
            const val = e.target.checked;
            setAgreed(val);
            onAgreeChange?.(val);
          }}
        />
        <label htmlFor="agree" className="text-sm text-neutral-200">
          I have read and agree to the Terms &amp; Conditions.
        </label>
      </div>
    </div>
  );
}
