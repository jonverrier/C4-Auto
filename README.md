# C4-Auto

**Automatically generate C4 architecture docs for your TypeScript codebase.**

C4-Auto is a command-line tool that walks your TypeScript (and TSX) directories, uses an LLM to write module-level summaries, and produces Mermaid C4 diagrams so you can see how your system is structured—without maintaining docs by hand.

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

## What does C4-Auto do?

- **Traverses** your project (by default skips `node_modules`, `dist`, `.git`).
- **Module headers** – For each `.ts`/`.tsx` file it can add or refresh a short LLM-generated comment at the top (with a date so you only regenerate when stale).
- **C4 diagrams** – For each directory it can write:
  - **Component** – `README.StrongAI.Component.md` (components and relationships in that folder).
  - **Context** – `README.StrongAI.Context.md` (how that part of the system fits with users and external systems).
- **Time windows** – You choose how old a file can be before it’s refreshed (e.g. one week, two weeks, one month), so you don’t re-run the LLM on everything every time.

---

## Quick start

**Prerequisites**

- Node.js 22
- [OpenAI API key](https://platform.openai.com/api-keys) (set as `OPENAI_API_KEY`)
- `@jonverrier/prompt-repository` is installed from GitHub Packages (public); no token needed for `npm install`.

**Install and run**

```bash
git clone https://github.com/jonverrier/C4-Auto.git
cd C4-Auto
npm install
```

Example: generate docs for `./src`, refresh files older than one month, and produce both Component and Context diagrams:

```bash
npx ts-node src/generate-docs-cli.ts --dir ./src --files "*.ts" "*.tsx" --one-month --c4component --c4context
```

Or use the npm script and pass options after `--`:

```bash
npm run generate-docs -- --dir ./src --files "*.ts" "*.tsx" --one-month --c4component --c4context
```

---

## CLI reference

**Required**

- `--dir <path>` – Root directory to scan (e.g. `./src`).
- `--files <spec...>` – One or more globs for files to include (e.g. `"*.ts"` `"*.tsx"`).
- **Exactly one** time-window:
  - `--one-week` – Regenerate only if older than 1 week.
  - `--two-weeks` – Older than 2 weeks.
  - `--one-month` – Older than 1 month.

**Optional**

- `--c4component` – Write `README.StrongAI.Component.md` in each directory.
- `--c4context` – Write `README.StrongAI.Context.md` in each directory.
- `--help`, `-h` – Print usage.

**Example**

```bash
npx ts-node src/generate-docs-cli.ts --dir ./src --files "*.ts" "*.tsx" --one-week --c4component
```

---

## Architecture

The tool is built around a small pipeline:

- **generate-docs-cli** – Parses arguments, builds options, and runs the traverser.
- **VisitorFactory** – Creates the visitors and wires them to real file I/O and the prompt repository.
- **DirectoryTreeTraverser** – Walks the tree (depth-first), skips excluded dirs, and calls visitors in order.
- **ModuleHeaderVisitor** – Runs first: adds/updates the LLM-generated header comment in each file (when stale).
- **C4DiagramVisitor** – Runs second: reads those headers and writes C4 Component and/or Context markdown files.

So: headers are always up to date before any diagram is generated. All of this is documented with C4 diagrams in this repo; see the “Generated documentation” section below.

---

## Generated documentation

This repo is documented with the same tool. You can see the output here:

- [src/README.StrongAI.Component.md](src/README.StrongAI.Component.md) – Component view of the CLI and visitors.
- [src/README.StrongAI.Context.md](src/README.StrongAI.Context.md) – Context view of the tool and its dependencies.

They were produced by running C4-Auto on `src/` with `--c4component` and `--c4context`.

---

## Building variants

This implementation was built **one-shot** from the feature specification below. If you use a **state-of-the-art model** (e.g. Claude, GPT-5.x), you can be fault-confident that giving it the same spec will produce a working build. To build your own variant (different language, different outputs, different LLM provider):

1. **Edit the spec** below to match what you want (e.g. change output filenames, add a Container diagram, target Python instead of TypeScript).
2. **Paste the full spec** into Claude Code, Cursor, or another AI-assisted coding environment.
3. Ask the model to implement it. With a SOTA model, a single pass is usually enough.

The entire feature specification follows.

---

## Feature specification (Automatic Documentation Generator)

*Below is the full spec this repo was built from. Edit it and paste into an AI coding assistant to generate variants.*

---

### Overview

A command-line tool (`generate-docs-cli.ts`) that traverses a directory tree, uses LLM prompts to generate JSDoc-style module-level header comments for TypeScript files, and then produces C4 Architecture diagrams in Mermaid format summarising each directory. The tool is driven entirely by the existing `PromptRepository` / `ChatDriverFactory` API (`@jonverrier/prompt-repository`).

The tool lives in `src/` and is run via an npm script (e.g. `npm run generate-docs`).

---

### Component 1 – CLI Entry Point (`generate-docs-cli.ts`)

**Responsibilities:** Parses the command line and wires up the traverser with the correct visitors.

**Arguments:**

| Flag | Type | Description |
|------|------|-------------|
| `--dir <path>` | string (required) | Root directory to traverse |
| `--files <specs...>` | string[] (required) | Glob-style file specs, e.g. `*.ts *.tsx` |
| `--one-week` | flag | Regenerate only files with headers older than 1 week |
| `--two-weeks` | flag | Regenerate only files with headers older than 2 weeks |
| `--one-month` | flag | Regenerate only files with headers older than 1 month |
| `--c4component` | flag | Generate C4 Component diagrams |
| `--c4context` | flag | Generate C4 Context diagrams |
| `--help` / `-h` | flag | Print usage |

Exactly one time-window flag must be provided. Multiple `--c4*` flags may be combined. If no `--c4*` flag is provided, the C4 visitor is not registered.

**Options structure:** All parsed options in a strongly typed `IDocGenOptions`:

```typescript
export interface IDocGenOptions {
   rootDir: string;
   fileSpecs: string[];           // e.g. ['*.ts', '*.tsx']
   timeWindow: ETimeWindow;
   c4DiagramTypes: EC4DiagramType[];
   jobStartedAt: Date;
}
```

**Enums:**

```typescript
export enum ETimeWindow {
   kOneWeek  = 'kOneWeek',
   kTwoWeeks = 'kTwoWeeks',
   kOneMonth = 'kOneMonth'
}

export enum EC4DiagramType {
   kComponent = 'kComponent',
   kContext   = 'kContext'
}

export enum EVisitorPriority {
   kFirst  = 1,  // Module header comment visitor
   kSecond = 2,  // C4 diagram visitor
   kThird  = 3,
   kFourth = 4
}
```

**Wiring:** CLI creates a `DirectoryTreeTraverser`, registers visitors via a static `VisitorFactory`, then calls `traverser.traverse(options)`. Exit code 0 on success, non-zero on error.

---

### Component 2 – Directory Tree Traverser (`DirectoryTreeTraverser.ts`)

**Responsibilities:** Depth-first traversal; for each directory that contains at least one file matching any visitor's file specs, collect matching file paths and dispatch to visitors in priority order.

**Interfaces (for DI / mocking):**

```typescript
export interface IDirectoryReader {
   listDirectory(dirPath: string): Promise<string[]>;   // returns filenames only
   isDirectory(itemPath: string): Promise<boolean>;
}

export interface IFileFilter {
   matches(filename: string, specs: string[]): boolean;  // glob-style match
}

export interface IDirectoryVisitor {
   readonly priority: EVisitorPriority;
   readonly fileSpecs: string[];   // e.g. ['*.ts', '*.tsx']
   visit(directoryPath: string, filePaths: string[], options: IDocGenOptions): Promise<void>;
}
```

Production implementation uses `fs/promises`. Tests inject mocks.

**Algorithm:**

1. Recursively list `options.rootDir` depth-first.
2. Skip: `node_modules`, `dist`, `.git`, `.nyc_output`, `coverage`.
3. For each directory, for each visitor, filter files against `visitor.fileSpecs`.
4. If one or more matches, call `visitor.visit(directoryPath, matchingFilePaths, options)`.
5. Visitors sorted ascending by `visitor.priority` before traversal.

**VisitorFactory:** `VisitorFactory.createAll(options)` returns `ModuleHeaderVisitor` always, plus `C4DiagramVisitor` when `options.c4DiagramTypes` is non-empty. Factory constructs chat driver, prompt repo, file reader/writer from production implementations.

---

### Component 3 – Module Header Comment Visitor (`ModuleHeaderVisitor.ts`)

**Priority:** `EVisitorPriority.kFirst`  
**File specs:** `['*.ts', '*.tsx']`

**Responsibilities:** For each TypeScript file, inspect existing header; if StrongAI-generated comment is absent or older than the time window, call the LLM and rewrite the header block.

**Header marker format:**

```
// ===Start StrongAI Generated Comment (YYYYMMDD)===
// ...generated content...
// ===End StrongAI Generated Comment===
```

Date in opening sentinel used for staleness. Insert above `@module` JSDoc if present, or above first import. Do not remove or relocate copyright line.

**Staleness:** `stale = (jobStartedAt - headerDate) > timeWindowDays(options.timeWindow)` with `kOneWeek → 7`, `kTwoWeeks → 14`, `kOneMonth → 30`.

**Interfaces:** `IFileReader` (`readFile`), `IFileWriter` (`writeFile`). Injected for mocking.

**LLM:** `PromptInMemoryRepository` + `ChatDriverFactory`. Prompt IDs in `PromptIds.ts`; templates in `Prompts.json`. User prompt parameters: `{moduleSource}`, `{wordCount}` (e.g. 150). System prompt: senior TypeScript engineer, concise module documentation. Use `EModel.kLarge`, `EModelProvider.kOpenAI`, `EVerbosity.kMedium`. Response is plain text.

---

### Component 4 – C4 Diagram Visitor (`C4DiagramVisitor.ts`)

**Priority:** `EVisitorPriority.kSecond` (after ModuleHeaderVisitor).  
**File specs:** `['*.ts', '*.tsx']`

**Responsibilities:** Read generated header blocks (or full file if no block) from all TypeScript files in the directory, concatenate, call LLM once per requested diagram type, write output Markdown.

**Output files:**

| Type | Filename |
|------|----------|
| `kComponent` | `README.StrongAI.Component.md` |
| `kContext` | `README.StrongAI.Context.md` |

Each file: (1) overview section, (2) Mermaid diagram in ` ```mermaid ` / ` ``` ` fences, (3) key components section.

**Word-count scaling:**

```
totalWords  = C4_INTRO_BASE_WORD_COUNT + C4_DETAIL_BASE_WORD_COUNT
            + floor(sqrt(fileCount) * C4_WORDS_PER_ROOT_FILE)
introWords  = floor(totalWords * C4_INTRO_FRACTION)
detailWords = totalWords - introWords
```

Suggested constants: `C4_INTRO_BASE_WORD_COUNT = 60`, `C4_DETAIL_BASE_WORD_COUNT = 80`, `C4_WORDS_PER_ROOT_FILE = 20`, `C4_INTRO_FRACTION = 0.4`.

**LLM:** Separate prompt IDs for Component and Context. User prompt parameters: `{moduleHeaders}`, `{introWordCount}`, `{detailWordCount}`. Output: overview, valid Mermaid C4 diagram, key-component notes. Same model/verbosity as header visitor.

**Staleness:** Before generating, check if output file exists and has recent datestamp (same time-window logic). Use header comment: `<!-- Generated by StrongAIAutoDoc YYYYMMDD -->`.

---

### Prompts (`src/Prompts.json`)

Three prompts (match `IPrompt` from `@jonverrier/prompt-repository`):

- `moduleHeaderCommentPromptId` – module header comment
- `c4ComponentDiagramPromptId` – C4 Component diagram + prose
- `c4ContextDiagramPromptId` – C4 Context diagram + prose

Each: `id` (UUID), `version`, `name`, `systemPrompt`, `userPrompt`, `userPromptParameters`.

---

### Error handling

Use error classes from the prompt-repository/assistant-common ecosystem: `InvalidParameterError` (bad CLI args), `InvalidOperationError` (parse/LLM failure), `ConnectionError` (API failure). No raw `new Error()`.

---

### Testing

- **Unit tests:** Mock all I/O and LLM. Cover traversal order, exclusions, staleness, header extract/strip/rewrite, sentinel parsing, word-count scaling, CLI parsing, error paths.
- **Integration tests:** Real `Prompts.json`, mocked I/O and LLM. Assert sentinel markers, valid date, README contains overview + Mermaid fence + key components, fresh files skipped.
- **E2E tests:** Temp dir, real LLM and filesystem. Assert README and header markers present. Skip if `OPENAI_API_KEY` not set. Timeout 5 minutes.

---

### Dependencies

- `@jonverrier/prompt-repository` (LLM drivers, prompts)
- `minimatch` (glob matching for `IFileFilter`)
- Dev: mocha, expect, sinon, ts-node, tsconfig-paths, typescript, @types/node, @types/mocha, @types/sinon, nyc.

---

*End of feature specification.*

---

## Testing

- **Unit and integration** (no API key, no network):

  ```bash
  npm test
  ```

- **End-to-end** (real OpenAI calls and filesystem; needs `OPENAI_API_KEY`):

  ```bash
  npm run test:e2e
  ```

E2E tests are skipped automatically if `OPENAI_API_KEY` is not set.

---

## Related

- **[C4-Agent](https://github.com/jonverrier/C4-Agent)** – MCP server that generates C4 docs interactively from your IDE (prompts + tools). C4-Auto is the automated, CLI-only sibling.

---

## License

MIT
