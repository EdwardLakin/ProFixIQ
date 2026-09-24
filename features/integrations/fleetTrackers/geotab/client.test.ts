import { describe, expect, it, vi } from "vitest";
import { authenticateGeotab, GeotabApiError } from "./client";

describe("authenticateGeotab", () => {
  it("rejects a non-geotab.com server without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      authenticateGeotab({
        database: "mycompany",
        username: "user",
        password: "secret",
        server: "169.254.169.254",
      }),
    ).rejects.toThrow(GeotabApiError);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects a server value carrying a path or embedded host", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      authenticateGeotab({
        database: "mycompany",
        username: "user",
        password: "secret",
        server: "my.geotab.com.attacker.example",
      }),
    ).rejects.toThrow(GeotabApiError);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
