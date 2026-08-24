import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import pg from "pg";

const TABLES = [
  "users",
  "user_states",
  "ai_usage",
  "login_events",
  "billing_transactions",
  "stripe_webhook_events",
  "app_settings",
];
const SERIAL_TABLES = ["ai_usage", "login_events", "billing_transactions"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function emptyDirectory(directory) {
  try {
    return (await readdir(directory)).length === 0;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

async function clients() {
  const database = new pg.Client({ connectionString: requiredEnvironment("DATABASE_URL") });
  await database.connect();
  const service = BlobServiceClient.fromConnectionString(requiredEnvironment("AZURE_STORAGE_CONNECTION_STRING"));
  const container = service.getContainerClient(process.env.AZURE_STORAGE_CONTAINER?.trim() || "resumes");
  await container.createIfNotExists();
  return { database, container };
}

async function backup(directory) {
  if (!(await emptyDirectory(directory))) throw new Error("The backup destination must be empty.");
  await mkdir(resolve(directory, "objects"), { recursive: true });
  const { database, container } = await clients();
  try {
    const tables = {};
    for (const table of TABLES) {
      const result = await database.query(`SELECT * FROM ${table}`);
      tables[table] = result.rows;
    }
    const objects = [];
    for await (const blob of container.listBlobsFlat()) {
      const client = container.getBlockBlobClient(blob.name);
      const [properties, buffer] = await Promise.all([
        client.getProperties(),
        client.downloadToBuffer(),
      ]);
      const file = `${sha256(blob.name)}.bin`;
      await writeFile(resolve(directory, "objects", file), buffer);
      objects.push({
        key: blob.name,
        file,
        sha256: sha256(buffer),
        contentType: properties.contentType || null,
        metadata: properties.metadata || {},
      });
    }
    const databasePayload = JSON.stringify(tables);
    await writeFile(resolve(directory, "database.json"), databasePayload, "utf8");
    await writeFile(resolve(directory, "manifest.json"), JSON.stringify({
      format: "applitrail-portable-backup-v1",
      createdAt: new Date().toISOString(),
      databaseSha256: sha256(databasePayload),
      records: Object.fromEntries(TABLES.map((table) => [table, tables[table].length])),
      objects,
    }, null, 2), "utf8");
  } finally {
    await database.end();
  }
}

async function restore(directory) {
  if (process.env.APPLITRAIL_RESTORE_CONFIRM !== "empty-target") {
    throw new Error("Set APPLITRAIL_RESTORE_CONFIRM=empty-target to restore into a verified empty target.");
  }
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const databaseText = await readFile(resolve(directory, "database.json"), "utf8");
  if (manifest.format !== "applitrail-portable-backup-v1") throw new Error("Unsupported backup format.");
  if (sha256(databaseText) !== manifest.databaseSha256) throw new Error("Database backup checksum failed.");
  const tables = JSON.parse(databaseText);
  const { database, container } = await clients();
  try {
    for (const table of TABLES) {
      const count = await database.query(`SELECT COUNT(*) AS count FROM ${table}`);
      if (Number(count.rows[0].count) !== 0) throw new Error(`Restore target table ${table} is not empty.`);
    }
    for await (const blob of container.listBlobsFlat()) {
      throw new Error(`Restore target container is not empty (${blob.name}).`);
    }

    await database.query("BEGIN");
    try {
      for (const table of TABLES) {
        for (const row of tables[table] ?? []) {
          const columns = Object.keys(row);
          const values = columns.map((column) => row[column]);
          const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");
          await database.query(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${parameters})`,
            values,
          );
        }
      }
      for (const table of SERIAL_TABLES) {
        await database.query(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`,
        );
      }
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }

    for (const object of manifest.objects ?? []) {
      const buffer = await readFile(resolve(directory, "objects", object.file));
      if (sha256(buffer) !== object.sha256) throw new Error(`Object checksum failed for ${object.key}.`);
      await container.getBlockBlobClient(object.key).uploadData(buffer, {
        blobHTTPHeaders: object.contentType ? { blobContentType: object.contentType } : undefined,
        metadata: object.metadata,
      });
    }
  } finally {
    await database.end();
  }
}

const [command, destination = "backups/applitrail"] = process.argv.slice(2);
const directory = resolve(destination);
if (command === "backup") {
  await backup(directory);
  const details = await stat(resolve(directory, "manifest.json"));
  console.log(`Portable backup created at ${directory} (${details.size} byte manifest).`);
} else if (command === "restore") {
  await restore(directory);
  console.log(`Portable backup restored from ${directory}.`);
} else {
  throw new Error("Use: node scripts/portable-backup.mjs <backup|restore> <directory>");
}
