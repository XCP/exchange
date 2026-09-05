import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const testDirectory = resolve(".test-dist/tests");
const testFiles = readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => resolve(testDirectory, name));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
