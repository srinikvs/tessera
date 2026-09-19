import { test } from "@playwright/test";
import { loadCases } from "../cases/load.ts";
import { runE2ECase } from "./case-runner.ts";

const catalog = loadCases().filter((c) => c.layer === "e2e" || c.layer === "pixel");

for (const c of catalog) {
  test(`${c.id}: ${c.title}`, async ({ page }, info) => {
    info.annotations.push({ type: "id", description: c.id });
    info.annotations.push({ type: "gate", description: c.gate });
    const desktop = c.viewport === "desktop";
    test.skip(info.project.name === "desktop" ? !desktop : desktop);
    await runE2ECase(page, c);
  });
}
