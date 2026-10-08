// Writes a consistent copy of the database (safe while the app runs) and keeps the newest copies.
// Usage: node server/backup.js <backup-dir> [keep=14]
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = process.argv[2];
const keep = Number(process.argv[3] ?? 14);
if (!dir || !process.env.DATABASE_FILE) {
  console.error('Brug: DATABASE_FILE=... node server/backup.js <mappe> [antal]');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const target = join(dir, `holteroklub-${stamp}.db`);
const db = new DatabaseSync(process.env.DATABASE_FILE);
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const old = readdirSync(dir).filter((f) => /^holteroklub-.*\.db$/.test(f)).sort().slice(0, -keep);
for (const f of old) rmSync(join(dir, f));
console.log(`Backup gemt: ${target}`);
