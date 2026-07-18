# Developing argus-cli

Internal notes. This file is not published to npm — `package.json` uses a `files: ["dist"]` allowlist, and npm only auto-includes `README`, `LICENSE`, and `package.json`.

## Setup

```bash
pnpm install
pnpm run build          # tsc + copies worker-compose.yml into dist/
npm link                # puts `argus` on your PATH, pointing at this tree
```

`npm link` conflicts with a globally installed copy — both claim the `argus` bin. Run `npm rm -g @argusaudit/cli` before linking, and `npm rm -g @argusaudit/cli && npm i -g @argusaudit/cli` to go back to testing as a real user.

`dist/` is gitignored and goes stale silently. `prepublishOnly` rebuilds it on publish, but a linked dev copy runs whatever was last built — rebuild after editing.

## Environment variables

Escape hatches for local development. Deliberately undocumented in the README: end users have no reason to redirect the CLI at another API, and publishing the knob invites pointing it somewhere untrusted.

The easiest way to set them is a `.env.local` file:

```bash
cp .env.example .env.local   # then adjust values as needed
pnpm dev audit ...           # rebuilds, then runs with .env.local loaded
```

`pnpm dev` loads the file via Node's native `--env-file-if-exists` — no dotenv dependency, and it silently skips the file if it doesn't exist. Run it from the repo root: the path resolves relative to the current directory. Variables already exported in your shell take precedence over the file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARGUS_API_URL` | `https://api.argusaudit.dev/api/v1` | Engine API base URL. Set to `http://localhost:8000/api/v1` to run against a local engine. |
| `ARGUS_HUB_URL` | `https://www.argusaudit.dev` | Web app base URL, used for report links. |
| `ARGUS_WORKER_IMAGE` | `argusaudit/worker:0.1.0` | Worker image to run. Point at a locally built `argus-worker:latest` to test worker changes before publishing them. |

`generateCompose` always overwrites the `image:` in `src/lib/worker-compose.yml`, so the registry name lives in exactly one place: `DEFAULT_WORKER_IMAGE` in `src/config.ts`. The value in the template is an inert placeholder.

## Releasing

The CLI pins an exact worker image — never `latest` — so a benchmark is reproducible. Releasing a new worker means bumping `DEFAULT_WORKER_IMAGE` in `src/config.ts` in the same change as the CLI version.

```bash
./scripts/publish.sh
```

Requires a granular access token scoped to `@argusaudit` with "Bypass 2FA" enabled. The script keeps it in a throwaway `NPM_CONFIG_USERCONFIG` and deletes it on exit, so nothing lands in `~/.npmrc`. Delete the token afterwards — it can publish on your behalf until revoked.

**npm versions are permanent.** A published version can never be re-published, even after unpublishing. That includes fixing a typo in the README: the npm package page renders the README from the tarball, so documentation changes require a version bump.

## Known gaps

- `pnpm run lint` fails — the repo has no `eslint.config.js` and ESLint >= 9 requires one.
- `pnpm run test` runs zero tests; `node --test` finds no test files.
