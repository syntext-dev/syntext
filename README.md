# stx

The `stx` command-line tool for authoring, building, and deploying Syntext documentation. Compiled to a single binary via Bun.

**The CLI does not render documentation.** `stx dev`, `stx build` and `stx deploy` all upload your source files and compile them on the Syntext backend; `build` downloads the finished static site for self-hosting. There is deliberately no local MDX compiler, so a local preview and a hosted build cannot disagree about rendered output.

What the CLI *does* do locally is parse `@stx` annotations (`stx generate`, `stx check`), validate `syntext.json`, frontmatter, MDX tags and links (`stx check`), rewrite deprecated syntax (`stx migrate`), and migrate projects from other platforms (`stx migrate --from`).

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
| `stx init` | Scaffold a new docs project (`syntext.json` starts with the `$schema` line) |
| `stx dev` | Watch for changes and auto-deploy previews |
| `stx build` | Build on the Syntext backend and download the static site (for self-hosting) |
| `stx deploy` | Push to Syntext hosting |
| `stx check` | Validate `syntext.json`, frontmatter, MDX tags and props, links and annotations; `--explain appearance` shows where each look value comes from |
| `stx generate` | Generate API reference pages from `@stx` source annotations |
| `stx migrate` | Rewrite deprecated Syntext syntax in place; `--from` imports from Mintlify, ReadMe, Docusaurus or GitBook |
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

## Syntax checks and migration (doc engine v2)

Renamed `syntext.json` keys, frontmatter keys, MDX tags and props keep working
for two weeks after their deprecation notice, then stop. `stx check` finds
them, and `stx migrate` rewrites them.

### `stx check`

```bash
stx check                # warnings for deprecated forms, unknown keys, invalid values
stx check --strict       # fail on them too (CI)
stx check --json         # each issue has file, line, type, message and code
```

Checks `syntext.json` / `syntext.yml` against the published schema
(`https://syntext.dev/schema/syntext.json`), page frontmatter, and MDX tags and
props, in the same words as the hosted build:

```
⚠ syntext.json:7: colors.accent: "#2AC3DE" is deprecated. Use themeOverrides.colors.light.accent-strong: "#2AC3DE" and themeOverrides.colors.dark.accent-strong: "#2AC3DE" instead.
⚠ syntext.json:3: Unknown key "nmae" is ignored. Did you mean "name"?
⚠ docs/components/updates.mdx:32: <Update label="…"> is deprecated. Use <Update title="…"> instead.
```

Unknown keys and values are warnings, as in the build.

### `stx check --explain appearance`

Prints every resolved appearance value and where it came from (`preset`,
`legacy-theme`, `feature-flag`, `org-theme`, `appearance`), then the tokens
that `themeOverrides` and the legacy `colors` / `fonts` keys set on top, then
the accent contrast (link text 4.5:1, fills 3:1, with the nearest passing
shade). For `"theme": "@org/slug"` it fetches the organization theme when you
are logged in (`stx login`); otherwise it says the theme could not be
resolved offline. `--json` prints the same as one object.

### `stx migrate`

```bash
stx migrate --dry-run    # unified diff of every change, nothing written
stx migrate              # rewrite in place; a second run changes nothing
stx migrate --v2         # also move colors, fonts and style flags into appearance
stx migrate --json       # applied, held and remaining items, with diffs
stx migrate --offline    # use the bundled deprecation table
```

Rewrites config keys (JSON keeps its formatting, YAML its comments),
frontmatter keys, MDX tags and props (never inside code fences or inline
code), and renames `syntext.config.json` to `syntext.json`. Rules come from
`https://api.syntext.dev/v1/schema/deprecations.json`, falling back to the
copy bundled with stx. Moves into `appearance` switch a v1 site to doc engine
v2, so they wait for `--v2`; the summary lists them, and anything that needs a
person (unknown keys, a prop set under both names).

### Keeping the copies in step

`src/syntax` and `src/appearance` copy the backend's deprecation table,
schema, validators and appearance resolver (each file starts with a
"Copied from syntext-backend" line). With a backend checkout, check them:

```bash
SYNTEXT_BACKEND_DIR=../backend bun run test:sync
```

## Configuration

The CLI looks for config in this priority order:
1. `syntext.json`
2. `syntext.yaml` / `syntext.yml`
3. `syntext.config.ts` / `syntext.config.js`
4. `syntext.config.json` (deprecated: `stx migrate` renames it to `syntext.json`)

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
│   ├── check-explain.ts  # stx check --explain appearance
│   ├── generate.ts
│   ├── migrate.ts
│   ├── migrate-syntax.ts # stx migrate without --from
│   ├── connect.ts
│   ├── projects.ts
│   ├── login.ts
│   └── logout.ts
├── syntax/               # Copied from the backend: deprecation table, syntext.schema.json,
│                         # schema validator, frontmatter keys, MDX tag reader, scanners
├── appearance/           # Copied from the backend: presets, resolver, contrast; explain output
├── migrate-syntax/       # stx migrate: JSON/YAML editors, page rewrites, diff, summary
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
