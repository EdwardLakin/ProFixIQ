# Next Blocker Summary — Participant Management Authorization Parity

## What was fixed
- Added a canonical participant-management API entrypoint at `/api/chat/participants` with `GET`, `POST`, `PATCH`, and `DELETE` handlers.
- Wired participant list reads (`GET`) to canonical lifecycle authorization using `authorizeConversationLifecycleAction(action="read_participants")`.
- Wired participant add/remove/update mutations (`POST`/`PATCH`/`DELETE`) to canonical lifecycle authorization using `authorizeConversationLifecycleAction(action="manage_participants")`.
- Added in-shop validation for participant additions and participant user reassignment using existing `authorizeConversationCreate` recipient validation.
- Migrated `NewChatModal` conversation creation away from direct client-side inserts to canonical `/api/chat/start-conversation`.
- Migrated `NewChatModal` recent participant label reads away from direct `conversation_participants` table access to canonical `/api/chat/participants` read path.

## Canonical authorization model now enforced
- `app/api/chat/participants/route.ts::GET` -> `read_participants` rule via `authorizeConversationLifecycleAction`.
- `app/api/chat/participants/route.ts::POST` -> `manage_participants` rule via `authorizeConversationLifecycleAction` + in-shop recipient validation via `authorizeConversationCreate`.
- `app/api/chat/participants/route.ts::PATCH` -> `manage_participants` rule via `authorizeConversationLifecycleAction` + in-shop reassignment validation via `authorizeConversationCreate`.
- `app/api/chat/participants/route.ts::DELETE` -> `manage_participants` rule via `authorizeConversationLifecycleAction`.
- `features/ai/components/chat/NewChatModal.tsx::ensureConversation` -> canonical conversation/participant creation now flows through `/api/chat/start-conversation` (which already uses canonical create authorization helper).
- `features/ai/components/chat/NewChatModal.tsx::buildRecentLabel` -> participant list reads now flow through `/api/chat/participants` (`read_participants`) instead of direct client table reads.

## Files changed
- `app/api/chat/participants/route.ts`
- `features/ai/components/chat/NewChatModal.tsx`
- `next-blocker-summary-participant-management-authorization-parity.md`

## Migrations added
- None.
- manual SQL apply required: no (no SQL migration in this phase)
- regenerate Supabase types after apply: not required in this phase (no schema change)

## Behavior changes
- Participant reads used by the recent label builder now fail closed unless the actor passes canonical `read_participants` authorization.
- Conversation creation in `NewChatModal` no longer relies on direct browser inserts to `conversations`/`conversation_participants`; it now uses the existing canonical server route.
- New participant mutation entrypoint now enforces creator-only participant management (`manage_participants`) consistently for add/remove/update operations.
- Participant removal now explicitly blocks removing the conversation creator from the participant table through the canonical participant management route.

## Risks resolved
- Canonical lifecycle auth includes participant rules but participant endpoints/callers were not unified -> Resolved by adding canonical `/api/chat/participants` entrypoint and migrating modal participant reads/mutations to canonical server paths.
- Existing participant mutation call sites may rely on local assumptions/direct helper/database access -> Resolved for identified UI mutation/read call sites in this phase (`NewChatModal` direct inserts/reads removed).

## Remaining adjacent risks not fixed in this phase
- `app/api/chat/my-conversations` still performs participant aggregation using service-role reads based on actor conversation-id derivation helper, rather than invoking `read_participants` per conversation explicitly.
- Other potential non-UI/internal callers (if introduced later) must be held to `/api/chat/participants` or canonical helper usage to prevent future drift.

## Validation run
- `npx tsc --noEmit` -> pass
- `npm run lint` -> fail (pre-existing repository lint errors/warnings outside this change scope)
- `npx eslint app/api/chat/participants/route.ts features/ai/components/chat/NewChatModal.tsx` -> pass (warnings only)

## Notes for next phase
- Next highest adjacent blocker: unify `my-conversations` participant read aggregation under an explicit canonical `read_participants` path (or helper wrapper) so participant-list reads are consistently authorized through the same lifecycle surface across list and detail fetches.
