# Anarlog (personal fork)

Slim entry point for Claude. `AGENTS.md` is upstream fastrepl's full guide, so it is not imported here: editing it in this fork would conflict on every upstream sync. Read the named `AGENTS.md` section when a task touches it.

## Workspace

pnpm + Rust workspace. Read the nearest component `AGENTS.md` before changing a component.

- `apps/desktop/` Tauri 2 + React/TS/Vite/Tailwind; Zustand for UI state, TanStack Query/Form for data and forms.
- `apps/web/` TanStack Start; `apps/mobile/` + `apps/watch/apple/` Expo with a Rust UniFFI bridge; `apps/api/` Rust/Axum; `apps/stripe/` Bun/Hono billing; `apps/cli/` Rust CLI/TUI/MCP (`anarlog` binary).
- `crates/db-app/` owns the canonical SQLite schema and migrations for desktop and mobile; `supabase/` holds hosted Postgres migrations, separate from SQLite.
- `enterprise/` is a separate commercially licensed Cargo workspace. Community packages must not depend on it.
- Sessions are the core entity. The editor is ProseMirror with TipTap-dialect JSON (`crates/tiptap`).

## Rules that change behavior

- Version control: on any branch other than `gitbutler/workspace`, use normal Git and ignore the GitButler skills. On that branch, follow `AGENTS.md §Version control on gitbutler/workspace`.
- Upstream sync: `upstream` is fastrepl/anarlog; `origin` is this fork. Keep local changes small and separable so upstream merges stay clean.
- Never print, commit or pass tokens in command arguments. `gh-enterprise` is fastrepl-internal; use plain `gh` with existing auth unless it is installed.
- Schema, migrations and DB init stay in Rust. SQLite migrations are append-only and downgrade-safe (additive, nullable or defaulted columns); otherwise add a `-- breaking` line to the migration's leading comment. Keep desktop and mobile schema parity.
- Do not hand-edit generated output (OpenAPI, bindings, permissions, i18n catalogs); regenerate with the owner command in `AGENTS.md §Generated files and data compatibility`.
- One regression test per fix; no tests for CSS, copy, mock call counts, private state or file layout (`.agents/skills/testing/SKILL.md`).
- Code style: `useForm` and `useQuery`/`useMutation` over manual state; `cn` from `@anlg/utils` with an array; `motion/react`, not `framer-motion`; no types unless shared; comments only for non-obvious "why"; no arbitrary global `z-index`.
- Branches use `fix/`, `chore/`, `refactor/`. PR and commit titles state intent, not the diff.
- Do not create summary docs or example files unless asked.

## Commands

- Install `pnpm install --frozen-lockfile`. Build shared UI first: `pnpm -F @anlg/ui build`.
- Dev: `pnpm dev:desktop`, `pnpm dev:web`, `pnpm dev` (full stack, needs Docker and Task).
- Format changed files: `pnpm exec dprint fmt --allow-no-files <files>`, then `dprint check` on the same files.
- Typecheck: `pnpm -F <package> typecheck`; Rust: `cargo check --locked -p <package>`.
- Before committing, run the checks for the touched component. `.github/workflows/` is the source of truth; the per-component map is `AGENTS.md §Checks by component`. A skipped CI job is not passing coverage.

## Read on demand

- Release work: `AGENTS.md §Release verification` and `.agents/skills/release-new-version/SKILL.md`.
- CLI/TUI command layout: `AGENTS.md §CLI TUI Command Architecture`.
- Cursor Cloud and headless setup: `AGENTS.md §Cursor Cloud specific instructions`.
