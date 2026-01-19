import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

type MigrationRow = { id: string };

function resolveMigrationsDir() {
  const direct = path.resolve(__dirname, "migrations");
  if (fs.existsSync(direct)) {
    return direct;
  }
  const fallback = path.resolve(__dirname, "../../src/db/migrations");
  if (fs.existsSync(fallback)) {
    return fallback;
  }
  return direct;
}

type BetterSqlite3Database = ReturnType<typeof Database>;

export function runMigrations(db: BetterSqlite3Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const dir = resolveMigrationsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied = new Set(
    db.prepare("SELECT id FROM migrations").all().map((row: MigrationRow) => row.id)
  );

  const applyMigration = db.transaction((id: string, sql: string) => {
    db.exec(sql);
    db.prepare("INSERT INTO migrations (id, applied_at) VALUES (@id, @appliedAt)")
      .run({ id, appliedAt: Date.now() });
  });

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    if (!sql.trim()) {
      continue;
    }
    applyMigration(file, sql);
  }
}
