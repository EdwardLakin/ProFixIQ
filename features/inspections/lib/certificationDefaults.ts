// Defaults for the certification block of an imported fleet form: the station
// is the shop, and the licence number is the signing technician's, which the
// workforce module already stores as a staff certification.

export type StaffCertificationLike = {
  cert_type?: string | null;
  cert_name?: string | null;
  cert_number?: string | null;
  issuing_body?: string | null;
  expiry_date?: string | null;
  status?: string | null;
};

export type ShopLike = {
  name?: string | null;
  shop_name?: string | null;
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

const INSPECTION_LICENSE_RE = /inspect|cvip|licen[sc]e/i;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCurrent(cert: StaffCertificationLike, today: string): boolean {
  const status = clean(cert.status).toLowerCase();
  if (status && status !== "active") return false;
  const expiry = clean(cert.expiry_date);
  return !expiry || expiry >= today;
}

/**
 * The technician's inspection licence number, or null when there is no clear
 * answer. A certification that reads as an inspection licence wins; failing
 * that, a technician with exactly one current numbered certification is
 * unambiguous. Guessing between several unrelated certifications would put
 * the wrong number on a regulatory form, so that is left blank.
 */
export function pickInspectionLicenseNumber(
  certs: readonly StaffCertificationLike[],
  today: string,
): string | null {
  const numbered = certs.filter(
    (cert) => clean(cert.cert_number) && isCurrent(cert, today),
  );

  const licenceLike = numbered.filter((cert) =>
    INSPECTION_LICENSE_RE.test(
      [cert.cert_type, cert.cert_name, cert.issuing_body].map(clean).join(" "),
    ),
  );
  const pool = licenceLike.length > 0 ? licenceLike : numbered;
  if (pool.length === 0) return null;

  // Latest expiry first; an open-ended certification outranks a dated one.
  const ranked = [...pool].sort((a, b) =>
    (clean(b.expiry_date) || "9999-12-31").localeCompare(
      clean(a.expiry_date) || "9999-12-31",
    ),
  );

  if (licenceLike.length === 0 && ranked.length > 1) return null;
  return clean(ranked[0].cert_number);
}

export function shopStationName(shop: ShopLike | null | undefined): string {
  return clean(shop?.business_name) || clean(shop?.shop_name) || clean(shop?.name);
}

export function shopStationLocation(shop: ShopLike | null | undefined): string {
  if (!shop) return "";
  const cityLine = [clean(shop.city), clean(shop.province)]
    .filter(Boolean)
    .join(", ");
  return [clean(shop.address), cityLine, clean(shop.postal_code)]
    .filter(Boolean)
    .join(", ");
}
