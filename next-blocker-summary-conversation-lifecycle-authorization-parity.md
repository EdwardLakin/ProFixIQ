# Next Blocker Summary — Conversation Lifecycle Authorization Parity

## What was fixed
- Centralized conversation lifecycle authorization into the canonical chat authorization helper by adding explicit lifecycle-action checks and create-conversation authorization checks.
- Updated conversation creation route to use canonical authorization checks (actor must have a shop profile, recipients must resolve to same-shop users, broadcast still role-gated).
- Updated conversation delete route to use canonical lifecycle authorization checks (creator-only delete, membership required, actor profile required, cross-shop participant guard).
- Removed the alternate direct client/server helper path that could create conversations outside canonical route checks.
- Updated mobile “new message” flow to create conversations through the canonical API route instead of direct helper writes.

## Canonical authorization model now enforced
- `features/ai/lib/chat/authorization.ts::authorizeConversationCreate` -> create allowed only for authenticated actor with valid shop profile and at least one valid same-shop recipient.
- `features/ai/lib/chat/authorization.ts::authorizeConversationLifecycleAction(action="delete")` -> delete allowed only if actor is creator, actor is authorized conversation actor, and conversation participants are not cross-shop relative to actor.
- `features/ai/lib/chat/authorization.ts::authorizeConversationLifecycleAction(action="manage_participants")` -> participant mutation rule codified as creator-only (least-privilege baseline).
- `features/ai/lib/chat/authorization.ts::authorizeConversationLifecycleAction(action="read_participants")` -> participant read rule codified as member-or-creator.
- `app/api/chat/start-conversation/route.ts` -> now enforces canonical create rules via helper before any service-role-backed inserts.
- `app/api/chat/delete-conversation/route.ts` -> now enforces canonical delete rules via helper before any service-role-backed deletes.
- `features/mobile/messages/new/page.client.tsx` -> now uses `/api/chat/start-conversation` canonical entrypoint, not direct helper mutation.

## Files changed
- `features/ai/lib/chat/authorization.ts`
- `app/api/chat/start-conversation/route.ts`
- `app/api/chat/delete-conversation/route.ts`
- `features/mobile/messages/new/page.client.tsx`
- `features/ai/lib/chat/startConversation.ts` (removed)
- `next-blocker-summary-conversation-lifecycle-authorization-parity.md`

## Migrations added
- None.
- Manual SQL apply required: not applicable in this phase (no migration generated).
- Regenerate Supabase types after apply: not applicable in this phase (no schema change).

## Behavior changes
- Conversation creation now consistently fails when recipient IDs do not resolve to same-shop profiles under canonical checks.
- Conversation deletion now consistently fails for non-creators, even if they are participants.
- Mobile new-message flow can no longer create conversations through the bypass helper path; it now inherits canonical route authorization behavior.
- Service-role-backed create/delete mutations now require canonical actor/conversation/shop authorization checks before data mutation.

## Risks resolved
- Message-layer auth centralized but lifecycle endpoints/helpers inconsistent -> Resolved by canonical lifecycle helper checks and route adoption.
- Service-role-backed mutation paths relying on inconsistent checks -> Resolved for create/delete flows by mandatory helper authorization before mutation.
- Participant-management flows missing explicit creator/member rules -> Resolved at canonical model level by explicit `manage_participants` and `read_participants` rules in helper.

## Remaining adjacent risks not fixed in this phase
- No dedicated participant add/remove/update API route exists yet that invokes `manage_participants`; rule is codified but not yet wired to new participant-management endpoints.
- Existing legacy chat UI surfaces may still contain local UX assumptions around recipient selection and conversation behavior that should be re-verified against stricter server authorization responses.

## Validation run
- `npx tsc --noEmit` -> pass.
- `npm run lint` -> fail due to pre-existing repository-wide lint errors unrelated to this change set.
- `npx eslint app/api/chat/start-conversation/route.ts app/api/chat/delete-conversation/route.ts features/ai/lib/chat/authorization.ts features/mobile/messages/new/page.client.tsx` -> pass with 1 warning in pre-existing mobile file (`no-explicit-any`).

## Notes for next phase
- Next highest adjacent blocker: add dedicated participant add/remove/update endpoints (or server actions) that call `authorizeConversationLifecycleAction(action="manage_participants")`, then migrate any participant mutation call sites to those canonical entry points.
