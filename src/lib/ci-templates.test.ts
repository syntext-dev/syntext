import { describe, it, expect } from 'bun:test'
import { generateCITemplate, generateDockerfile, generateDockerCompose } from './ci-templates'

describe('CI Templates', () => {
  describe('GitHub Actions', () => {
    it('should generate a valid GitHub Actions workflow', () => {
      const template = generateCITemplate({ provider: 'github', branch: 'main' })
      expect(template).toContain('name: Deploy Docs')
      expect(template).toContain('push:')
      expect(template).toContain('pull_request:')
      expect(template).toContain('stx build')
      expect(template).toContain('stx deploy')
      expect(template).toContain('SYNTEXT_TOKEN')
      expect(template).toContain('setup-bun')
    })

    it('should support custom branch', () => {
      const template = generateCITemplate({ provider: 'github', branch: 'develop' })
      expect(template).toContain('branches: [develop]')
    })

    it('should include preview deploy for PRs', () => {
      const template = generateCITemplate({ provider: 'github' })
      expect(template).toContain('--preview')
      expect(template).toContain('github.head_ref')
    })
  })

  describe('GitLab CI', () => {
    it('should generate a valid GitLab CI config', () => {
      const template = generateCITemplate({ provider: 'gitlab', branch: 'main' })
      expect(template).toContain('image: oven/bun:latest')
      expect(template).toContain('stages:')
      expect(template).toContain('deploy-docs:')
      expect(template).toContain('stx deploy')
      expect(template).toContain('SYNTEXT_TOKEN')
    })

    it('should include merge request preview deploys', () => {
      const template = generateCITemplate({ provider: 'gitlab' })
      expect(template).toContain('deploy-preview:')
      expect(template).toContain('merge_requests')
      expect(template).toContain('--preview')
    })
  })

  describe('Bitbucket Pipelines', () => {
    it('should generate a valid Bitbucket Pipelines config', () => {
      const template = generateCITemplate({ provider: 'bitbucket', branch: 'main' })
      expect(template).toContain('image: oven/bun:latest')
      expect(template).toContain('pipelines:')
      expect(template).toContain('stx build')
      expect(template).toContain('stx deploy')
      expect(template).toContain('SYNTEXT_TOKEN')
    })

    it('should include pull request preview deploys', () => {
      const template = generateCITemplate({ provider: 'bitbucket' })
      expect(template).toContain('pull-requests:')
      expect(template).toContain('--preview')
    })
  })

  describe('Dockerfile', () => {
    it('should generate a multi-stage Dockerfile', () => {
      const dockerfile = generateDockerfile()
      expect(dockerfile).toContain('FROM oven/bun:1 AS builder')
      expect(dockerfile).toContain('FROM oven/bun:1-slim AS runner')
      expect(dockerfile).toContain('stx build')
      expect(dockerfile).toContain('EXPOSE 3000')
      expect(dockerfile).toContain('COPY docs/')
    })
  })

  describe('Docker Compose', () => {
    it('should generate a docker-compose config', () => {
      const compose = generateDockerCompose()
      expect(compose).toContain('services:')
      expect(compose).toContain('stx dev')
      expect(compose).toContain('ports:')
      expect(compose).toContain('volumes:')
    })
  })
})
