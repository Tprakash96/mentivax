# @mentivax/desktop

Electron shell that hosts the Mentivax **web** app in a native desktop window.
In development it points at the web dev server; in production it loads the
built web app. Adds a native menu (including **Print receipt**) and a tiny,
safe `window.mentivax` bridge.

## How it works

- `electron/main.ts` — main process: creates the `BrowserWindow`
  (1280×800, min 900×600), loads `ELECTRON_START_URL` when set (dev) or the
  packaged web build otherwise, builds the application menu, and handles the
  `print` IPC channel + macOS lifecycle.
- `electron/preload.ts` — exposes `window.mentivax = { platform, print() }`
  via `contextBridge` (contextIsolation on, nodeIntegration off).
- TypeScript is compiled to `dist-electron/` by `tsc -p tsconfig.main.json`.

## Develop

Run the web dev server and the desktop shell in two terminals:

```bash
# terminal 1 — web app on http://localhost:5173
pnpm --filter @mentivax/web dev

# terminal 2 — Electron pointing at the dev server
pnpm --filter @mentivax/desktop dev
```

`dev` compiles the main/preload TS, then launches Electron with
`ELECTRON_START_URL=http://localhost:5173`.

Scripts: `build:main`, `dev`, `build`, `dist`, `typecheck`, `clean`.

## Package

```bash
pnpm --filter @mentivax/web build       # produce apps/web/dist
pnpm --filter @mentivax/desktop build   # compile the main process
pnpm --filter @mentivax/desktop dist    # electron-builder -> release/
```

`electron-builder` bundles `dist-electron/` and ships `apps/web/dist` as an
`extraResources` folder (`resources/web`). When packaged, `main.ts` loads
`resources/web/index.html`; when run unpackaged it reads the sibling
`apps/web/dist/index.html`. Targets: dmg (mac), nsis (win), AppImage (linux).
