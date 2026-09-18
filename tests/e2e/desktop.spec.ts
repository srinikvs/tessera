import { expect, test } from "@playwright/test";
import { openFresh } from "./helpers";

test("desktop smoke: Start begins a playable game", async ({ page }) => {
  await openFresh(page);
  await expect(page.getByTestId("howto")).toBeVisible();
  await expect(page.getByTestId("start")).toBeVisible();
  await expect(page.getByTestId("version")).toHaveText(/v1\.\d+\.\d+/);

  await page.getByTestId("start").click();
  await expect(page.getByTestId("start")).toHaveCount(0);
  await expect(page.getByTestId("hud")).toBeVisible();
  await expect(page.getByTestId("tray")).toBeVisible();
  await expect(page.locator("[data-testid^='tray-slot-'] .mini-piece")).toHaveCount(3);
  await expect(page.getByTestId("score")).toHaveText("0");
});
