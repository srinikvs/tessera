# Testing Tessera

JSON case files under `tests/cases/` are the **source of truth**. Unit (`npm test`) and Playwright (`npm run test:e2e`) load those files and drive assertions from `steps` / `expect`. Do not add a new Scrutiny scenario only as hard-coded TypeScript.

CSV export of results is optional later. JSON stays canonical. There is no spreadsheet ingest.

## Case files

Path: `tests/cases/*.json` (one case = one object / file).

| Field | Required | Values |
|---|---|---|
| `id` | yes | Stable id (`A1`, `B7`, `C14`, …) |
| `layer` | yes | `unit` \| `e2e` \| `pixel` |
| `title` | yes | Human-readable name |
| `steps` | yes | Interpreter ops (`openFresh`, `seedPlay`, `dragTrayToCell`, `scoreForTable`, …) |
| `expect` | yes | Interpreter asserts (`scoreFor`, `visible`, `boardCell`, `midGap`, …) |
| `gate` | yes | `block` (fails **TEST PASS**) \| `optional` |
| `viewport` | no | `desktop` for the 1280×800 smoke; otherwise Pixel project |

**Add a feature:** add or edit a JSON file, then re-run `npm test` and/or `npm run test:e2e`. Extend `tests/cases/unit-runner.ts` or `tests/e2e/case-runner.ts` only when you need a new op/assert.

Gate mapping: E2E **7–11** (`B7`, `B9`, `B10`, `B11a`, `B11b`) and Pixel **14–18** (`C14`–`C18`) use `gate: "block"`. Do not skip, soften, or `fixme` those cases.

Manual-only **D** items are **not** JSON cases and are not executed (see below).

## Local

```bash
npm install
npx playwright install --with-deps chromium

npm test                 # loads tests/cases/*.json (layer=unit) + existing tray/render/logic tests
npm run test:e2e         # Playwright pixel + desktop; loads e2e/pixel JSON cases
npm run test:e2e:pixel   # Pixel 7a project only (412×915)
npm run test:e2e:desktop # 1280×800 Start smoke (B-desktop-start)
```

`test:e2e` builds `dist/` and starts `vite preview` at `http://127.0.0.1:4173/tessera/` unless `BASE_URL` is set. Failure screenshots land in `test-results/`.

## Live smoke (`BASE_URL`)

```bash
BASE_URL=https://playaddatest.example/tessera/ npm run test:e2e
```

Replace the host with the playaddatest Tessera mount (`/tessera/`). When `BASE_URL` is set, Playwright does not start a local webServer.

## Jenkins `tessera-ci` / `tessera-test`

Linux Builder agent. Both jobs run the suite **from the git checkout only** — no Google Sheet, spreadsheet ingest, or CSV import on the agent.

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e
```

Set `CI=1` so Playwright uses the CI reporter, retries once, and does not reuse an existing preview server. For live playaddatest smoke, export `BASE_URL` to that host’s Tessera path.

## Catalog (A–C)

| id | Layer | Gate | Coverage |
|---|--------|------|----------|
| A1 | unit | optional | Row/col clear scoring (`scoreFor`, single + multi) |
| A2 | unit | optional | Sunilown: after N row clears, every occupied cell above drops exactly N |
| A3 | unit | optional | Tray refill after a clear is never empty while playable |
| A4 | unit | optional | Game-over when no legal placement remains |
| A5 | unit | optional | Beating Best writes `tessera-best-v1`; reload restores it |
| A6 | unit | optional | `VERSION` matches `package.json` / shipped UI tag |
| B7 | e2e | **block** | How-to-play before play; Start on the same screen |
| B8 | e2e | optional | Version ID on launch + HUD (`v1.x.x`) |
| B9 | e2e | **block** | Best shown; updates without refresh after a beat; survives reload |
| B10 | e2e | **block** | Place → clear ≥1 line → tray refills |
| B11a / B11b | e2e | **block** | Sunilown +1 after 1-row clear; +2 after 2-row clear |
| B12 | e2e | optional | Undo / pause / new-game do not brick tray or score |
| B13 | e2e | optional | Hard refresh mid-game does not leave an empty tray |
| C14 | pixel | **block** | Full board + tray visible; no vertical / home-bar clip |
| C15 | pixel | **block** | Sane mid-gap (not the rejected v1.1.22 over-tighten) |
| C16 | pixel | **block** | Tray pieces stay inside well edges |
| C17 | pixel | **block** | Tray cell matches board cell (±2px) |
| C18 | pixel | **block** | 5-tall bar unclipped and board-matching (no shrink-to-fit) |
| C19 | pixel | optional | Large/complex pieces keep square cells |

`src/game/cases.test.ts` fails if a required id is missing or a block case is not `gate: "block"`.

## Manual-only (D — do not automate, not in JSON)

- iPhone Safari-only visual quirks (dynamic toolbar, `visualViewport` dips, rubber-band).
- Subjective aesthetics beyond measurable square cells, board/tray cell parity, clip, and mid-gap.
- Weekly prod / merge greenlights and sign-off rituals.

## Hooks

Stable `data-testid` attributes (`version`, `howto`, `start`, `hud`, `best`, `tray`, `tray-slot-*`, `board`, …). Layout numbers used by Pixel cases (`--tessera-cell`, `--tessera-board-y`, …) are the same CSS variables the engine already writes for the HTML tray. Gameplay logic is unchanged.
