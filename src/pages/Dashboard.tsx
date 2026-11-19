/**
 * PRIVATE page: /dashboard . A tour of how the app works, one step each:
 *   1. app.user               who is signed in
 *   2. app.webhooks           the "v1/status" webhook
 *   3. app.events             "app.greeting.requested" in, "app.greeting.completed" out
 *   4. app.callServerTool     the "hello" tool of the workspace MCP server
 *   5. app.agent              the app's agent and what it sees on screen
 *   6. agent.action           the buttons the agent draws in its answer (A2UI)
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, CheckIcon, Loader2Icon, MessageCircleIcon } from 'lucide-react'
import { AGENT_EXTENSION, EVENTS_EXTENSION, WEBHOOKS_EXTENSION, type McpApp } from '@prisme.ai/mcp-apps'
import { Link } from '@/lib/router'
import { useHello } from '@/lib/hello'

/** One step of the tour: why, a button to try it, its result, and what did the work. */
export function Step({ n, done, title, why, children, files, snippet }: {
  n: number
  done: boolean
  title: string
  why: string
  children: ReactNode
  files: string
  snippet: string
}) {
  return (
    <section className={done ? 'step done' : 'step'} data-testid={'starter-step-' + n}>
      <div className="step-num">{done ? <CheckIcon size={14} /> : n}</div>
      <div className="step-body stack">
        <div>
          <h2 className="h2">{title}</h2>
          <p className="muted small">{why}</p>
        </div>
        {children}
        <details className="under-hood">
          <summary>Under the hood</summary>
          <p className="muted small">{files}</p>
          <pre className="code">{snippet}</pre>
        </details>
      </div>
    </section>
  )
}

function useRun<T>(run: () => Promise<T>) {
  const [result, setResult] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const go = async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await run())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }
  return { result, error, loading, go }
}

function TryButton({ loading, onClick, children, testId, disabled }: { loading: boolean; onClick: () => void; children: ReactNode; testId: string; disabled?: boolean }) {
  return (
    <button className="button outline" onClick={onClick} disabled={loading || disabled} data-testid={testId}>
      {loading ? <Loader2Icon size={14} className="spin" /> : null} {children}
    </button>
  )
}

export function WebhookStep({ app }: { app: McpApp }) {
  const call = useRun(() => app.webhooks.call('v1/status', { method: 'POST', body: {} }))
  return (
    <Step
      n={2}
      done={!!call.result}
      title="Call your backend"
      why="An automation with an endpoint is a webhook: the app calls it and gets its answer, like an API. The page adds your session, which the _auth guard checks."
      files="Automation v1/status. Code: app.webhooks.call."
      snippet={"const data = await app.webhooks.call('v1/status', { method: 'POST', body: {} })"}
    >
      <TryButton loading={call.loading} onClick={call.go} testId="starter-call-api" disabled={!app.hasCapability(WEBHOOKS_EXTENSION)}>Call v1/status</TryButton>
      {call.result != null && <pre className="result">{JSON.stringify(call.result, null, 2)}</pre>}
      {call.error && <p className="error small">{call.error}</p>}
    </Step>
  )
}

