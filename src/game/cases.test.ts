import { test } from "node:test";
import { assertCatalog, loadCases } from "../../tests/cases/load.ts";
import { runUnitCase } from "../../tests/cases/unit-runner.ts";

test("JSON case catalog covers Scrutiny A–C with correct gates", () => {
  assertCatalog(loadCases());
});

for (const c of loadCases({ layer: "unit" })) {
  test(`${c.id}: ${c.title}`, () => {
    runUnitCase(c);
  });
}
