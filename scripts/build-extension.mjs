import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/extension");
const srcRoot = resolve(appRoot, "src");
const outDir = resolve(appRoot, "dist");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [
    resolve(srcRoot, "background.ts"),
    resolve(srcRoot, "content.ts"),
    resolve(srcRoot, "sidepanel.ts")
  ],
  outdir: outDir,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  sourcemap: true
});

await cp(resolve(srcRoot, "sidepanel.css"), resolve(outDir, "sidepanel.css"));
await cp(resolve(srcRoot, "sidepanel.html"), resolve(outDir, "sidepanel.html"));

const manifest = await readFile(resolve(appRoot, "manifest.json"), "utf-8");
await writeFile(resolve(outDir, "manifest.json"), manifest, "utf-8");