export function EventsStep({ app }: { app: McpApp }) {
  const available = app.hasCapability(EVENTS_EXTENSION)
  const [answer, setAnswer] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!available) return
    return app.events.on('app.greeting.completed', (event) => {
      const payload = event.payload as { message?: string } | null
      setAnswer(payload?.message ?? JSON.stringify(payload))
      setWaiting(false)
    })
  }, [app, available])
  const send = async () => {
    setWaiting(true)
    setAnswer(null)
    setError(null)
    try {
      await app.events.emit('app.greeting.requested', { name: app.user?.name ?? 'World' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setWaiting(false)
    }
  }
  return (
    <Step
      n={3}
      done={!!answer}
      title="Get a real-time answer"
      why="The app sends an event; an automation listens for it and answers with another event, which reaches only your session."
      files="Automation app.greeting (on app.greeting.requested, emits app.greeting.completed). Code: app.events."
      snippet={"app.events.on('app.greeting.completed', (e) => show(e.payload.message))\nawait app.events.emit('app.greeting.requested', { name: 'World' })"}
    >
      <TryButton loading={waiting} onClick={send} testId="starter-send-event" disabled={!available}>Send app.greeting.requested</TryButton>
      {answer && <p className="result ok">{answer}</p>}
      {error && <p className="error small">{error}</p>}
    </Step>
  )
}

export function ToolStep({ app }: { app: McpApp }) {
  const { message, error, loading, sayHello } = useHello(app)
  const [name, setName] = useState(app.user?.name ?? '')
  return (
    <Step
      n={4}
      done={!!message}
      title="Use a tool your agent also has"
      why="The workspace exposes tools as an MCP server, guarded like every webhook. The app calls them with your session, and an agent given the same server calls them as the user who talks to it."
      files="Automation mcp (tools/list, tools/call), tool hello, guarded by _auth. Code: app.callServerTool."
      snippet={"const result = await app.callServerTool('hello', { name: 'World' })"}
    >
      <div className="row">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-testid="starter-tool-name" />
        <TryButton loading={loading} onClick={() => void sayHello(name || 'World')} testId="starter-call-tool">Call hello</TryButton>
      </div>
      {message && <p className="result ok">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </Step>
  )
}

const NO_AGENT = 'No agent yet: set PRISMEAI_APP_AGENT in .env (or pick one under "Agent of the app" in the Builder\'s Deploy dialog), then deploy again.'

export function AgentStep({ app }: { app: McpApp }) {
  const available = app.hasCapability(AGENT_EXTENSION)
  const [opened, setOpened] = useState(false)
  // What the agent knows about the screen goes with the user's next question.
  useEffect(() => {
    if (!available) return
    void app.updateModelContext({ content: [{ type: 'text', text: 'The user is trying the starter app: the step about working with the agent.' }] })
  }, [app, available])
  return (
    <Step
      n={5}
      done={opened}
      title="Work with your agent"
      why={available
        ? 'The app opens its agent next to it and tells it what is on screen, so you ask about what you see.'
        : NO_AGENT}
      files="Deploy dialog: Agent of the app. Code: app.agent.open, app.updateModelContext."
      snippet={"app.agent.open()\nawait app.updateModelContext({ content: [{ type: 'text', text: 'What is on screen' }] })"}
    >
      {available && (
        <button className="button outline" onClick={() => { setOpened(true); void app.agent.open() }} data-testid="starter-ask-agent">
          <MessageCircleIcon size={14} /> Ask {app.agent.name() ?? 'the agent'}
        </button>
      )}
    </Step>
  )
}

/** Buttons the agent draws in its answer (A2UI): a click reaches the app at once, in the browser. */
export function AgentButtonsStep({ app }: { app: McpApp }) {
  const available = app.hasCapability(AGENT_EXTENSION)
  const [action, setAction] = useState<{ name: string; data: unknown } | null>(null)
  useEffect(() => {
    if (!available) return
    return app.events.on(
      'agent.action',
      (event) => {
        const payload = event.payload as { name: string; data: unknown }
        setAction({ name: payload.name, data: payload.data })
      },
      { scope: 'page' }
    )
  }, [app, available])
  return (
    <Step
      n={6}
      done={!!action}
      title="React to the agent's buttons (A2UI)"
      why={available
        ? "The agent can answer with interactive components (A2UI): cards, forms, buttons. When you click one, the app gets the action right away, to open a form or a record."
        : NO_AGENT}
      files="The agent needs an A2UI tool that waits for the user (wait_for_action: true). Code: the page event agent.action."
      snippet={"app.events.on('agent.action', (e) => {\n  if (e.payload.name === 'approve') openForm(e.payload.data)\n}, { scope: 'page' })"}
    >
      {available && (
        <>
          <button className="button outline" onClick={() => void app.agent.open()} data-testid="starter-ask-agent-buttons">
            <MessageCircleIcon size={14} /> Open {app.agent.name() ?? 'the agent'}
          </button>
          <p className="muted small">Then ask, for instance: "Show me an approval card for a 1,200 EUR laptop", and click Approve or Reject.</p>
          {action
            ? <p className="result ok" data-testid="starter-agent-action">The app received: <strong>{action.name}</strong> {JSON.stringify(action.data)}</p>
            : <p className="muted small" data-testid="starter-agent-action-empty">No button clicked yet.</p>}
        </>
      )}
    </Step>
  )
}

export function UserStep({ app }: { app: McpApp }) {
  const user = app.user
  return (
    <Step
      n={1}
      done={!!user}
      title="Know who is here"
      why="The page tells the app who is signed in. A public page gets no user."
      files="Code: app.user."
      snippet={'const name = app.user?.name'}
    >
      {user
        ? <p className="result" data-testid="starter-user">Signed in as <strong>{user.name ?? user.email ?? user.id}</strong>{user.email && user.name ? ' (' + user.email + ')' : ''}</p>
        : <p className="muted small">Nobody is signed in: this page is public.</p>}
    </Step>
  )
}

export default function Dashboard({ app, navigate }: { app?: McpApp; navigate: (to: string) => void }) {
  if (!app?.user) {
    return (
      <div className="container center stack">
        <p className="muted">The tour needs a signed-in user.</p>
        <Link to="/" navigate={navigate} className="button outline">Back to the home page</Link>
      </div>
    )
  }
  return (
    <div className="container">
      <div className="row">
        <Link to="/" navigate={navigate} className="button ghost small"><ArrowLeftIcon size={14} /> Home</Link>
      </div>
      <div className="stack">
        <h1 className="h1">All the steps</h1>
        <p className="muted lead">Each step has a button to try it. Open "Under the hood" to see the file or automation that did the work.</p>
      </div>
      <div className="steps">
        <UserStep app={app} />
        <WebhookStep app={app} />
        <EventsStep app={app} />
        <ToolStep app={app} />
        <AgentStep app={app} />
        <AgentButtonsStep app={app} />
      </div>
      <div className="note stack small">
        <p className="h3">Make it yours</p>
        <p className="muted">Change these pages in src/pages/, add a page in src/App.tsx, and replace the example automations by your own. Remove what you do not need.</p>
      </div>
    </div>
  )
}
