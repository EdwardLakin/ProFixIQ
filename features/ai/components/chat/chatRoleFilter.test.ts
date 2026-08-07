import { describe, expect, it } from "vitest";
import { matchesChatRole, workOrderChatRoleFilter } from "./chatRoleFilter";

describe("chat role filters", () => {
  it("matches canonical mechanics and legacy aliases", () => {
    expect(matchesChatRole("mechanic", "mechanic")).toBe(true);
    expect(matchesChatRole("tech", "mechanic")).toBe(true);
    expect(matchesChatRole("technician", "mechanic")).toBe(true);
    expect(matchesChatRole("advisor", "mechanic")).toBe(false);
  });

  it("pairs work-order advisors and mechanics using canonical roles", () => {
    expect(workOrderChatRoleFilter("advisor")).toBe("mechanic");
    expect(workOrderChatRoleFilter("mechanic")).toBe("advisor");
    expect(workOrderChatRoleFilter("tech")).toBe("advisor");
    expect(workOrderChatRoleFilter("parts")).toBeNull();
  });
});
