export const PASSWORD_ACTIVATION_RETRY_MESSAGE =
  "Your password was updated, but account activation could not be completed. Retry activation or contact your shop administrator.";

export async function activatePasswordProfile(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; userMessage: string; detail: string }> {
  try {
    const response = await fetchImpl("/api/auth/password-activation", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (response.ok && body?.ok === true) {
      return { ok: true };
    }

    return {
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail:
        body?.error ??
        `Password activation request failed with status ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail:
        error instanceof Error
          ? error.message
          : "Password activation request failed.",
    };
  }
}
