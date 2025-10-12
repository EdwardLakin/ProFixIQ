export type OcrRegistrationFields = {
  vin?: string | null;
  plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

export async function ocrRegistration(imageUrl: string) {
  const res = await fetch("/api/ocr/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) throw new Error(`OCR failed (${res.status})`);
  return (await res.json()) as {
    ok: boolean;
    fields: OcrRegistrationFields;
    note?: string;
  };
}