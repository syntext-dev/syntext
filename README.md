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
| `stx login` | Authenticate via browser (device flow); stops if denied in the browser |
| `stx logout` | Clear stored credentials |

## Authentication

`stx login` opens your browser for authentication. If you're not logged in to syntext.dev, you'll sign up or log in first, then authorize the CLI automatically. No codes to copy.

- If you click **Deny** on the browser consent screen, `stx login` stops straight away with "Sign-in was denied in the browser." and exits non-zero.
- If the sign-in code expires or is removed before you approve it, `stx login` stops and asks you to run it again.
- If browser login is unavailable, `stx login` explains how to use a project API key instead, linking your project's **Settings → API keys** page (`https://app.syntext.dev/projects/<project-id>/settings/api-keys`) when run inside a connected docs directory, or the projects list (`https://app.syntext.dev/projects`) otherwise.

### Sessions

Each `stx login` is a session listed in the dashboard's sessions list as **stx CLI · <OS>** with the CLI version. The CLI sends `User-Agent: stx/<version> (<platform>; <arch>)` on every request so the session can be named.

If a session is revoked (from the dashboard, by a password change, or by signing out everywhere), the next command that calls the API fails with a message to run `stx login` again, and the stored credentials in `~/.syntext/credentials.json` are removed. With `--json`, the error includes `"code": "session_revoked"`. A token passed with `--token` is reported the same way but does not remove your stored login.

### CI

For CI, create an API key in the project's **Settings → API keys** and pass it to the command:
```bash
stx deploy --token <api-key>
stx build --token <api-key>
```

`stx login --token <token>` stores a CLI login token (it is checked against your profile, so it does not accept project API keys).

### Plan limits

When `stx projects create` hits your plan's project limit, the error links to **Billing** at `https://app.syntext.dev/billing`.

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
│   ├── connect.ts
│   ├── projects.ts
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
    ├── api.ts            # Backend fetch: User-Agent, session_revoked handling
    ├── device-poll.ts    # `stx login` device-token polling
    ├── dashboard-urls.ts # Links into the dashboard (billing, API keys)
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
