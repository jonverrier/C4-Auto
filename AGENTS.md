# C4-Auto Agent Instructions

Instructions for AI assistants working on the `@jonverrier/c4-auto` package. This is a **standalone** repository — not part of a monorepo workspace.

## Project Overview

C4-Auto is a publishable Node.js CLI that generates C4 architecture documentation for TypeScript codebases. It walks a directory tree, refreshes LLM-generated module header comments in source files, writes per-directory C4 Component/Context markdown, and optionally rolls up nested trees into package-level summaries at the scan root.

**Generated output only** — never modify the project `README.md`.

Default generated filenames (Strong AI convention, overridable via CLI):

- `README.StrongAI.Component.md` (`--component-file`)
- `README.StrongAI.Context.md` (`--context-file`)

## Package Structure

```text
src/
  generate-docs-cli.ts      CLI entry (bin: c4-auto)
  DirectoryTreeTraverser.ts Tree walk + detectSubdirectorySources()
  VisitorFactory.ts         Wires production visitors
  ModuleHeaderVisitor.ts    kFirst — source file headers
  C4DiagramVisitor.ts       kSecond — per-directory C4 READMEs
  RollupC4Visitor.ts        kThird — root rollup in finalize()
  C4ReadmeUtils.ts          Output filenames, datestamp/staleness helpers
  ModuleHeaderExtract.ts    Header block extraction from .ts sources
  DocGenTypes.ts            Shared interfaces and enums
  PromptIds.ts              Prompt UUID constants
  Prompts.json                In-memory prompt templates (copied to dist/)
test/                       Jest unit, integration, and e2e tests
dist/                       Published compiled output only
```

## Visitor Pipeline

Execution order per directory (ascending priority):

1. **ModuleHeaderVisitor** — update stale header comments in `.ts`/`.tsx`.
2. **C4DiagramVisitor** — write per-directory generated markdown from module headers. **Skip scan root** when `--rollup` and nested sources were detected.
3. **RollupC4Visitor** — during `visit()`, accumulate subdirectory README paths and record root source files; during `finalize()`, write root rollup READMEs.

Before traversal, when `--rollup` is set, `detectSubdirectorySources()` sets `IDocGenOptions.hasSubdirectorySources`.

Output filenames come from `IDocGenOptions.componentOutputFile` and `contextOutputFile` (defaults in `DEFAULT_C4_OUTPUT_FILES`, validated by `validateC4OutputFilename()`).

## Rollup Rules

| Condition | Behaviour |
|-----------|-----------|
| Flat tree (no nested matching sources) | Per-directory C4 at root; rollup skipped |
| Nested tree + `--rollup` | Subdirs get per-directory C4; root READMEs are rollup-only |
| Rollup input | Subdirectory README content + root module headers (`(root)` section) |
| Rollup staleness | Use `isRollupOutputStale()` — not the same as per-directory README staleness |

Do not write per-directory root C4 and rollup root C4 in the same run for nested trees.

## Build, Test, And Publish

```bash
npm install
npm run build          # rimraf dist && tsc && copy Prompts.json
npm run test:ci        # unit + integration (no OPENAI_API_KEY)
npm run test:e2e       # real LLM (needs OPENAI_API_KEY)
npm pack --dry-run     # verify dist-only tarball
```

**Publish** (GitHub Packages):

1. Commit on `develop`, merge to `main`.
2. On `main`: `npm install`, `npm run build`, `npm publish` with `NODE_AUTH_TOKEN`.
3. Return to `develop`.

## Coding Standards

- TypeScript strict mode, ES2022, Node 22, CommonJS.
- Use `@jonverrier/prompt-repository` error classes (`InvalidParameterError`, `InvalidOperationError`, `ConnectionError`) — never raw `Error`.
- Interface prefix `I`, enum prefix `E`, enum members prefix `k`.
- JSDoc on public modules/functions; copyright header on source files.
- Constants for magic numbers at file top (timeouts, word counts, etc.).
- Tests: Jest + `expect` + Sinon; `describe`/`it` are globals.
- Use exhaustive switch handling for TypeScript unions and enums.

## Testing Notes

- Mock `IFileReader`, `IFileWriter`, `IDirectoryReader`, `IFileFilter`, `IChatDriver`, and `IPromptRepository` in unit tests.
- Use `makeTestDocGenOptions()` from `test/testDocGenOptions.ts` for complete `IDocGenOptions` in tests.
- Cover CLI parsing (`generate-docs-cli.test.ts`), custom output filenames, rollup behaviour, and staleness helpers.
- Do not pipe live Jest output through `tail`/`grep` — run `npm run test:ci` directly.

## Git Safety

- Never run destructive git commands unless explicitly requested.
- Do not delete untracked files without approval.
- Inspect `git status --short --branch` before committing.
- No AI attribution in commit messages.

## Related Packages

- **PromptRepository** (`@jonverrier/prompt-repository`) — LLM drivers and prompt expansion.
- **C4-Agent** — MCP server for interactive C4 diagram generation (separate repo).
