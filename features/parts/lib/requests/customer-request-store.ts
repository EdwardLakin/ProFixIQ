/**
 * Tiny external store that lets the "Customer requests" section (rendered by
 * the route layout) tell the Parts queue page which part requests it owns, so
 * the queue does not list them twice. The page reads it without any network
 * traffic of its own.
 */
const EMPTY: ReadonlySet<string> = new Set();

let current: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export function setCustomerRequestPartIds(next: ReadonlySet<string>): void {
  if (sameMembers(current, next)) return;
  current = next.size === 0 ? EMPTY : new Set(next);
  for (const listener of listeners) listener();
}

export function getCustomerRequestPartIds(): ReadonlySet<string> {
  return current;
}

export function getServerCustomerRequestPartIds(): ReadonlySet<string> {
  return EMPTY;
}

export function subscribeCustomerRequestPartIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
