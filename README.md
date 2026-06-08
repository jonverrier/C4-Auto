# AutoDoc

**Automatically generate C4 architecture docs for your TypeScript codebase.**

AutoDoc (formerly C4-Auto) is a standalone CLI package (`@jonverrier/auto-doc`) that walks your TypeScript (and TSX) directories, uses an LLM to write module-level summaries, and produces Mermaid C4 diagrams so you can see how your system is structured—without maintaining docs by hand.

It was originally built for the [Strong AI](https://github.com/jonverrier) fitness-coaching platform; the default generated filenames follow that convention but you can override them for any project.

[Learn more about C4](https://c4model.com/).

---

## What is C4?

The C4 model is a simple way to describe software architecture in layers:

1. **Context** – How your system fits in the world: users, other systems, and boundaries.
2. **Container** – The main applications, services, or data stores inside your system.
3. **Component** – The building blocks inside each container and how they talk to each other.
4. **Deployment** – How it all runs on servers and infrastructure.

C4 is built for “just enough” documentation: enough to onboard people and navigate the codebase, without the docs rotting. Diagrams stay useful because they’re generated from the code and can be refreshed on a schedule.

---

## What does AutoDoc do?

- **Traverses** your project (by default skips `node_modules`, `dist`, `.git`).
- **Module headers** – For each `.ts`/`.tsx` file it can add or refresh a short LLM-generated comment at the top (with a date so you only regenerate when stale).
- **C4 diagrams** – For each directory it can write generated markdown files (default names below).
- **Rollup (`--rollup`)** – For nested source trees, synthesizes package-level summaries at the scan root from subdirectory docs, root-level module headers, and optional human-authored design intent (`Design.md` / `DESIGN.md`). Skipped for flat trees. Never modifies your project `README.md` or design files.
- **Time windows** – You choose how old a file can be before it’s refreshed (one week, two weeks, or one month).

### Default output filenames

AutoDoc uses dedicated generated-doc names so it never overwrites your hand-written `README.md`:

| Diagram type | Default filename |
|--------------|------------------|
| Component | `README.StrongAI.Component.md` |
| Context | `README.StrongAI.Context.md` |

These names come from the Strong AI tooling convention. Override them with `--component-file` and `--context-file` if your project uses different names (e.g. `ARCHITECTURE.Component.md`).

---

## Install

AutoDoc is published to **GitHub Packages** as `@jonverrier/auto-doc` with an `auto-doc` CLI binary. The legacy `c4-auto` binary name remains available as a compatibility alias.

**Prerequisites:** Node.js 22, `OPENAI_API_KEY` when generating docs, GitHub Packages auth for install.

**`.npmrc`** (repo root):

```ini
@jonverrier:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

**`package.json`:**

```json
{
  "devDependencies": {
    "@jonverrier/auto-doc": "^1.0.0"
  },
  "scripts": {
    "generate-docs": "auto-doc --dir ./src --files \"*.ts\" \"*.tsx\" --one-month --c4component --c4context --rollup"
  }
}
```

Set `NODE_AUTH_TOKEN` (PAT with `read:packages`) for install.

```bash
npm install --save-dev @jonverrier/auto-doc
```

See [MIGRATION.md](MIGRATION.md) if upgrading from `@jonverrier/c4-auto`.

---

## Quick start

Generate docs for `./src`, refresh files older than one month, and produce both diagram types:

```bash
npx auto-doc --dir ./src --files "*.ts" "*.tsx" --one-month --c4component --c4context
```

For packages with nested source trees, add `--rollup`:

```bash
npx auto-doc --dir ./src --files "*.ts" "*.tsx" --one-month --c4component --c4context --rollup
```

When rolling up, AutoDoc auto-detects `Design.md` or `DESIGN.md` at the scan root or its parent directory and includes it as read-only context. Override with `--design-file`:

```bash
npx auto-doc --dir ./src --files "*.ts" --one-month --c4component --rollup --design-file DESIGN.md
```

Use custom output filenames:

```bash
npx auto-doc --dir ./src --files "*.ts" --one-month --c4component \
  --component-file ARCHITECTURE.Component.md \
  --context-file ARCHITECTURE.Context.md
```

Or via npm script (pass extra flags after `--`):

```bash
npm run generate-docs -- --one-week --c4component
```

---

## CLI reference

**Required**

| Flag | Description |
|------|-------------|
| `--dir <path>` | Root directory to scan (e.g. `./src`) |
| `--files <spec...>` | One or more globs (e.g. `"*.ts"` `"*.tsx"`) |
| **Exactly one** time window | `--one-week`, `--two-weeks`, or `--one-month` |

**Optional**

| Flag | Description |
|------|-------------|
| `--c4component` | Write Component diagram markdown in each directory |
| `--c4context` | Write Context diagram markdown in each directory |
| `--rollup` | Synthesize root-level summaries from subdirectory docs (requires `--c4component` and/or `--c4context`) |
| `--design-file <path>` | Human-authored design intent for rollup (default: auto-detect `Design.md`/`DESIGN.md`) |
| `--component-file <name>` | Basename for Component output (default: `README.StrongAI.Component.md`) |
| `--context-file <name>` | Basename for Context output (default: `README.StrongAI.Context.md`) |
| `--help`, `-h` | Print usage |

Output filename rules: basename only (no paths), must end with `.md`, must not be `README.md`.

---

## Rollup behaviour

Use `--rollup` when your scan root has **subdirectories** with source (e.g. `src/checks/`, `src/config/`). The tool pre-scans the tree before traversal.

| Tree shape | Per-directory C4 at root | Rollup at root |
|------------|--------------------------|----------------|
| Flat (`src/*.ts` only) | Yes | Skipped (nothing to roll up) |
| Nested (`src/` + subdirs) | **No** — rollup owns root | Yes — package-level summary |

When rollup runs:

1. Subdirectories get normal per-directory generated markdown files.
2. Root-level `.ts` files still receive module header comments only.
3. `RollupC4Visitor.finalize()` writes root summaries from subdirectory READMEs, root-level module headers (labelled `(root)` in the prompt), and optional design intent.
4. Only **generated** markdown files are overwritten — never `README.md` or human-authored design documents.
5. Rollup uses its own staleness rules (child README, root header, or design file change ≥ existing root rollup date).

---

## Architecture

Visitor pipeline (ascending priority):

1. **ModuleHeaderVisitor** (`kFirst`) – Refreshes stale module header comments in source files.
2. **C4DiagramVisitor** (`kSecond`) – Writes per-directory diagram markdown from module headers. Skips scan root when `--rollup` and nested sources are detected.
3. **RollupC4Visitor** (`kThird`, when `--rollup`) – Accumulates subdirectory READMEs during traversal; writes root summaries in `finalize()`.

Headers are always up to date before diagram generation. Rollup runs after the full tree walk.

Generated docs for this repo:

- [src/README.StrongAI.Component.md](src/README.StrongAI.Component.md)
- [src/README.StrongAI.Context.md](src/README.StrongAI.Context.md)

---

## Development

```bash
npm install
npm run build
npm run test:ci        # unit + integration (no OPENAI_API_KEY)
npm run test:e2e       # real LLM (needs OPENAI_API_KEY)
```

---

## Publishing

Released from this repository to GitHub Packages:

1. Commit on `develop`, merge to `main`.
2. On `main`: `npm install`, `npm run build`, `npm publish` with `NODE_AUTH_TOKEN`.
3. Return to `develop`.

GitHub Actions workflow `.github/workflows/publish.yml` also publishes on GitHub Release or manual dispatch.

---

## Related

- **[AgentDoc](https://github.com/jonverrier/AgentDoc)** – MCP server for interactive C4 diagram generation from your IDE. AutoDoc is the automated CLI sibling.

---

## License

MIT
