# stx

The `stx` command-line tool for authoring, building, and deploying Syntext documentation. Compiled to a single binary via Bun.

**The CLI does not render documentation.** `stx dev`, `stx build` and `stx deploy` all upload your source files and compile them on the Syntext backend; `build` downloads the finished static site for self-hosting. There is deliberately no local MDX compiler, so a local preview and a hosted build cannot disagree about rendered output.

What the CLI *does* do locally is parse `@stx` annotations (`stx generate`, `stx check`), validate links and frontmatter, and migrate projects from other platforms.

## Install

```bash
# Homebrew
brew install syntext-dev/tap/stx

# Or curl
curl -sSL https://get.syntext.dev | sh
```

## Development

```bash
bun install
bun dev     # watch mode
bun build   # compile binary → dist/stx
bun test    # run tests
```

## Commands

| Command | Description |
|---------|-------------|
| `stx init` | Scaffold a new docs project |
| `stx dev` | Watch for changes and auto-deploy previews |
| `stx build` | Build on the Syntext backend and download the static site (for self-hosting) |
| `stx deploy` | Push to Syntext hosting |
| `stx check` | Validate annotations, links, frontmatter |
| `stx generate` | Generate API reference pages from `@stx` source annotations |
| `stx migrate` | Migrate from other platforms (Mintlify, ReadMe, Docusaurus, GitBook) |
| `stx login` | Authenticate via browser (device flow) |
| `stx logout` | Clear stored credentials |

## Authentication

`stx login` opens your browser for authentication. If you're not logged in to syntext.dev, you'll sign up or log in first, then authorize the CLI automatically. No codes to copy.

For CI environments, use a token directly:
```bash
stx login --token <your-token>
```

## Configuration

The CLI looks for config in this priority order:
1. `syntext.json`
2. `syntext.yaml` / `syntext.yml`
3. `syntext.config.ts` / `syntext.config.js`
4. `syntext.config.json` (legacy)

## Structure

```
src/
├── index.ts              # Entry point (Commander.js)
├── commands/             # One file per command
│   ├── init.ts
│   ├── dev.ts
│   ├── build.ts
│   ├── deploy.ts
│   ├── check.ts
│   ├── generate.ts
│   ├── migrate.ts
│   ├── login.ts
│   └── logout.ts
├── annotations/          # @stx annotation parser (multi-language)
│   ├── index.ts
│   ├── languages.ts      # Extension → parser map (mirrors the backend)
│   ├── scan-sources.ts   # Shared source scan for check + generate
│   ├── drift.ts
│   ├── generate-mdx.ts
│   ├── parse-annotation.ts
│   ├── parse-conventional.ts
│   ├── parse-typescript.ts
│   ├── parse-python.ts
│   ├── parse-go.ts
│   ├── parse-rust.ts
│   ├── parse-java.ts
│   ├── parse-php.ts
│   ├── parse-csharp.ts
│   ├── style-guide.ts
│   └── types.ts
└── lib/                  # Internal utilities
    ├── config.ts         # Config loader (json/yaml)
    ├── credentials.ts    # Token storage (~/.syntext/)
    ├── ci-templates.ts   # CI/CD scaffold generators
    └── resolve-docs-root.ts

## Annotation language support

`languages.ts` mirrors `detectLanguage` in the backend's annotation parser, and a
test asserts that mirroring entry by entry — when the backend gains a language,
that test fails here rather than the CLI quietly parsing fewer files than a
hosted build.

Parsed locally: TypeScript (`.ts` `.tsx` `.mts` `.cts`), JavaScript (`.js` `.jsx`
`.mjs` `.cjs`), Python, Go, Rust, Java/Kotlin, PHP, C#.

Not parsed locally: Ruby (`.rb`). The backend parses it; the CLI has no Ruby
parser. `stx generate` and `stx check` warn with a file count instead of
returning zero symbols, which would be indistinguishable from "no annotations".
```
