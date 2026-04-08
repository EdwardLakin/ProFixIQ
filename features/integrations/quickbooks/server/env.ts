export type QuickBooksEnvironment = "sandbox" | "production";

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getQuickBooksClientId(): string {
  return mustEnv("QUICKBOOKS_CLIENT_ID");
}

export function getQuickBooksClientSecret(): string {
  return mustEnv("QUICKBOOKS_CLIENT_SECRET");
}

export function getQuickBooksRedirectUri(): string {
  return mustEnv("QUICKBOOKS_REDIRECT_URI");
}

export function getQuickBooksStateSecret(): string {
  return mustEnv("QUICKBOOKS_STATE_SECRET");
}

export function getQuickBooksEnvironment(): QuickBooksEnvironment {
  const raw = process.env.QUICKBOOKS_ENV?.trim().toLowerCase();
  return raw === "sandbox" ? "sandbox" : "production";
}

export function getQuickBooksAuthorizeUrlBase(): string {
  return "https://appcenter.intuit.com/connect/oauth2";
}

export function getQuickBooksTokenUrl(): string {
  return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

export function getQuickBooksApiBaseUrl(): string {
  return "https://quickbooks.api.intuit.com";
}

export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SHOP_BOOST_APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}