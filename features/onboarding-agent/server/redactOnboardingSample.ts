function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) return value;
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

const SAFE_ID_KEYS = ["id", "vin", "invoice", "work order", "ro", "unit", "plate", "license", "stock", "sku", "part number"];

function shouldKeepRaw(key: string) {
  const normalized = key.toLowerCase();
  return SAFE_ID_KEYS.some((token) => normalized.includes(token));
}

export function redactOnboardingSample(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(row)) {
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (typeof value !== "string") {
      output[key] = value;
      continue;
    }

    if (shouldKeepRaw(key)) {
      output[key] = value.slice(0, 80);
      continue;
    }

    if (/@/.test(value)) {
      output[key] = maskEmail(value);
      continue;
    }

    if (/\d{3}[^\d]?\d{3}[^\d]?\d{4}/.test(value)) {
      output[key] = maskPhone(value);
      continue;
    }

    output[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  return output;
}
