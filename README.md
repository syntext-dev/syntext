# stx

The `stx` command-line tool for authoring, building, and deploying Syntext documentation. Self-contained — includes its own MDX compiler, dev server, annotation parser, and API client. Compiled to a single binary via Bun.

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
| `stx dev` | Local dev server with hot-reload |
| `stx build` | Compile MDX → static site |
| `stx deploy` | Push to Syntext hosting |
| `stx check` | Validate annotations, links, frontmatter |
| `stx generate` | Generate pages from OpenAPI/AsyncAPI/GraphQL specs |
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
├── compiler/             # Self-contained MDX compilation
│   ├── index.ts
│   ├── remark-components.ts
│   ├── remark-mermaid.ts
│   └── protocol-components.ts
├── annotations/          # @stx annotation parser (multi-language)
│   ├── index.ts
│   ├── drift.ts
│   ├── generate-mdx.ts
│   ├── parse-annotation.ts
│   ├── parse-typescript.ts
│   ├── parse-python.ts
│   ├── parse-go.ts
│   ├── parse-rust.ts
│   ├── parse-java.ts
│   ├── parse-php.ts
│   ├── style-guide.ts
│   └── types.ts
└── lib/                  # Internal utilities
    ├── config.ts         # Config loader (json/yaml/ts/js)
    ├── credentials.ts    # Token storage (~/.syntext/)
    ├── ci-templates.ts   # CI/CD scaffold generators
    ├── html-template.ts  # HTML page template for builds
    ├── sidebar.ts        # Sidebar generation from file tree
    ├── toc.ts            # Table of contents extraction
    └── i18n.ts           # Internationalization utilities
```
