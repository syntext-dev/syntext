import { describe, it, expect } from 'bun:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { remarkComponents } from './remark-components'

async function process(mdx: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkComponents)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(mdx)
  return String(result)
}

// Flow-level MDX requires the component to be on its own line
function flow(tag: string): string {
  return `\n${tag}\n`
}

describe('Protocol Components', () => {
  describe('WebSocket', () => {
    it('should render WebSocketEndpoint', async () => {
      const html = await process(flow('<WebSocketEndpoint url="wss://api.example.com/ws" />'))
      expect(html).toContain('stx-ws-endpoint')
      expect(html).toContain('wss://api.example.com/ws')
      expect(html).toContain('WebSocket')
    })

    it('should render WsEvent with direction', async () => {
      const html = await process(flow('<WsEvent name="order.created" direction="server→client">\nPayload docs\n</WsEvent>'))
      expect(html).toContain('stx-ws-event')
      expect(html).toContain('order.created')
      expect(html).toContain('server→client')
    })

    it('should render Heartbeat', async () => {
      const html = await process(flow('<Heartbeat interval="30s" />'))
      expect(html).toContain('stx-heartbeat')
      expect(html).toContain('30s')
    })
  })

  describe('GraphQL', () => {
    it('should render GraphQLType', async () => {
      const html = await process(flow('<GraphQLType name="User">\ntype User with fields\n</GraphQLType>'))
      expect(html).toContain('stx-gql-type')
      expect(html).toContain('User')
      expect(html).toContain('type')
    })

    it('should render GraphQLQuery', async () => {
      const html = await process(flow('<GraphQLQuery name="getUser">\nget user by id\n</GraphQLQuery>'))
      expect(html).toContain('stx-gql-query')
      expect(html).toContain('getUser')
      expect(html).toContain('query')
    })

    it('should render GraphQLMutation', async () => {
      const html = await process(flow('<GraphQLMutation name="createOrder">\nmutation { createOrder }\n</GraphQLMutation>'))
      expect(html).toContain('stx-gql-mutation')
      expect(html).toContain('createOrder')
    })

    it('should render DeprecatedField', async () => {
      const html = await process(flow('<DeprecatedField reason="Use userId instead" removeDate="2027-03" />'))
      expect(html).toContain('stx-deprecated-field')
      expect(html).toContain('Use userId instead')
      expect(html).toContain('2027-03')
    })

    it('should render TypeLink', async () => {
      const html = await process(flow('<TypeLink to="PaymentInput" />'))
      expect(html).toContain('stx-type-link')
      expect(html).toContain('PaymentInput')
    })

    it('should render QueryComplexity', async () => {
      const html = await process(flow('<QueryComplexity cost="12" max="100" />'))
      expect(html).toContain('stx-query-complexity')
      expect(html).toContain('12')
      expect(html).toContain('100')
    })
  })

  describe('CLI', () => {
    it('should render Command', async () => {
      const html = await process(flow('<Command name="syntext deploy">\nDeploy your docs\n</Command>'))
      expect(html).toContain('stx-command')
      expect(html).toContain('syntext deploy')
    })

    it('should render InstallSnippet', async () => {
      const html = await process(flow('<InstallSnippet package="syntext" />'))
      expect(html).toContain('stx-install-snippet')
      expect(html).toContain('npm install syntext')
      expect(html).toContain('bun add syntext')
      expect(html).toContain('brew install syntext')
    })

    it('should render TerminalOutput', async () => {
      const html = await process(flow('<TerminalOutput>\nBuild complete in 1.2s\n</TerminalOutput>'))
      expect(html).toContain('stx-terminal-output')
      expect(html).toContain('Build complete')
    })
  })

  describe('gRPC', () => {
    it('should render GrpcService', async () => {
      const html = await process(flow('<GrpcService name="PaymentService">\nService docs\n</GrpcService>'))
      expect(html).toContain('stx-grpc-service')
      expect(html).toContain('PaymentService')
    })

    it('should render RpcMethod', async () => {
      const html = await process(flow('<RpcMethod name="CreatePayment" type="unary">\nCreates a payment\n</RpcMethod>'))
      expect(html).toContain('stx-rpc-method')
      expect(html).toContain('CreatePayment')
      expect(html).toContain('Unary')
    })

    it('should render streaming RpcMethod', async () => {
      const html = await process(flow('<RpcMethod name="StreamOrders" type="server-stream">\nStreams orders\n</RpcMethod>'))
      expect(html).toContain('stx-rpc-server-stream')
      expect(html).toContain('Server Streaming')
    })

    it('should render ProtoMessage', async () => {
      const html = await process(flow('<ProtoMessage name="PaymentRequest">\nmessage body\n</ProtoMessage>'))
      expect(html).toContain('stx-proto-message')
      expect(html).toContain('PaymentRequest')
    })
  })

  describe('Event-Driven', () => {
    it('should render Channel', async () => {
      const html = await process(flow('<Channel name="orders.created" protocol="kafka">\nChannel docs\n</Channel>'))
      expect(html).toContain('stx-channel')
      expect(html).toContain('orders.created')
      expect(html).toContain('kafka')
    })

    it('should render EventMessage', async () => {
      const html = await process(flow('<EventMessage name="OrderCreated" operation="publish">\nEvent info\n</EventMessage>'))
      expect(html).toContain('stx-event-message')
      expect(html).toContain('OrderCreated')
      expect(html).toContain('publish')
    })

    it('should render RetryPolicy', async () => {
      const html = await process(flow('<RetryPolicy maxRetries="5" backoff="exponential" />'))
      expect(html).toContain('stx-retry-policy')
      expect(html).toContain('5')
      expect(html).toContain('exponential')
    })

    it('should render DeadLetterQueue', async () => {
      const html = await process(flow('<DeadLetterQueue topic="orders.dlq">\nDLQ docs\n</DeadLetterQueue>'))
      expect(html).toContain('stx-dlq')
      expect(html).toContain('orders.dlq')
    })
  })

  describe('Universal', () => {
    it('should render VersionBadge', async () => {
      const html = await process(flow('<VersionBadge added="2.1" deprecated="3.0" removed="4.0" />'))
      expect(html).toContain('stx-badge-added')
      expect(html).toContain('2.1')
      expect(html).toContain('stx-badge-deprecated')
      expect(html).toContain('3.0')
      expect(html).toContain('stx-badge-removed')
      expect(html).toContain('4.0')
    })

    it('should render PermissionBadge', async () => {
      const html = await process(flow('<PermissionBadge requires="payments:write" />'))
      expect(html).toContain('stx-badge-permission')
      expect(html).toContain('payments:write')
    })

    it('should render RateLimitBadge', async () => {
      const html = await process(flow('<RateLimitBadge limit="100/min" />'))
      expect(html).toContain('stx-badge-ratelimit')
      expect(html).toContain('100/min')
    })

    it('should render BreakingChange', async () => {
      const html = await process(flow('<BreakingChange version="3.0">\nRemoved field X\n</BreakingChange>'))
      expect(html).toContain('stx-breaking-change')
      expect(html).toContain('3.0')
      expect(html).toContain('Removed field X')
    })

    it('should render AuthFlow', async () => {
      const html = await process(flow('<AuthFlow type="oauth2" />'))
      expect(html).toContain('stx-auth-flow')
      expect(html).toContain('oauth2')
    })

    it('should render StatusIndicator', async () => {
      const html = await process(flow('<StatusIndicator service="payments-api" />'))
      expect(html).toContain('stx-status-indicator')
      expect(html).toContain('payments-api')
    })
  })
})
