/**
 * Browser event fired when a queued Finish has been replayed to the server for
 * an Equipment (or undetermined) shop. It carries `{ lineId, lineClosed }` so
 * an open job screen can replace "pending sync" with the real outcome. Kept in
 * its own module so screens do not depend on the replay engine to listen.
 */
export const JOB_FINISH_REPLAYED_EVENT = "job-punch:finish-replayed";
