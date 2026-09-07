import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dataDirectory = join(tmpdir(), "applitrail-browser-journeys");
await rm(dataDirectory, { recursive: true, force: true });

process.env.NODE_ENV = "production";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.PORT || "4173";
process.env.APPLITRAIL_DATA_DIR = dataDirectory;
process.env.APPLIFLOW_ADMIN_EMAIL = "journey.owner@applitrail.test";

await import("../dist/standalone/server.js");
