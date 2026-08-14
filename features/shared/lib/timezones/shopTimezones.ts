export type ShopCountryCode = "US" | "CA";

export const US_SHOP_TIMEZONES = [
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Chicago",
  "America/Indiana/Knox",
  "America/Indiana/Tell_City",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Juneau",
  "America/Sitka",
  "America/Metlakatla",
  "America/Yakutat",
  "America/Nome",
  "America/Adak",
  "Pacific/Honolulu",
] as const;

export const CANADA_SHOP_TIMEZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Moncton",
  "America/Glace_Bay",
  "America/Goose_Bay",
  "America/Blanc-Sablon",
  "America/Toronto",
  "America/Nipigon",
  "America/Thunder_Bay",
  "America/Iqaluit",
  "America/Pangnirtung",
  "America/Winnipeg",
  "America/Rainy_River",
  "America/Rankin_Inlet",
  "America/Resolute",
  "America/Regina",
  "America/Swift_Current",
  "America/Edmonton",
  "America/Cambridge_Bay",
  "America/Yellowknife",
  "America/Inuvik",
  "America/Creston",
  "America/Dawson_Creek",
  "America/Fort_Nelson",
  "America/Vancouver",
  "America/Whitehorse",
  "America/Dawson",
  "America/Atikokan",
] as const;

const TIMEZONES_BY_COUNTRY: Record<ShopCountryCode, readonly string[]> = {
  US: US_SHOP_TIMEZONES,
  CA: CANADA_SHOP_TIMEZONES,
};

export function getSupportedShopTimezones(
  country: ShopCountryCode,
): readonly string[] {
  return TIMEZONES_BY_COUNTRY[country];
}

export function isSupportedShopTimezone(
  country: ShopCountryCode,
  timezone: string,
): boolean {
  return TIMEZONES_BY_COUNTRY[country].includes(timezone);
}

export function defaultShopTimezone(country: ShopCountryCode): string {
  return country === "CA" ? "America/Edmonton" : "America/Denver";
}
