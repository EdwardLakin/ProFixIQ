import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const transport = readFileSync(
  "features/copilot/technician/server/transport.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260814030000_technician_copilot_atomic_documentation_turns.sql",
  "utf8",
);

describe("Technician CoPilot turn-scoped documentation atomicity", () => {
  it("submits one turn-scoped command instead of fingerprint-keyed appends", () => {
    expect(chat).toContain('"documentation.append"');
    expect(chat).toContain('"documentation-turn"');
    expect(chat).toContain("events: documentationEvents");
    expect(chat).not.toContain("documentation-${fingerprint}");
    expect(transport).toContain('| "documentation.append"');
  });

  it("finalizes only successful extraction attempts, including valid empty results", () => {
    expect(chat).toContain("completed: true");
    expect(chat).toContain("completed: false");
    expect(chat).toContain("if (documentationExtraction.completed)");
  });

  it("recovers unfinished documentation without replacing a persisted reply", () => {
    expect(chat).toContain("documentationTurns?: string[]");
    expect(chat).toContain("documentationAlreadyFinalized");
    expect(chat).toContain("Promise.resolve(existingAssistant.text)");
    expect(chat).toContain("silent documentation persistence failed");
    expect(chat).toContain("replayed: Boolean(existingAssistant)");
  });

  it("reserves each source turn once and appends its event slots atomically", () => {
    expect(migration).toContain(
      "create table if not exists copilot.repair_session_documentation_turns",
    );
    expect(migration).toContain("unique (session_id, source_turn_id)");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).toContain("event_count between 0 and 12");
    expect(migration).toContain(
      "repair_session_documentation_turns_shop_idx",
    );
    expect(migration).toContain(":documentation-slot:");
    expect(migration).toContain("copilot.append_repair_event_internal(");
    expect(migration).toContain(
      "create or replace function copilot.technician_session_read_internal",
    );
    expect(migration).toContain("'documentationTurns'");
    expect(migration).toContain(
      "from copilot.repair_session_documentation_turns dt",
    );
  });

  it("keeps the batch behind the technician assignment and private command boundary", () => {
    expect(migration).toContain(
      "v_profile_id := copilot.technician_profile_id(p_auth_user_id)",
    );
    expect(migration).toContain("copilot.technician_is_assigned(");
    expect(migration).toContain("when 'documentation.append' then");
    expect(migration).toContain(
      "revoke all on table copilot.repair_session_documentation_turns",
    );
    expect(migration).toContain(
      "revoke all on function copilot.technician_documentation_append_internal",
    );
  });
});
