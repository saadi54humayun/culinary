import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const templatePath = new URL("./sw.template.js", import.meta.url);

async function filesAt(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesAt(path) : [path];
  }))).flat();
}

const paths = (await filesAt(root))
  .filter((path) => !path.endsWith(`${sep}sw.js`) && !path.endsWith(`${sep}sw.template.js`) && !path.endsWith(".map"))
  .map((path) => "/" + relative(root, path).split(sep).join("/"))
  .sort();
if (!paths.includes("/index.html")) throw new Error("Vite output is missing index.html.");
const hash = createHash("sha256");
for (const path of paths) {
  hash.update(path);
  hash.update(await readFile(join(root, path.slice(1))));
}
const version = hash.digest("hex").slice(0, 14);
const template = await readFile(templatePath, "utf8");
const output = template.replace("__VERSION__", version).replace("__PRECACHE_ASSETS__", JSON.stringify(paths));
await writeFile(join(root, "sw.js"), output);
console.log(`PWA service worker generated: ${paths.length} precached files`);
