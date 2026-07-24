# @mentivax/mobile

Expo (React Native) shell for Mentivax. Ships a single **Fees dashboard**
screen: branded header, three summary cards (invoiced / collected / balance
due) and a students list with pending balances, all pulled from the shared
`@mentivax/api-client`.

## Run

From the repo root:

```bash
pnpm --filter @mentivax/mobile dev     # expo start
# then press i (iOS simulator), a (Android), or w (web)
```

Scripts: `dev` (`expo start`), `android`, `ios`, `typecheck`, `clean`.

## API base URL

The dashboard talks to the Mentivax API at `http://localhost:4000/api`
(hardcoded in `App.tsx`).

- **iOS simulator / Expo web** — `localhost` works as-is.
- **Physical device / Android emulator** — `localhost` points at the device
  itself. Replace it with your dev machine's LAN IP, e.g.
  `http://192.168.1.20:4000/api`.

It is fine if the API is unreachable while developing the shell — the screen
renders a loading state and then a friendly error.

## Monorepo / Metro note

This app lives in a **pnpm + Turborepo** workspace, and pnpm uses an isolated
`node_modules` layout. Metro does not understand that by default, so
`metro.config.js` is configured to:

1. `watchFolders` the repo root, so edits in `packages/*` hot-reload.
2. Add both the app's and the repo root's `node_modules` to
   `resolver.nodeModulesPaths`, so `@mentivax/*` workspace packages resolve.
3. Set `resolver.disableHierarchicalLookup = true` to respect pnpm's layout.

If you ever see "Unable to resolve module @mentivax/…", that config is the
first place to look.
