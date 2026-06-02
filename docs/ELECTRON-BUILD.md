# wnab — Electron build & launch runbook (run on Wedge's Mac)

Spec for packaging wnab as a native macOS app. Decided 2026-05-29 (see vault
`PRDs/PRD-wnab-Electron-Launch.md`). Cowork can't build this — macOS + native module rebuild +
electron-builder are required. Hand this to Claude Code locally, or run by hand.

**Decisions baked in:** data → `~/Documents/Finances/wnab/`; arch → arm64-only; launch → Dock icon
(localhost button retired), optional `wnab://` scheme for an in-Obsidian link.

## Phase 0 — prereqs

- Node 22 (`nvm use 22`), `corepack enable` (Yarn 4).
- Xcode Command Line Tools: `xcode-select --install`.

## Phase 1 — branding + data-dir patch (small, reviewable edits)

**1a. App identity** — `packages/desktop-electron/package.json` `build`:

- `productName`: `"wnab"` (currently `desktop-electron` → drives the .app name)
- `appId`: e.g. `"com.wedge.wnab"`
- `mac` arch: edit the **nested** `arch` array inside the `{ "target": "dmg", "arch": [...] }`
  object to **`["arm64"]`** only (currently `["x64","arm64"]`). Do **not** replace `mac.target` with a
  bare string array like `["arm64"]` — that drops the `dmg` target and electron-builder will misread
  `arm64` as a target type.

**1b. Data location** — `packages/desktop-electron/index.ts`, the non-test `else` block that currently does:

```ts
process.env.ACTUAL_DOCUMENT_DIR = app.getPath('documents');
process.env.ACTUAL_DATA_DIR = app.getPath('userData');
```

Replace the packaged-mode assignment with a wnab root under Documents/Finances:

```ts
import * as fs from 'fs';
import * as path from 'path';
// ...
const wnabRoot = path.join(
  app.getPath('home'),
  'Documents',
  'Finances',
  'wnab',
);
const docDir = path.join(wnabRoot, 'documents');
const dataDir = path.join(wnabRoot, 'data');
fs.mkdirSync(docDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
if (!isDev || !process.env.ACTUAL_DOCUMENT_DIR)
  process.env.ACTUAL_DOCUMENT_DIR = docDir;
if (!isDev || !process.env.ACTUAL_DATA_DIR)
  process.env.ACTUAL_DATA_DIR = dataDir;
```

(Keep the `isPlaywrightTest` branch untouched.) This is the one upstream divergence — note it in the
merge catalog (`PRDs/PRD-wnab-Upstream-Merge.md`).

**1c. (Optional) `wnab://` launch scheme** — for an in-Obsidian button. In `index.ts`:

```ts
app.setAsDefaultProtocolClient('wnab');
```

and add a `CFBundleURLTypes` entry to the mac build config (electron-builder `mac.extendInfo`) with
URL scheme `wnab`. Then `[Open wnab](wnab://open)` in `Finances.md` launches the app. Skip if using the
Dock only.

## Phase 2 — build

```sh
nvm use 22 && corepack enable
yarn install                 # if not already
yarn rebuild-electron        # native better-sqlite3 + bcrypt against Electron
yarn start:desktop           # SMOKE TEST: confirm reskinned UI opens in an Electron window
# when satisfied, package:
yarn build:desktop           # builds web (desktop mode) + runs electron-builder → dist/*.dmg
```

Unsigned build: no Apple cert needed. Leave `CSC_LINK` **unset** to get the automatic ad-hoc
`codesign --sign -` from the afterSignHook — do **not** set it. (The hook early-returns and _skips_
signing when `CSC_LINK` is set, which would leave the app unsigned and is not what you want here.)

## Phase 3 — install + launch

- Open `dist/wnab-mac-arm64.dmg`, drag `wnab.app` to `/Applications`.
- First launch: right-click → Open (Gatekeeper prompt for unsigned app), once.
- Pin to Dock. That icon is the "one button opens the whole program."

## Phase 4 — Obsidian cleanup

- In `00 Command Center/Finances.md`, remove the dead `http://localhost:4179/` link + the
  "double-click wnab.command" hint. Replace with the Dock (nothing) or a `[Open wnab](wnab://open)` link
  if 1c was done.

## Smoke test (also the post-merge check)

Launch app → create/open budget → Envelope mode → assign a dollar → confirm wnab theme renders →
confirm data persists across relaunch (written under `~/Documents/Finances/wnab/data`).
