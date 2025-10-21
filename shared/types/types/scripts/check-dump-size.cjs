const fs = require("fs");
const path = require("path");

const MAX_SIZE_KB = 512;
const target = path.join(process.cwd(), "db/sql/schema.sql");

try {
  const stats = fs.statSync(target);
  const sizeKB = stats.size / 1024;
  console.log(`✅ Schema dump size: ${sizeKB.toFixed(2)} KB`);
  if (sizeKB > MAX_SIZE_KB) {
    console.error(`❌ Schema dump exceeds ${MAX_SIZE_KB} KB limit.`);
    process.exit(1);
  }
} catch (err) {
  console.error("Schema dump not found:", err);
  process.exit(1);
}
