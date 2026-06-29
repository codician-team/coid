# AGENTS.md

## Cursor Cloud specific instructions

`coid` is a single, zero-runtime-dependency TypeScript ESM library (no servers, no
databases, nothing long-running). The startup update script runs `npm ci`, so
`node_modules` is already installed when you begin.

Standard commands live in `package.json` `scripts`; use them directly:

- `npm run build` — compile `src/index.ts` to `dist/` via `tsc`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — builds first, then runs `node --test test/coid.test.mjs`.
- `npm run bench` — installs separate deps under `bench/` (network required) and
  compares throughput against real ID libraries.

Non-obvious notes:

- Tests and the bench import the compiled output in `dist/`, not `src/`. Always
  `npm run build` after editing `src/index.ts` before running plain
  `node ... dist/index.js`; `npm test`/`npm run bench` already build first.
- The package is ESM-only; run ad-hoc scripts with
  `node --input-type=module` or a `.mjs` file, not CommonJS `require`.
- `bench/` has its own `package.json`/lockfile so benchmark deps never reach the
  published package; its `node_modules` is gitignored.
