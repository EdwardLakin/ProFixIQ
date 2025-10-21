/**
 * Simple size budget: warn > 3.0 MB (pg_dump exploded?), fail > 5.0 MB.
 * Adjust thresholds as you like.
 */
const fs = require('fs');
const path = 'db/sql/schema.sql';
if (!fs.existsSync(path)) {
  console.error(`Missing ${path} — run the dump first.`);
  process.exit(1);
}
const bytes = fs.statSync(path).size;
const mb = (bytes / (1024 * 1024)).toFixed(2);
console.log(`${path} is ${mb} MB`);
if (bytes > 5 * 1024 * 1024) {
  console.error('❌ schema.sql exceeds 5 MB — check for bad flags or data dump.');
  process.exit(1);
}
if (bytes > 3 * 1024 * 1024) {
  console.warn('⚠️ schema.sql > 3 MB (still allowed). Keep an eye on it.');
}
