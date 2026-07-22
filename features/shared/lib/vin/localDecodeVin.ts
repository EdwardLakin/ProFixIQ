import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

export type LocalVinDecode = {
  vin: string;
  year: string | null;
  make: string | null;
  manufacturer: string | null;
  country: string | null;
};

const MODEL_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

const COUNTRY_BY_PREFIX: Readonly<Record<string, string>> = {
  "1": "United States",
  "2": "Canada",
  "3": "Mexico",
  "4": "United States",
  "5": "United States",
  J: "Japan",
  K: "South Korea",
  L: "China",
  S: "United Kingdom",
  V: "France / Spain",
  W: "Germany",
  Y: "Sweden / Finland",
  Z: "Italy",
};

const WMI_MAKES: Readonly<
  Record<string, { make: string; manufacturer?: string }>
> = {
  "1FA": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1FB": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1FC": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1FD": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1FM": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1FT": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1ZV": { make: "Ford", manufacturer: "Ford Motor Company" },
  "2FA": { make: "Ford", manufacturer: "Ford Motor Company" },
  "2FB": { make: "Ford", manufacturer: "Ford Motor Company" },
  "2FM": { make: "Ford", manufacturer: "Ford Motor Company" },
  "2FT": { make: "Ford", manufacturer: "Ford Motor Company" },
  "3FA": { make: "Ford", manufacturer: "Ford Motor Company" },
  "1G1": { make: "Chevrolet", manufacturer: "General Motors" },
  "1GC": { make: "Chevrolet", manufacturer: "General Motors" },
  "1GN": { make: "Chevrolet", manufacturer: "General Motors" },
  "1GT": { make: "GMC", manufacturer: "General Motors" },
  "1GY": { make: "Cadillac", manufacturer: "General Motors" },
  "1C4": { make: "Jeep", manufacturer: "Stellantis" },
  "1C6": { make: "Ram", manufacturer: "Stellantis" },
  "1D7": { make: "Dodge", manufacturer: "Stellantis" },
  "2C3": { make: "Chrysler", manufacturer: "Stellantis" },
  "3C6": { make: "Ram", manufacturer: "Stellantis" },
  "1HG": { make: "Honda", manufacturer: "Honda" },
  "2HG": { make: "Honda", manufacturer: "Honda" },
  "2HK": { make: "Honda", manufacturer: "Honda" },
  "5FN": { make: "Honda", manufacturer: "Honda" },
  "19X": { make: "Acura", manufacturer: "Honda" },
  JHM: { make: "Honda", manufacturer: "Honda" },
  JH4: { make: "Acura", manufacturer: "Honda" },
  "1N4": { make: "Nissan", manufacturer: "Nissan" },
  "1N6": { make: "Nissan", manufacturer: "Nissan" },
  "3N1": { make: "Nissan", manufacturer: "Nissan" },
  "5N1": { make: "Nissan", manufacturer: "Nissan" },
  JN1: { make: "Nissan", manufacturer: "Nissan" },
  JN8: { make: "Nissan", manufacturer: "Nissan" },
  "2T1": { make: "Toyota", manufacturer: "Toyota" },
  "4T1": { make: "Toyota", manufacturer: "Toyota" },
  "4T3": { make: "Toyota", manufacturer: "Toyota" },
  "5TD": { make: "Toyota", manufacturer: "Toyota" },
  "2T2": { make: "Lexus", manufacturer: "Toyota" },
  JTD: { make: "Toyota", manufacturer: "Toyota" },
  JTE: { make: "Toyota", manufacturer: "Toyota" },
  JTH: { make: "Lexus", manufacturer: "Toyota" },
  KMH: { make: "Hyundai", manufacturer: "Hyundai Motor Group" },
  KND: { make: "Kia", manufacturer: "Hyundai Motor Group" },
  "5NP": { make: "Hyundai", manufacturer: "Hyundai Motor Group" },
  "5XX": { make: "Kia", manufacturer: "Hyundai Motor Group" },
  WVW: { make: "Volkswagen", manufacturer: "Volkswagen Group" },
  WAU: { make: "Audi", manufacturer: "Volkswagen Group" },
  WBA: { make: "BMW", manufacturer: "BMW Group" },
  WBS: { make: "BMW", manufacturer: "BMW Group" },
  WDD: { make: "Mercedes-Benz", manufacturer: "Mercedes-Benz Group" },
  WP0: { make: "Porsche", manufacturer: "Volkswagen Group" },
  WP1: { make: "Porsche", manufacturer: "Volkswagen Group" },
  YV1: { make: "Volvo", manufacturer: "Volvo Cars" },
  YV4: { make: "Volvo", manufacturer: "Volvo Cars" },
};

export function decodeVinModelYear(
  input: unknown,
  referenceYear = new Date().getFullYear(),
): string | null {
  const normalized = normalizeVinInput(input);
  if (!normalized.isValid) return null;

  const codeIndex = MODEL_YEAR_CODES.indexOf(normalized.vin[9]);
  if (codeIndex < 0) return null;

  const firstCycleYear = 1980 + codeIndex;
  const candidates: number[] = [];
  for (let year = firstCycleYear; year <= referenceYear + 1; year += 30) {
    candidates.push(year);
  }

  const plausible = candidates.filter((year) => year >= 1980 && year <= referenceYear + 1);
  if (!plausible.length) return null;
  return String(plausible[plausible.length - 1]);
}

export function decodeVinLocally(input: unknown): LocalVinDecode | null {
  const normalized = normalizeVinInput(input);
  if (!normalized.isValid) return null;

  const wmi = normalized.vin.slice(0, 3);
  const makeEntry = WMI_MAKES[wmi] ?? null;

  return {
    vin: normalized.vin,
    year: decodeVinModelYear(normalized.vin),
    make: makeEntry?.make ?? null,
    manufacturer: makeEntry?.manufacturer ?? makeEntry?.make ?? null,
    country: COUNTRY_BY_PREFIX[normalized.vin[0]] ?? null,
  };
}
