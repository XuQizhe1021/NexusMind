import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(process.cwd());
const reportDir = resolve(root, "docs", "release-artifacts");
const reportPath = resolve(reportDir, "phase7-release-gate.json");

function run(command, args) {
  return new Promise((resolveRun) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: true
    });
    child.on("close", (code) => {
      resolveRun({
        command: `${command} ${args.join(" ")}`.trim(),
        success: code === 0,
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

const checks = [
  { command: "npm", args: ["run", "typecheck"] },
  { command: "npm", args: ["test"] },
  { command: "npm", args: ["run", "build"] },
  { command: "npm", args: ["run", "test:e2e:extension"] }
];

const results = [];
for (const item of checks) {
  const result = await run(item.command, item.args);
  results.push(result);
  if (!result.success) {
    break;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  allPassed: results.every((item) => item.success),
  checks: results
};

await mkdir(reportDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

if (!report.allPassed) {
  process.exit(1);
}
