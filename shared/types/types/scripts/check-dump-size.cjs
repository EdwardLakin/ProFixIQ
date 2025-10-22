const fs = require('fs'), path = require('path');
const p = path.join(process.cwd(), 'db/sql/schema.sql');
if (!fs.existsSync(p)) { console.log('db/sql/schema.sql not found, skipping size check'); process.exit(0); }
const bytes = fs.statSync(p).size;
const kib = (bytes/1024).toFixed(2), mib = (bytes/1024/1024).toFixed(2);
console.log(`schema.sql is ${kib} KiB (${mib} MiB)`);
const LIMIT = 2.5 * 1024 * 1024; // 2.5 MiB soft cap
if (bytes > LIMIT) {
  console.error(`ERROR: schema.sql exceeds ${LIMIT/1024/1024} MiB (${mib} MiB).`);
  process.exit(1);
}
