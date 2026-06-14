# Syntext CLI

The `syntext` command-line tool for authoring, building, and deploying documentation. Self-contained — includes its own MDX compiler, dev server, and API client. Compiled to a single binary via Bun.

## Development

```bash
bun install
bun dev
```

## Commands

- `syntext init` — scaffold a new docs project
- `syntext dev` — local dev server with hot-reload
- `syntext build` — compile MDX → static site
- `syntext deploy` — push to Syntext hosting
- `syntext check` — validate annotations, links, frontmatter
- `syntext generate` — generate pages from OpenAPI/AsyncAPI/GraphQL specs
- `syntext migrate` — migrate from other platforms (Mintlify, ReadMe, Docusaurus)

## Structure

```
src/
├── index.ts            # Entry point (Commander.js)
├── commands/           # One file per command
│   ├── init.ts
│   ├── dev.ts
│   ├── build.ts
│   ├── deploy.ts
│   ├── check.ts
│   ├── generate.ts
│   └── migrate.ts
├── compiler/           # Self-contained MDX compilation (subset of backend compiler)
│   ├── index.ts
│   ├── plugins/
│   └── components/
├── dev-server/         # Hot-reload local server (Bun + WebSocket)
│   ├── server.ts
│   └── watcher.ts
├── api/                # HTTP client for Syntext backend
│   └── client.ts
└── lib/                # Internal utilities (config loader, git, logger)
```

## Key Responsibilities
- Local authoring experience (init, dev server, hot reload)
- Offline build (compile MDX without backend)
- Deploy to Syntext hosting (push built artifacts)
- Validation (broken links, invalid frontmatter, annotation errors)
- Migration tooling from competitor platforms
