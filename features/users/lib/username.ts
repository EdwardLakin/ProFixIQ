const MAX_USERNAME_LENGTH = 32;

function toAlphaNumericLower(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildShopUsernameNamespace(shopName: string | null | undefined): string {
  const cleaned = toAlphaNumericLower(shopName ?? "");
  if (cleaned.length >= 3) return cleaned.slice(0, 12);
  return "shop";
}

export function normalizeProvisioningUsername(input: string, shopNamespace: string): string {
  const normalized = toAlphaNumericLower(input);
  const namespace = toAlphaNumericLower(shopNamespace) || "shop";

  if (!normalized) return namespace;

  const withNamespace = normalized.startsWith(namespace)
    ? normalized
    : `${namespace}${normalized}`;

  return withNamespace.slice(0, MAX_USERNAME_LENGTH);
}

function splitName(fullName: string | null | undefined): { first: string; last: string } {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => toAlphaNumericLower(p));

  return {
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts[parts.length - 1] ?? "" : "",
  };
}

export function buildUsernameSuggestions(params: {
  shopName: string | null | undefined;
  fullName: string | null | undefined;
}): string[] {
  const namespace = buildShopUsernameNamespace(params.shopName);
  const { first, last } = splitName(params.fullName);

  const seeds = [
    `${namespace}${first}`,
    `${namespace}${first}${last.slice(0, 1)}`,
    `${namespace}${first.slice(0, 1)}${last}`,
    `${namespace}${first || last || "user"}`,
  ];

  const unique = Array.from(
    new Set(
      seeds
        .map((value) => normalizeProvisioningUsername(value, namespace))
        .filter(Boolean),
    ),
  );

  if (unique.length === 0) {
    return [normalizeProvisioningUsername("user", namespace)];
  }

  return unique;
}

export function withShopUsernameSuffix(baseUsername: string, suffixNumber: number): string {
  if (suffixNumber <= 0) return baseUsername;
  const suffix = String(suffixNumber).padStart(2, "0");
  const trimmedBase = baseUsername.slice(0, Math.max(1, MAX_USERNAME_LENGTH - suffix.length));
  return `${trimmedBase}${suffix}`;
}
