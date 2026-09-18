# Testing Tessera

Unit tests (`tsx --test`) plus a Playwright Chromium suite for browser and Pixel 7a (412×915) acceptance. The Jenkins `tessera-test` job on a Linux Builder should run both.

## Local

```bash
npm install
npx playwright install --with-deps chromium

npm test                 # unit: tray / render / logic / save / version
npm run test:e2e         # Playwright pixel + desktop against local vite preview
npm run test:e2e:pixel   # Pixel 7a project only
npm run test:e2e:desktop # 1280×800 Start smoke only
```

`test:e2e` builds `dist/` and starts `vite preview` at `http://127.0.0.1:4173/tessera/` unless `BASE_URL` is set. Failure screenshots land in `test-results/`.

## Live smoke (`BASE_URL`)

Point the same suite at a deployed Tessera mount (Playadda test / playaddatest path). The app is served under `/tessera/`:

```bash
BASE_URL=https://playaddatest.example/tessera/ npm run test:e2e
```

Replace the host with the playaddatest Tessera URL used by your environment. When `BASE_URL` is set, Playwright does not start a local webServer.

Production-shaped local preview (same base path):

```bash
npm run build
npm run preview          # http://127.0.0.1:4173/tessera/
```

## Jenkins Builder (`tessera-test`)

Linux Builder agent, no deploy. Install browser OS deps on the agent (or in the job) before the suite:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e
```

Set `CI=1` so Playwright uses the CI reporter, retries once, and does not reuse an existing preview server. For live playaddatest smoke, export `BASE_URL` to the Tessera path on that host and skip relying on `vite preview`.

## What is automated (A+B+C)

| # | Layer | Gate | Coverage |
|---|--------|------|----------|
| 1 | unit | | Row/col clear scoring (`scoreFor`, single + multi) |
| 2 | unit | | Sunilown: after N row clears, every occupied cell above drops exactly N |
| 3 | unit | | Tray refill after a clear is never empty while playable |
| 4 | unit | | Game-over when no legal placement remains |
| 5 | unit | | Beating Best writes `tessera-best-v1`; reload restores it |
| 6 | unit | | `VERSION` matches `package.json` / shipped UI tag |
| 7 | e2e | **FAIL blocks TEST PASS** | How-to-play before play; Start on the same screen |
| 8 | e2e | | Version ID on launch + HUD (`v1.x.x`) |
| 9 | e2e | **FAIL blocks TEST PASS** | Best shown; updates without refresh after a beat; survives reload |
| 10 | e2e | **FAIL blocks TEST PASS** | Place → clear ≥1 line → tray refills |
| 11 | e2e | **FAIL blocks TEST PASS** | Sunilown +1 after 1-row clear; +2 after 2-row clear |
| 12 | e2e | | Undo / pause / new-game do not brick tray or score |
| 13 | e2e | | Hard refresh mid-game does not leave an empty tray |
| 14 | pixel | **FAIL blocks TEST PASS** | Full board + tray visible; no vertical / home-bar clip |
| 15 | pixel | **FAIL blocks TEST PASS** | Sane mid-gap (not the rejected v1.1.22 over-tighten) |
| 16 | pixel | **FAIL blocks TEST PASS** | Tray pieces stay inside well edges |
| 17 | pixel | **FAIL blocks TEST PASS** | Tray cell matches board cell (±2px) |
| 18 | pixel | **FAIL blocks TEST PASS** | 5-tall bar unclipped and board-matching (no shrink-to-fit) |
| 19 | pixel | | Large/complex pieces keep square cells |

Items 7–11 and 14–18 are hard failures. Do not skip, soften, or mark them `fixme` / `soft`.

## Manual-only (D — do not automate)

- iPhone Safari-only visual quirks (dynamic toolbar, `visualViewport` dips, rubber-band).
- Subjective aesthetics beyond measurable square cells, board/tray cell parity, clip, and mid-gap.
- Weekly prod / merge greenlights and sign-off rituals.

## Hooks

Stable `data-testid` attributes (`version`, `howto`, `start`, `hud`, `best`, `tray`, `tray-slot-*`, `board`, …). Layout numbers used by E2E (`--tessera-cell`, `--tessera-board-y`, …) are the same CSS variables the engine already writes for the HTML tray. Gameplay logic is unchanged.
