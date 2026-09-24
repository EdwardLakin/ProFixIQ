function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getGeotabDatabase(): string {
  return mustEnv("GEOTAB_DATABASE");
}

export function getGeotabUsername(): string {
  return mustEnv("GEOTAB_USERNAME");
}

export function getGeotabPassword(): string {
  return mustEnv("GEOTAB_PASSWORD");
}

export function getGeotabServer(): string {
  return (process.env.GEOTAB_SERVER?.trim() || "my.geotab.com").replace(
    /^https?:\/\//,
    "",
  );
}
