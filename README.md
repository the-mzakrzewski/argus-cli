# ARGUS CLI

**SQL Stress-Test Auditor.** Your SQL is fast — and we have proof.

ARGUS takes your schema and a query, generates realistic data at scale, benchmarks candidate optimizations against each other on your own machine, and reports which one actually wins — with hard numbers.

ARGUS currently supports **PostgreSQL only**.

## Install

```bash
npm install -g @argusaudit/cli
```

## Requirements

- **Node.js >= 24**
- **Docker** and **Docker Compose >= 2.20** — benchmarks run in local containers. Compose 2.20 is the floor because the CLI drives the stack with `docker compose wait`.

## Usage

```bash
argus login                                   # authenticate via browser
argus audit --ddl schema.sql --query slow.sql
```

The audit prints a link to your report when it finishes.

### `argus audit`

| Flag | Purpose |
| --- | --- |
| `--ddl <path>` | Path to your DDL/schema file. **Required.** |
| `--query <path>` | Path to the query to optimize. **Required.** |
| `--postgres-version <version>` | Benchmark against a specific Postgres, e.g. `17`, `17.5`, `17-bookworm`. Defaults to `18-alpine`. |
| `--keep-containers` | Leave containers running after the benchmark instead of tearing them down. Useful for debugging. |

### Other commands

- `argus login` — authenticate via browser; credentials are stored in your OS keychain.
- `argus logout` — remove stored credentials.

## How it works

1. Your DDL and query are sent to the ARGUS engine, which proposes optimization variants (index / query rewrite / schema change).
2. The CLI starts an isolated Postgres via Docker Compose and pulls the `argusaudit/worker` image.
3. The worker seeds data matching realistic distributions, then benchmarks each variant 5x with `ROLLBACK` between runs.
4. Results are reported back and rendered at [argusaudit.dev](https://www.argusaudit.dev).

**Your data never leaves your machine** — only the DDL and query go to the cloud. Benchmarking happens entirely in local containers.

## License

MIT — see [LICENSE](./LICENSE).
