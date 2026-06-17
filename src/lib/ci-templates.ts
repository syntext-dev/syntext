/**
 * CI/CD template generators for syntext documentation projects.
 * Used by `syntext init` to scaffold CI configuration.
 */

export type CITemplateOptions = {
  branch?: string
  projectId?: string
  docsDir?: string
  provider: 'github' | 'gitlab' | 'bitbucket'
}

export function generateCITemplate(options: CITemplateOptions): string {
  switch (options.provider) {
    case 'github':
      return generateGitHubActionsTemplate(options)
    case 'gitlab':
      return generateGitLabCITemplate(options)
    case 'bitbucket':
      return generateBitbucketPipelinesTemplate(options)
  }
}

function generateGitHubActionsTemplate(options: CITemplateOptions): string {
  const branch = options.branch ?? 'main'
  return `# .github/workflows/syntext-deploy.yml
# Auto-deploy documentation on push to ${branch}
name: Deploy Docs

on:
  push:
    branches: [${branch}]
    paths:
      - 'docs/**'
      - 'syntext.config.*'
      - 'openapi.*'
  pull_request:
    branches: [${branch}]
    paths:
      - 'docs/**'
      - 'syntext.config.*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install Syntext CLI
        run: bun install -g syntext

      - name: Build documentation
        run: syntext build

      - name: Deploy to Syntext
        if: github.event_name == 'push'
        run: syntext deploy --token \${{ secrets.SYNTEXT_TOKEN }}
        env:
          SYNTEXT_PROJECT_ID: \${{ vars.SYNTEXT_PROJECT_ID }}

      - name: Deploy preview
        if: github.event_name == 'pull_request'
        run: syntext deploy --preview --branch \${{ github.head_ref }} --token \${{ secrets.SYNTEXT_TOKEN }}
        env:
          SYNTEXT_PROJECT_ID: \${{ vars.SYNTEXT_PROJECT_ID }}
`
}

function generateGitLabCITemplate(options: CITemplateOptions): string {
  const branch = options.branch ?? 'main'
  return `# .gitlab-ci.yml
# Auto-deploy documentation on push to ${branch}
image: oven/bun:latest

stages:
  - build
  - deploy

variables:
  SYNTEXT_PROJECT_ID: \$SYNTEXT_PROJECT_ID

build-docs:
  stage: build
  script:
    - bun install -g syntext
    - syntext build
  artifacts:
    paths:
      - dist/
  only:
    changes:
      - docs/**/*
      - syntext.config.*
      - openapi.*

deploy-docs:
  stage: deploy
  script:
    - bun install -g syntext
    - syntext deploy --token \$SYNTEXT_TOKEN
  only:
    refs:
      - ${branch}
    changes:
      - docs/**/*
      - syntext.config.*
  environment:
    name: production
    url: https://\$CI_PROJECT_NAME-docs.syntext.dev

deploy-preview:
  stage: deploy
  script:
    - bun install -g syntext
    - syntext deploy --preview --branch \$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME --token \$SYNTEXT_TOKEN
  only:
    - merge_requests
  environment:
    name: preview/\$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME
    url: https://\$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME--\$CI_PROJECT_NAME-docs.syntext.dev
    on_stop: stop-preview

stop-preview:
  stage: deploy
  script:
    - echo "Preview environment stopped"
  when: manual
  only:
    - merge_requests
  environment:
    name: preview/\$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME
    action: stop
`
}

function generateBitbucketPipelinesTemplate(options: CITemplateOptions): string {
  const branch = options.branch ?? 'main'
  return `# bitbucket-pipelines.yml
# Auto-deploy documentation on push to ${branch}
image: oven/bun:latest

pipelines:
  branches:
    ${branch}:
      - step:
          name: Build & Deploy Docs
          caches:
            - node
          script:
            - bun install -g syntext
            - syntext build
            - syntext deploy --token $SYNTEXT_TOKEN
          artifacts:
            - dist/**

  pull-requests:
    '**':
      - step:
          name: Preview Deploy
          caches:
            - node
          script:
            - bun install -g syntext
            - syntext build
            - syntext deploy --preview --branch $BITBUCKET_BRANCH --token $SYNTEXT_TOKEN
`
}

/**
 * Generate a Dockerfile for self-hosted Syntext doc site builds.
 */
export function generateDockerfile(): string {
  return `# Syntext Documentation Builder
# Build and serve your docs locally or in any container environment.
#
# Usage:
#   docker build -t my-docs .
#   docker run -p 3000:3000 my-docs
#
# Or with Syntext CLI for deploy:
#   docker run --rm -e SYNTEXT_TOKEN=xxx my-docs syntext deploy

FROM oven/bun:1 AS builder

WORKDIR /app

# Install Syntext CLI
RUN bun install -g syntext

# Copy documentation source
COPY syntext.config.* ./
COPY docs/ ./docs/
COPY public/ ./public/

# Build static site
RUN syntext build

# Production: serve with a lightweight static server
FROM oven/bun:1-slim AS runner

WORKDIR /app

# Install a minimal static file server
RUN bun install -g serve

# Copy built assets
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "dist", "-l", "3000"]
`
}

/**
 * Generate a docker-compose.yml for local development with Syntext.
 */
export function generateDockerCompose(): string {
  return `# docker-compose.yml
# Local development with hot reload
version: '3.8'

services:
  docs:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./docs:/app/docs
      - ./syntext.config.ts:/app/syntext.config.ts
    command: syntext dev --port 3000 --host 0.0.0.0
`
}
