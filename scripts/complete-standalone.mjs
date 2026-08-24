import { access, cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(projectRoot, "dist", "standalone");
const runtimePackages = ["react", "react-dom", "scheduler"];

await access(join(standaloneRoot, "server.js"));
for (const packageName of runtimePackages) {
  const packageJson = require.resolve(`${packageName}/package.json`);
  const source = dirname(packageJson);
  const destination = join(standaloneRoot, "node_modules", packageName);
  await cp(source, destination, { recursive: true, force: true });
}

const manifest = JSON.parse(
  await readFile(join(standaloneRoot, "package.json"), "utf8"),
);
manifest.applitrailRuntimePackages = runtimePackages;
await writeFile(
  join(standaloneRoot, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
