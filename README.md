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
- For `npm install`: access to GitHub Packages for `@jonverrier/prompt-repository` (set `NODE_AUTH_TOKEN` with `read:packages` if required)

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
