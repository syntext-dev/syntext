/**
 * Protocol-specific MDX component renderers for Syntext documentation.
 * These handle WebSocket, GraphQL, CLI, gRPC, Event-Driven, and Universal components.
 */

import type { MdxJsxFlowElement } from './remark-components'

function getAttr(node: MdxJsxFlowElement, name: string): string {
  const attr = node.attributes?.find(
    (a: any) => a.type === 'mdxJsxAttribute' && a.name === name,
  )
  if (!attr) return ''
  if (typeof attr.value === 'string') return attr.value
  if (attr.value?.value) return attr.value.value
  return ''
}

function getChildren(node: MdxJsxFlowElement): string {
  return (node.children || [])
    .map((child: any) => {
      if (child.type === 'text') return child.value || ''
      if (child.type === 'paragraph') return (child.children || []).map((c: any) => c.value || '').join('')
      return ''
    })
    .join('')
    .trim()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ============ REST / HTTP ============

export function renderResponseExample(node: MdxJsxFlowElement): string {
  const status = getAttr(node, 'status') || '200'
  const content = getChildren(node)

  const statusClass = Number(status) >= 400 ? 'stx-response-error' : 'stx-response-success'

  return `<div class="stx-response-example ${statusClass}">
    <div class="stx-response-header"><span class="stx-response-status">${escapeHtml(status)}</span> Response</div>
    <pre class="stx-response-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

// ============ WebSocket ============

export function renderWebSocketEndpoint(node: MdxJsxFlowElement): string {
  const url = getAttr(node, 'url')
  const protocol = getAttr(node, 'protocol') || 'wss'

  return `<div class="stx-ws-endpoint">
    <div class="stx-ws-badge">WebSocket</div>
    <code class="stx-ws-url">${escapeHtml(url)}</code>
    <span class="stx-ws-protocol">${escapeHtml(protocol)}</span>
  </div>`
}

export function renderWsEvent(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const direction = getAttr(node, 'direction') || 'server→client'
  const content = getChildren(node)
  const dirClass = direction.includes('client') && direction.includes('server')
    ? (direction.startsWith('client') ? 'stx-ws-dir-out' : 'stx-ws-dir-in')
    : 'stx-ws-dir-in'

  return `<div class="stx-ws-event ${dirClass}">
    <div class="stx-ws-event-header">
      <span class="stx-ws-event-name">${escapeHtml(name)}</span>
      <span class="stx-ws-direction">${escapeHtml(direction)}</span>
    </div>
    <div class="stx-ws-event-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderMessagePayload(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-message-payload">
    <div class="stx-payload-header">Payload Schema</div>
    <pre class="stx-payload-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderConnectionFlow(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-connection-flow">
    <div class="stx-flow-header">Connection Lifecycle</div>
    <div class="stx-flow-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderWsPlayground(node: MdxJsxFlowElement): string {
  const url = getAttr(node, 'url') || ''
  return `<div class="stx-ws-playground" data-url="${escapeHtml(url)}">
    <div class="stx-playground-header">WebSocket Playground</div>
    <div class="stx-playground-notice">Connect and send messages to test the WebSocket endpoint.</div>
    <div class="stx-ws-connect"><input type="text" value="${escapeHtml(url)}" placeholder="wss://..." class="stx-ws-url-input" /><button class="stx-ws-connect-btn">Connect</button></div>
    <div class="stx-ws-messages"></div>
    <div class="stx-ws-send"><input type="text" placeholder="Enter message..." class="stx-ws-msg-input" /><button class="stx-ws-send-btn">Send</button></div>
  </div>`
}

export function renderChannelList(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-channel-list">
    <div class="stx-channel-header">Channels</div>
    <div class="stx-channel-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderEventCatalog(node: MdxJsxFlowElement): string {
  const filter = getAttr(node, 'filter')
  return `<div class="stx-event-catalog" data-filter="${escapeHtml(filter)}">
    <div class="stx-catalog-header">Event Catalog${filter ? ` <span class="stx-catalog-filter">${escapeHtml(filter)}</span>` : ''}</div>
    <div class="stx-catalog-body">${getChildren(node)}</div>
  </div>`
}

export function renderHeartbeat(node: MdxJsxFlowElement): string {
  const interval = getAttr(node, 'interval') || '30s'
  return `<div class="stx-heartbeat">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    <span>Heartbeat: ping/pong every <strong>${escapeHtml(interval)}</strong></span>
  </div>`
}

export function renderReconnectionStrategy(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-reconnection">
    <div class="stx-reconnection-header">Reconnection Strategy</div>
    <div class="stx-reconnection-body">${escapeHtml(content)}</div>
  </div>`
}

// ============ GraphQL ============

export function renderGraphQLType(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-gql-type">
    <div class="stx-gql-type-header"><span class="stx-gql-badge">type</span> <span class="stx-gql-name">${escapeHtml(name)}</span></div>
    <pre class="stx-gql-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderGraphQLQuery(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-gql-operation stx-gql-query">
    <div class="stx-gql-op-header"><span class="stx-gql-badge stx-gql-badge-query">query</span> <span class="stx-gql-name">${escapeHtml(name)}</span></div>
    <pre class="stx-gql-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderGraphQLMutation(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-gql-operation stx-gql-mutation">
    <div class="stx-gql-op-header"><span class="stx-gql-badge stx-gql-badge-mutation">mutation</span> <span class="stx-gql-name">${escapeHtml(name)}</span></div>
    <pre class="stx-gql-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderGraphQLSubscription(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-gql-operation stx-gql-subscription">
    <div class="stx-gql-op-header"><span class="stx-gql-badge stx-gql-badge-sub">subscription</span> <span class="stx-gql-name">${escapeHtml(name)}</span></div>
    <pre class="stx-gql-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderSchemaExplorer(node: MdxJsxFlowElement): string {
  return `<div class="stx-schema-explorer">
    <div class="stx-schema-header">Schema Explorer</div>
    <div class="stx-schema-notice">Interactive schema browser loads on page render.</div>
  </div>`
}

export function renderGraphQLPlayground(node: MdxJsxFlowElement): string {
  const endpoint = getAttr(node, 'endpoint') || ''
  return `<div class="stx-gql-playground" data-endpoint="${escapeHtml(endpoint)}">
    <div class="stx-playground-header">GraphQL Playground</div>
    <textarea class="stx-gql-query-input" placeholder="query { ... }"></textarea>
    <button class="stx-gql-execute-btn">Execute</button>
    <pre class="stx-gql-response"></pre>
  </div>`
}

export function renderFieldTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-field-table">
    <table><thead><tr><th>Field</th><th>Type</th><th>Nullable</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderEnumValues(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-enum-values">
    <div class="stx-enum-header"><span class="stx-gql-badge">enum</span> <span class="stx-gql-name">${escapeHtml(name)}</span></div>
    <div class="stx-enum-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderTypeLink(node: MdxJsxFlowElement): string {
  const to = getAttr(node, 'to')
  return `<a class="stx-type-link" href="#${escapeHtml(to.toLowerCase())}">${escapeHtml(to)}</a>`
}

export function renderDeprecatedField(node: MdxJsxFlowElement): string {
  const reason = getAttr(node, 'reason')
  const removeDate = getAttr(node, 'removeDate')
  return `<span class="stx-deprecated-field">⚠️ Deprecated${reason ? `: ${escapeHtml(reason)}` : ''}${removeDate ? ` (removes ${escapeHtml(removeDate)})` : ''}</span>`
}

export function renderQueryComplexity(node: MdxJsxFlowElement): string {
  const cost = getAttr(node, 'cost')
  const max = getAttr(node, 'max')
  return `<div class="stx-query-complexity"><span class="stx-complexity-label">Complexity:</span> <span class="stx-complexity-cost">${escapeHtml(cost)}</span>${max ? ` / <span class="stx-complexity-max">${escapeHtml(max)}</span>` : ''}</div>`
}

// ============ CLI ============

export function renderCommand(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-command">
    <div class="stx-command-header"><code class="stx-command-name">$ ${escapeHtml(name)}</code></div>
    <div class="stx-command-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderSubcommands(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-subcommands">
    <div class="stx-subcommands-header">Subcommands</div>
    <div class="stx-subcommands-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderFlagTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-flag-table">
    <table><thead><tr><th>Flag</th><th>Alias</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderArgTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-arg-table">
    <table><thead><tr><th>Argument</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderTerminalOutput(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-terminal-output"><pre><code>${escapeHtml(content)}</code></pre></div>`
}

export function renderCliPlayground(node: MdxJsxFlowElement): string {
  const command = getAttr(node, 'command') || ''
  return `<div class="stx-cli-playground" data-command="${escapeHtml(command)}">
    <div class="stx-playground-header">CLI Playground</div>
    <div class="stx-terminal-sim"><span class="stx-prompt">$</span> <span class="stx-cmd">${escapeHtml(command)}</span></div>
  </div>`
}

export function renderInstallSnippet(node: MdxJsxFlowElement): string {
  const pkg = getAttr(node, 'package')
  return `<div class="stx-install-snippet">
    <div class="stx-install-tabs">
      <button class="stx-install-tab active" data-method="npm">npm</button>
      <button class="stx-install-tab" data-method="yarn">yarn</button>
      <button class="stx-install-tab" data-method="bun">bun</button>
      <button class="stx-install-tab" data-method="brew">brew</button>
    </div>
    <pre class="stx-install-cmd" data-method="npm"><code>npm install ${escapeHtml(pkg)}</code></pre>
    <pre class="stx-install-cmd" data-method="yarn" style="display:none"><code>yarn add ${escapeHtml(pkg)}</code></pre>
    <pre class="stx-install-cmd" data-method="bun" style="display:none"><code>bun add ${escapeHtml(pkg)}</code></pre>
    <pre class="stx-install-cmd" data-method="brew" style="display:none"><code>brew install ${escapeHtml(pkg)}</code></pre>
  </div>`
}

export function renderEnvVarTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-envvar-table">
    <table><thead><tr><th>Variable</th><th>Required</th><th>Default</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderExitCodes(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-exit-codes">
    <table><thead><tr><th>Code</th><th>Meaning</th><th>Resolution</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderShellCompletion(node: MdxJsxFlowElement): string {
  const shells = getAttr(node, 'shells') || 'bash,zsh,fish'
  const shellList = shells.split(',').map((s) => s.trim())
  return `<div class="stx-shell-completion">
    <div class="stx-shell-header">Shell Completion</div>
    ${shellList.map((shell) => `<div class="stx-shell-item"><strong>${escapeHtml(shell)}</strong></div>`).join('')}
  </div>`
}

export function renderUsageExample(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-usage-example">
    <div class="stx-usage-header">Usage Example</div>
    <div class="stx-usage-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderConfigFile(node: MdxJsxFlowElement): string {
  const format = getAttr(node, 'format') || 'yaml'
  const schema = getAttr(node, 'schema') || ''
  const content = getChildren(node)
  return `<div class="stx-config-file">
    <div class="stx-config-header"><span class="stx-config-format">${escapeHtml(format)}</span> ${escapeHtml(schema)}</div>
    <pre class="stx-config-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

// ============ gRPC / Protobuf ============

export function renderGrpcService(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-grpc-service">
    <div class="stx-grpc-header"><span class="stx-grpc-badge">service</span> <span class="stx-grpc-name">${escapeHtml(name)}</span></div>
    <div class="stx-grpc-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderRpcMethod(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const type = getAttr(node, 'type') || 'unary'
  const content = getChildren(node)
  const typeLabels: Record<string, string> = {
    'unary': 'Unary',
    'server-stream': 'Server Streaming',
    'client-stream': 'Client Streaming',
    'bidirectional': 'Bidirectional',
  }
  return `<div class="stx-rpc-method stx-rpc-${type}">
    <div class="stx-rpc-header"><span class="stx-rpc-type">${typeLabels[type] || type}</span> <code class="stx-rpc-name">${escapeHtml(name)}</code></div>
    <div class="stx-rpc-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderProtoMessage(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-proto-message">
    <div class="stx-proto-header"><span class="stx-proto-badge">message</span> <span class="stx-proto-name">${escapeHtml(name)}</span></div>
    <pre class="stx-proto-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderProtoEnum(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-proto-enum">
    <div class="stx-proto-header"><span class="stx-proto-badge">enum</span> <span class="stx-proto-name">${escapeHtml(name)}</span></div>
    <pre class="stx-proto-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderProtoFieldTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-proto-field-table">
    <table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>Rule</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderGrpcPlayground(node: MdxJsxFlowElement): string {
  return `<div class="stx-grpc-playground">
    <div class="stx-playground-header">gRPC Playground</div>
    <div class="stx-playground-notice">Interactive gRPC request builder. Select a method and provide request payload.</div>
  </div>`
}

export function renderStreamingDiagram(node: MdxJsxFlowElement): string {
  const type = getAttr(node, 'type') || 'unary'
  return `<div class="stx-streaming-diagram stx-stream-${escapeHtml(type)}">
    <div class="stx-stream-header">${escapeHtml(type)} streaming</div>
    <div class="stx-stream-visual">Client ⟶ Server${type === 'bidirectional' ? ' ⟵' : ''}</div>
  </div>`
}

export function renderStatusCodes(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-status-codes">
    <table><thead><tr><th>Code</th><th>Name</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

export function renderMetadataTable(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-metadata-table">
    <table><thead><tr><th>Key</th><th>Type</th><th>Description</th></tr></thead>
    <tbody>${escapeHtml(content)}</tbody></table>
  </div>`
}

// ============ Event-Driven / AsyncAPI ============

export function renderChannel(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const protocol = getAttr(node, 'protocol') || 'kafka'
  const content = getChildren(node)
  return `<div class="stx-channel">
    <div class="stx-channel-header"><span class="stx-channel-badge">${escapeHtml(protocol)}</span> <code class="stx-channel-name">${escapeHtml(name)}</code></div>
    <div class="stx-channel-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderEventMessage(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const operation = getAttr(node, 'operation') || 'publish'
  const content = getChildren(node)
  return `<div class="stx-event-message stx-event-${escapeHtml(operation)}">
    <div class="stx-event-header"><span class="stx-event-op">${escapeHtml(operation)}</span> <span class="stx-event-name">${escapeHtml(name)}</span></div>
    <div class="stx-event-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderMessageFlow(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-message-flow">
    <div class="stx-flow-header">Message Flow</div>
    <div class="stx-flow-visual">Producer → Broker → Consumer</div>
    <div class="stx-flow-details">${escapeHtml(content)}</div>
  </div>`
}

export function renderSchemaView(node: MdxJsxFlowElement): string {
  const format = getAttr(node, 'format') || 'json'
  const content = getChildren(node)
  return `<div class="stx-schema-view">
    <div class="stx-schema-header"><span class="stx-schema-format">${escapeHtml(format)}</span> Schema</div>
    <pre class="stx-schema-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderBrokerInfo(node: MdxJsxFlowElement): string {
  const protocol = getAttr(node, 'protocol') || 'kafka'
  const content = getChildren(node)
  return `<div class="stx-broker-info">
    <div class="stx-broker-header"><span class="stx-broker-badge">${escapeHtml(protocol)}</span> Broker</div>
    <div class="stx-broker-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderRetryPolicy(node: MdxJsxFlowElement): string {
  const maxRetries = getAttr(node, 'maxRetries') || '3'
  const backoff = getAttr(node, 'backoff') || 'exponential'
  return `<div class="stx-retry-policy">
    <div class="stx-retry-header">Retry Policy</div>
    <div class="stx-retry-details"><strong>Max retries:</strong> ${escapeHtml(maxRetries)} &nbsp;|&nbsp; <strong>Backoff:</strong> ${escapeHtml(backoff)}</div>
  </div>`
}

export function renderConsumerGroup(node: MdxJsxFlowElement): string {
  const name = getAttr(node, 'name')
  const content = getChildren(node)
  return `<div class="stx-consumer-group">
    <div class="stx-consumer-header"><span class="stx-consumer-badge">consumer group</span> <code>${escapeHtml(name)}</code></div>
    <div class="stx-consumer-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderDeadLetterQueue(node: MdxJsxFlowElement): string {
  const topic = getAttr(node, 'topic')
  const content = getChildren(node)
  return `<div class="stx-dlq">
    <div class="stx-dlq-header"><span class="stx-dlq-badge">DLQ</span> <code>${escapeHtml(topic)}</code></div>
    <div class="stx-dlq-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderOrderingGuarantee(node: MdxJsxFlowElement): string {
  const type = getAttr(node, 'type') || 'partition-key'
  return `<div class="stx-ordering">
    <div class="stx-ordering-header">Ordering Guarantee</div>
    <div class="stx-ordering-type">${escapeHtml(type)}</div>
  </div>`
}

// ============ Universal ============

export function renderSequenceDiagram(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-sequence-diagram">
    <div class="stx-seq-header">Sequence Diagram</div>
    <pre class="stx-seq-body mermaid">${escapeHtml(content)}</pre>
  </div>`
}

export function renderSchemaViewer(node: MdxJsxFlowElement): string {
  const content = getChildren(node)
  return `<div class="stx-schema-viewer">
    <div class="stx-schema-header">Schema</div>
    <pre class="stx-schema-body"><code>${escapeHtml(content)}</code></pre>
  </div>`
}

export function renderVersionBadge(node: MdxJsxFlowElement): string {
  const added = getAttr(node, 'added')
  const deprecated = getAttr(node, 'deprecated')
  const removed = getAttr(node, 'removed')
  const parts: string[] = []
  if (added) parts.push(`<span class="stx-badge stx-badge-added">Added ${escapeHtml(added)}</span>`)
  if (deprecated) parts.push(`<span class="stx-badge stx-badge-deprecated">Deprecated ${escapeHtml(deprecated)}</span>`)
  if (removed) parts.push(`<span class="stx-badge stx-badge-removed">Removed ${escapeHtml(removed)}</span>`)
  return `<div class="stx-version-badges">${parts.join(' ')}</div>`
}

export function renderPermissionBadge(node: MdxJsxFlowElement): string {
  const requires = getAttr(node, 'requires')
  return `<span class="stx-badge stx-badge-permission">🔒 ${escapeHtml(requires)}</span>`
}

export function renderRateLimitBadge(node: MdxJsxFlowElement): string {
  const limit = getAttr(node, 'limit')
  return `<span class="stx-badge stx-badge-ratelimit">⏱ ${escapeHtml(limit)}</span>`
}

export function renderBreakingChange(node: MdxJsxFlowElement): string {
  const version = getAttr(node, 'version')
  const content = getChildren(node)
  return `<div class="stx-breaking-change">
    <div class="stx-breaking-header">⚠️ Breaking Change ${version ? `in ${escapeHtml(version)}` : ''}</div>
    <div class="stx-breaking-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderSdkSnippet(node: MdxJsxFlowElement): string {
  const languages = getAttr(node, 'languages') || 'ts,python,go'
  const content = getChildren(node)
  const langs = languages.split(',').map((l) => l.trim())
  return `<div class="stx-sdk-snippet">
    <div class="stx-sdk-tabs">${langs.map((l, i) => `<button class="stx-sdk-tab${i === 0 ? ' active' : ''}" data-lang="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}</div>
    <div class="stx-sdk-body">${escapeHtml(content)}</div>
  </div>`
}

export function renderAuthFlow(node: MdxJsxFlowElement): string {
  const type = getAttr(node, 'type') || 'oauth2'
  return `<div class="stx-auth-flow">
    <div class="stx-auth-header">Authentication Flow: ${escapeHtml(type)}</div>
    <div class="stx-auth-visual">Client → Authorization Server → Resource Server</div>
  </div>`
}

export function renderStatusIndicator(node: MdxJsxFlowElement): string {
  const service = getAttr(node, 'service')
  return `<div class="stx-status-indicator" data-service="${escapeHtml(service)}">
    <span class="stx-status-dot"></span> <span class="stx-status-name">${escapeHtml(service)}</span>
  </div>`
}

/**
 * Map of all protocol-specific component names to their render functions.
 */
export const protocolComponentRenderers: Record<string, (node: MdxJsxFlowElement) => string> = {
  // REST
  ResponseExample: renderResponseExample,
  // WebSocket
  WebSocketEndpoint: renderWebSocketEndpoint,
  WsEvent: renderWsEvent,
  MessagePayload: renderMessagePayload,
  ConnectionFlow: renderConnectionFlow,
  WsPlayground: renderWsPlayground,
  ChannelList: renderChannelList,
  EventCatalog: renderEventCatalog,
  Heartbeat: renderHeartbeat,
  ReconnectionStrategy: renderReconnectionStrategy,
  // GraphQL
  GraphQLType: renderGraphQLType,
  GraphQLQuery: renderGraphQLQuery,
  GraphQLMutation: renderGraphQLMutation,
  GraphQLSubscription: renderGraphQLSubscription,
  SchemaExplorer: renderSchemaExplorer,
  GraphQLPlayground: renderGraphQLPlayground,
  FieldTable: renderFieldTable,
  EnumValues: renderEnumValues,
  TypeLink: renderTypeLink,
  DeprecatedField: renderDeprecatedField,
  QueryComplexity: renderQueryComplexity,
  // CLI
  Command: renderCommand,
  Subcommands: renderSubcommands,
  FlagTable: renderFlagTable,
  ArgTable: renderArgTable,
  TerminalOutput: renderTerminalOutput,
  CliPlayground: renderCliPlayground,
  InstallSnippet: renderInstallSnippet,
  EnvVarTable: renderEnvVarTable,
  ExitCodes: renderExitCodes,
  ShellCompletion: renderShellCompletion,
  UsageExample: renderUsageExample,
  ConfigFile: renderConfigFile,
  // gRPC
  GrpcService: renderGrpcService,
  RpcMethod: renderRpcMethod,
  ProtoMessage: renderProtoMessage,
  ProtoEnum: renderProtoEnum,
  ProtoFieldTable: renderProtoFieldTable,
  GrpcPlayground: renderGrpcPlayground,
  StreamingDiagram: renderStreamingDiagram,
  StatusCodes: renderStatusCodes,
  MetadataTable: renderMetadataTable,
  // Event-Driven
  Channel: renderChannel,
  EventMessage: renderEventMessage,
  MessageFlow: renderMessageFlow,
  SchemaView: renderSchemaView,
  BrokerInfo: renderBrokerInfo,
  RetryPolicy: renderRetryPolicy,
  ConsumerGroup: renderConsumerGroup,
  DeadLetterQueue: renderDeadLetterQueue,
  OrderingGuarantee: renderOrderingGuarantee,
  // Universal
  SequenceDiagram: renderSequenceDiagram,
  SchemaViewer: renderSchemaViewer,
  VersionBadge: renderVersionBadge,
  PermissionBadge: renderPermissionBadge,
  RateLimitBadge: renderRateLimitBadge,
  BreakingChange: renderBreakingChange,
  SdkSnippet: renderSdkSnippet,
  AuthFlow: renderAuthFlow,
  StatusIndicator: renderStatusIndicator,
}
