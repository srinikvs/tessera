import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { VERSION, VERSION_LABEL } from "./version.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("VERSION matches package.json and the shipped UI tag", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };
  assert.equal(VERSION, pkg.version);
  assert.equal(VERSION_LABEL, `v${pkg.version}`);
  assert.match(read("index.html"), new RegExp(`Tessera v${VERSION.replaceAll(".", "\\.")}`));
  assert.match(read("src/App.tsx"), /VERSION_LABEL/);
  assert.doesNotMatch(read("src/App.tsx"), /v1\.\d+\.\d+/);
});
