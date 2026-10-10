# stfide — a custom IDE based on Eclipse Theia

A custom IDE built on the [Eclipse Theia](https://theia-ide.org) platform, scaffolded with the official
Yeoman generator (`generator-theia-extension`) on **2026-10-10**.

## Version matrix

| Component | Version |
|---|---|
| Theia platform (`@theia/*`, incl. `@theia/cli`) | **1.76.0** (pinned exactly) |
| Electron | 42.8.1 |
| Node.js (development) | 26.11.1 |
| npm | 12.2.0 |
| Bundler | esbuild (via `@theia/cli`, no webpack) |

## Packages

This is an npm-workspaces monorepo orchestrated with lerna:

| Package | What it is |
|---|---|
| `browser-app/` | The Theia application running in the browser (port 3000) |
| `electron-app/` | The Theia application running as a desktop app (Electron) |
| `hello-world/` | Example Theia extension: adds the **Say Hello** command (F1 → "Say Hello" → "Hello World!" notification) |

`browser-app` and `electron-app` each declare the `@theia/*` packages (plus `hello-world` in this repo)
that compose the product. Adding/removing features is done by adding/removing `@theia/*` packages there.

## Current state

- **Browser app**: built and running at <http://127.0.0.1:3000>, verified end-to-end (see below).
- **Electron app**: built and launched successfully; the window was closed afterwards.
- Native modules in `node_modules/` are currently compiled for the **browser/Node ABI**. Before
  running Electron, run `npm run build:electron` first (see "Native module ABI switching").
- `package.json` contains npm 12 `allowScripts` approvals (see "npm 12 blocks install scripts").

## Daily workflow

### Browser

```bash
npm run build:browser    # rebuild native modules + bundle (development mode)
npm run start:browser    # serve on http://localhost:3000
```

### Electron

```bash
npm run build:electron   # rebuild native modules for Electron's ABI + bundle
npm run start:electron   # launch the desktop app
```

### Live development

```bash
npm run watch:browser    # tsc --watch for hello-world + esbuild --watch for browser-app
# in a second terminal:
npm run start:browser
```

Edit files under `hello-world/src/browser/`, save, then reload the page (**F5**). For Electron use
`npm run watch:electron` + `npm run start:electron` and reload with **Ctrl+R**. The generated
`.vscode/launch.json` provides "Start Browser Backend" / "Start Electron Backend" debug configurations.

### Other scripts

```bash
npm run watch:electron         # same as watch:browser but for electron-app
npx lerna publish              # publish workspace packages (see "Publishing")
```

---

## Setup log — what was done and the exact commands run

### 1. Environment survey

```bash
node -v        # v26.11.1
npm -v         # 12.2.0
yarn -v        # 1.22.22 (not used; the current generator targets npm workspaces)
```

### 2. Install the generator

A global install failed because npm's global prefix is `/usr` and it is not writable, so `yo` and the
generator were installed user-locally instead:

```bash
mkdir -p ~/.local/theia-tools
cd ~/.local/theia-tools
npm install yo generator-theia-extension
```

### 3. Scaffold the project

Run from an empty `/home/orhan/Projects/stfide`, fully non-interactively:

```bash
~/.local/theia-tools/node_modules/.bin/yo theia-extension hello-world \
  --extensionType=hello-world --browser --electron --vscode --skip-install
```

(`--skip-install` only skips the generator's own `npm install`; the install is done in the next step
with better logging.) With a globally installed generator the command is simply
`yo theia-extension hello-world --extensionType=hello-world --browser --electron --vscode`.

Generated: root `package.json` / `lerna.json` / `.gitignore` / `.vscode/launch.json`, the
`hello-world` extension, and the `browser-app` + `electron-app` manifests. All `@theia/*` versions
are written as the exact version that was `latest` at generation time (1.76.0).

### 4. Install dependencies

```bash
npm install --no-audit --no-fund      # took ~7 minutes, 1297 packages
```

npm 12 **blocked the install scripts** of 10 packages (including `node-pty`, `drivelist`, `keytar`,
`native-keymap`, `@theia/ffmpeg`), so native modules were not built. See the troubleshooting section.

### 5. Approve install scripts and build the native modules

```bash
npm install-scripts approve --all
npm rebuild node-pty drivelist keytar native-keymap @theia/ffmpeg msgpackr-extract @parcel/watcher
```

This writes pinned `allowScripts` entries into the root `package.json` (the npm 12 recommended way to
re-enable lifecycle scripts) and then builds the native `.node` binaries for the current Node ABI.

### 6. Build and verify the browser app

```bash
npm run build:browser
npm run start:browser     # backend logs: "Theia app listening on http://127.0.0.1:3000"
```

The first run failed with `Cannot find module 'drivelist/build/Release/drivelist.node'` — a direct
consequence of the blocked install scripts fixed in step 5. After the rebuild it started cleanly.

Verification performed:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000    # 200
curl -s http://127.0.0.1:3000/bundle.js | grep -c 'HelloWorld.command'   # 1 (extension is bundled)
```

End-to-end UI check with a throwaway puppeteer-core script (`/tmp/opencode/test-hello.js`, using the
Chrome under `~/.cache/puppeteer/`): opened the app headlessly, pressed **F1**, typed `Say Hello`,
pressed **Enter**, and asserted the resulting "Hello World!" notification. Screenshot:
`/tmp/opencode/theia-hello-world.png`. Result: ✅.

### 7. Build and run the Electron app

```bash
npm run build:electron    # backs up browser-ABI modules, electron-rebuild, downloads Electron, bundles
npm run start:electron    # launched successfully; frontend reached the "ready" state
```

`theia rebuild:electron --cacheRoot ..` stores the Node-ABI modules it replaces in `.browser_modules/`
at the repo root and rebuilds `node-pty`, `native-keymap`, `drivelist`, `keytar` against Electron 42.
The Electron binary itself is downloaded on demand by the `electron` package (Electron 42 has no
postinstall).

### 8. Restore the browser state

```bash
npm run build:browser     # reverts native modules from .browser_modules/ and rebundles
npm run start:browser
```

Leaves the repo in the state where `npm run start:browser` works out of the box.

---

## Troubleshooting and quirks found during setup

### npm 12 blocks dependency install scripts by default

Fresh installs will report e.g.:

```
npm warn install-scripts 10 packages had install scripts blocked because they are not covered by allowScripts
```

Consequences: native modules are not compiled (`Cannot find module 'drivelist/build/Release/drivelist.node'`
at startup), and tools that need post-install steps don't get them. The approvals are already recorded
in the root `package.json` as pinned `allowScripts` entries, so this is fixed for this repo. To review
or change them:

```bash
npm install-scripts ls          # list packages whose scripts are not approved
npm install-scripts approve --all
npm rebuild <package> [...]     # run the newly-approved build scripts
```

### Native module ABI switching (browser ⇄ electron)

Theia native modules are compiled against the ABI of their host. `build:electron` swaps them to
Electron's ABI; `build:browser` restores the Node-ABI copies backed up in `.browser_modules/`.
**Always run the matching `build:*` before `start:*`** — starting a target without its build fails with
ABI-mismatch or missing-binary errors.

### Electron 42 downloads its binary on first use

There is no postinstall; the binary is fetched on first `require('electron')` (during `build:electron`
or at `start:electron`). If that ever gets interrupted:

```bash
npx install-electron
```

### Building behind a proxy (`node-gyp`)

`node-gyp` ignores npm/system proxy settings. If a native rebuild fails with `ECONNRESET` fetching
`node-vXX-headers.tar.gz`, download that tarball and run:

```bash
npm_config_tarball=/path/to/node-vXX.X.X-headers.tar.gz npm install
```

---

## Where to develop

- `hello-world/src/browser/hello-world-contribution.ts` — the command + menu contribution (start here).
- `hello-world/src/browser/hello-world-frontend-module.ts` — dependency-injection wiring of all
  contributions ("theiaExtensions" in `hello-world/package.json` points at this module).
- New Theia extension packages: generate standalone so the monorepo is not re-scaffolded:
  `yo theia-extension my-view --extensionType=widget --standalone`, then add it to the root
  `workspaces` array and to `browser-app`/`electron-app` dependencies.
- VS Code extensions: add them per
  [the guide](https://theia-ide.org/docs/composing_applications/) to either app package.
- Prerequisites and platform docs:
  [Theia Developing](https://github.com/eclipse-theia/theia/blob/master/doc/Developing.md#prerequisites),
  [Authoring Extensions](https://theia-ide.org/docs/authoring_extensions/).

## Publishing

Create an npm user and login, then publish versioned packages with lerna:

```bash
npm login
npx lerna publish
```

For a deployable product (branding, installers, automatic updates, bundled VS Code extensions), the
recommended next step is to integrate these extensions into the
[Theia IDE](https://github.com/eclipse-theia/theia-ide) template.
