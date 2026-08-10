# Offline Mobile Service transition contract

A queued Service Visit transition records the visit ID, persisted source status, target status, operation key and ordering/dependency information. Replay is accepted only if the server remains in the source state; if the target state is already present the replay is idempotent. Any different newer server state becomes a conflict and is not overwritten.
