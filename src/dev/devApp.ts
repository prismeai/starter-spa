/**
 * The `app` object of `npm run dev`. Same shape as the kit's `McpApp`
 * (checked by TypeScript), so the code that runs here runs deployed.
 *
 * - `npm run dev`: everything is simulated in the browser.
 * - `npm run dev:live`: webhooks, MCP tools and the user come from your
 *   workspace, through the Vite proxy (`/__prisme`), which adds your access
 *   token on the server side: the token never reaches the browser. Workspace
 *   events and the agent stay simulated.
 */
import {
  AGENT_EXTENSION,
  EVENTS_EXTENSION,
  NAVIGATION_EXTENSION,
  USER_EXTENSION,
  WEBHOOKS_EXTENSION,
  type BridgeEvent,
  type BridgeUser,
  type CallToolResult,
  type McpApp,
} from '@prisme.ai/mcp-apps'

const LIVE = import.meta.env.VITE_PRISME_LIVE === 'true'
const CAPABILITIES = new Set([WEBHOOKS_EXTENSION, EVENTS_EXTENSION, USER_EXTENSION, NAVIGATION_EXTENSION, AGENT_EXTENSION])

type Listener = (event: BridgeEvent) => void

async function proxied<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/__prisme' + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text.slice(0, 200)}`)
  return body as T
}

/** Simulated answers of the starter's automations. */
const simulated = {
  webhook: (path: string) => ({ status: 'ok', timestamp: new Date().toISOString(), auth_type: 'user', note: `simulated ${path} (npm run dev:live calls your workspace)` }),
  tool: (name: string, args: Record<string, unknown>): CallToolResult => ({
    content: [{ type: 'text', text: name === 'hello' ? `Hello ${String(args.name ?? 'World')}! (simulated)` : `No simulated tool "${name}"` }],
    isError: name !== 'hello',
  }),
}

let rpcId = 0

/** `view`: the view a tool shows in the chat (`?view=hello-card`), with a simulated tool call. */
export async function createDevApp(view?: string): Promise<McpApp> {
  const listeners = new Map<string, Set<Listener>>()
  const routeListeners = new Set<(path: string) => void>()
  const route = () => window.location.hash.replace(/^#/, '') || '/'
  window.addEventListener('hashchange', () => routeListeners.forEach((l) => l(route())))

  let user: BridgeUser | undefined = { id: 'local-user', name: 'Local developer', email: 'dev@example.com' }
  if (LIVE) {
    try {
      const me = await proxied<{ id: string; firstName?: string; lastName?: string; name?: string; email?: string }>('/me')
      user = { id: me.id, name: me.name ?? ([me.firstName, me.lastName].filter(Boolean).join(' ') || undefined), email: me.email }
    } catch (err) {
      console.warn('[dev] could not read the user', err)
    }
  }

  const deliver = (type: string, payload: unknown) => listeners.get(type)?.forEach((l) => l({ type, payload }))

  const toolInput = view ? { name: 'World' } : undefined
  const toolResult = view ? simulated.tool('hello', { name: 'World' }) : undefined
  const noop = () => () => {}

  const app = {
    toolInput,
    toolResult,
    onToolInput: noop,
    onToolInputPartial: noop,
    onToolResult: noop,
    onHostContextChanged: noop,
    sendMessage: async (text: string) => {
      console.info('[dev] app.sendMessage: in the chat, the user confirms, then this fills the composer:', text)
      return {}
    },
    hostContext: { theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' },
    portalContainer: null,
    hasCapability: (name: string) => CAPABILITIES.has(name),
    user,
    webhooks: {
      call: async <T = unknown>(path: string, options: { method?: string; body?: unknown; query?: Record<string, string> } = {}) => {
        if (!LIVE) return simulated.webhook(path) as T
        const query = options.query ? '?' + new URLSearchParams(options.query) : ''
        return proxied<T>(`/webhooks/${path}${query}`, {
          method: options.method ?? 'POST',
          ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
        })
      },
    },
    events: {
      on: (type: string, listener: Listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(listener)
        return () => void listeners.get(type)?.delete(listener)
      },
      emit: async (type: string, payload?: unknown) => {
        console.info('[dev] event', type, payload)
        // The starter's automation, simulated: it answers app.greeting.requested.
        if (type === 'app.greeting.requested') {
          const name = (payload as { name?: string } | undefined)?.name ?? 'World'
          setTimeout(() => deliver('app.greeting.completed', { message: `Hello ${name} from the automation! (simulated)` }), 300)
        }
      },
    },
    navigation: {
      current: route,
      navigate: async (path: string) => {
        window.location.hash = path
      },
      onChange: (listener: (path: string) => void) => {
        routeListeners.add(listener)
        return () => void routeListeners.delete(listener)
      },
    },
    agent: {
      name: () => 'Your agent',
      open: async () => {
        console.info('[dev] app.agent.open(): deployed, the agent chat opens next to the app')
        // Lets you try the A2UI step: a button of the agent's answer, clicked.
        setTimeout(() => deliver('agent.action', { name: 'approve', surfaceId: 'dev', sourceComponentId: 'approve', data: { amount: 1200 } }), 800)
      },
      close: async () => {},
    },
    callServerTool: async (name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> => {
      if (!LIVE) return simulated.tool(name, args)
      const answer = await proxied<{ result?: CallToolResult; error?: { message: string } }>('/webhooks/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
      })
      if (answer.error) throw new Error(answer.error.message)
      return answer.result ?? { content: [] }
    },
    updateModelContext: async (params: unknown) => {
      console.info('[dev] context for the agent', params)
      return {}
    },
    openLink: async (url: string) => {
      window.open(url, '_blank', 'noopener')
      return {}
    },
  }
  // Only what the starter uses is implemented: TypeScript checks the shapes
  // above against the kit; a member you add must be added here too.
  return app as unknown as McpApp
}
