import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  ZapIcon,
  GlobeIcon,
  CodeIcon,
  Loader2Icon,
  CheckCircleIcon,
  WifiIcon,
  BotIcon,
  NetworkIcon,
  ActivityIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Host contract — these props are injected by the Prisme.ai platform at runtime.
// In `npm run dev`, src/main.tsx provides a stubbed version (see src/lib/mockHost.ts).
// ---------------------------------------------------------------------------

interface PrismeEvent {
  type: string
  payload?: { [key: string]: unknown }
}

interface Events {
  on(event: string, cb: (data: PrismeEvent) => void): () => void
  emit(event: string, payload?: Record<string, unknown>): void
  close(): void
}

interface SDK {
  host?: string
  token?: string
  _csrfToken?: string
  streamEvents(workspaceId: string, filters?: Record<string, unknown>): Promise<Events>
}

interface BackendConfig {
  slug: string
}

export interface AppProps {
  sdk: SDK
  user: unknown
  workspace: { id: string; slug: string; name: string }
  backends?: Record<string, BackendConfig>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiHeaders(sdk: SDK): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sdk.token) h['Authorization'] = 'Bearer ' + sdk.token
  if (sdk._csrfToken) h['x-prismeai-csrf-token'] = sdk._csrfToken
  return h
}

function webhookUrl(sdk: SDK, slug: string, path: string): string {
  return (sdk.host || '') + '/workspaces/slug:' + slug + '/webhooks/' + path
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

function HomePage() {
  const features = [
    {
      icon: BotIcon,
      title: 'Agentic Workflows',
      description:
        'Orchestrate AI agents and automations with built-in event-driven communication and real-time WebSocket streaming.',
    },
    {
      icon: CodeIcon,
      title: 'Full-Stack Apps',
      description:
        'Build web applications with React, Tailwind CSS, and Prisme.ai backend automations. Explore the tabs to see what’s possible.',
    },
    {
      icon: NetworkIcon,
      title: 'Connect IT Systems',
      description:
        'Bridge legacy systems and APIs into agentic workflows using connectors, webhooks, and custom integrations.',
    },
    {
      icon: ActivityIcon,
      title: 'Built-in Observability',
      description:
        'Every action is traced with correlation IDs for full audit trails, real-time activity monitoring, and debugging.',
    },
  ]

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome to your Prisme.ai App
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Edit <code className="text-xs bg-secondary px-1 py-0.5 rounded">src/App.tsx</code> to start
          building. Use the tabs above to see how to call your workspace via WebSocket events
          and REST webhooks.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader className="pb-3">
              <f.icon className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-base">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Capabilities
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {['Event-Driven', 'Correlation IDs', 'Audit Trail', 'Connectors', 'AI Agents', 'Real-time'].map(
            (t) => (
              <span
                key={t}
                className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full"
              >
                {t}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EventsPage — WebSocket event demo
// ---------------------------------------------------------------------------

function EventsPage({ sdk, workspace }: { sdk: SDK; workspace: AppProps['workspace'] }) {
  const [eventResponse, setEventResponse] = useState<string | null>(null)
  const [eventLoading, setEventLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventsRef = useRef<Events | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sdk || !workspace.id) return

    let events: Events | null = null
    let mounted = true

    const connect = async () => {
      try {
        // Use workspace.id (UUID); the events service only resolves "slug:" prefixed identifiers.
        events = await sdk.streamEvents(workspace.id, { 'source.sessionId': true })
        if (!mounted) {
          events?.close()
          return
        }

        eventsRef.current = events
        setConnected(true)

        const unsub = events.on('app.greeting.completed', (data: PrismeEvent) => {
          setEventResponse((data.payload?.message as string) || JSON.stringify(data.payload))
          setEventLoading(false)
        })
        unsubRef.current = unsub
      } catch {
        if (mounted) setError('WebSocket connection failed')
      }
    }

    connect()
    return () => {
      mounted = false
      unsubRef.current?.()
      unsubRef.current = null
      events?.close()
      eventsRef.current = null
    }
  }, [sdk, workspace.id])

  const handleSendEvent = useCallback(() => {
    if (!eventsRef.current) {
      setError('Not connected')
      return
    }
    setEventLoading(true)
    setEventResponse(null)
    setError(null)
    eventsRef.current.emit('app.greeting.requested', { name: 'World' })
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ZapIcon className="h-5 w-5" />
            Real-time Events
          </CardTitle>
          <CardDescription>
            Emit an event via WebSocket to trigger a backend automation. The automation responds with
            a new event delivered in real-time to this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {connected ? (
              <>
                <WifiIcon className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Connected</span>
              </>
            ) : (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Connecting...</span>
              </>
            )}
          </div>

          <Button className="w-full" onClick={handleSendEvent} disabled={eventLoading || !connected}>
            {eventLoading ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" /> Waiting for response...
              </>
            ) : (
              <>
                <ZapIcon className="h-4 w-4 mr-2" /> Send Greeting
              </>
            )}
          </Button>

          {eventResponse && (
            <div className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-md p-3">
              <CheckCircleIcon className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{eventResponse}</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CodeIcon className="h-4 w-4" /> How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            The app emits{' '}
            <code className="text-xs bg-secondary px-1 py-0.5 rounded">app.greeting.requested</code>{' '}
            via WebSocket. A backend automation listens for this event and responds by emitting{' '}
            <code className="text-xs bg-secondary px-1 py-0.5 rounded">app.greeting.completed</code>{' '}
            back to this session.
          </p>
          <pre className="text-xs bg-secondary text-secondary-foreground rounded-md p-3 overflow-x-auto">{`// Connect with session filter (receives only YOUR events)
events = await sdk.streamEvents(workspace.id, { 'source.sessionId': true })

// Listen for response
events.on('app.greeting.completed', (data) => {
  console.log(data.payload.message)
})

// Trigger the automation
events.emit('app.greeting.requested', { name: 'World' })`}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ApiPage — REST endpoint demo
// ---------------------------------------------------------------------------

function ApiPage({ sdk, workspace }: { sdk: SDK; workspace: AppProps['workspace'] }) {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCallEndpoint = useCallback(async () => {
    if (!sdk || !workspace.slug) return
    setLoading(true)
    setResponse(null)
    setError(null)

    try {
      const res = await fetch(webhookUrl(sdk, workspace.slug, 'v1/status'), {
        method: 'POST',
        headers: apiHeaders(sdk),
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Server responded with ' + res.status)
      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Endpoint call failed')
    } finally {
      setLoading(false)
    }
  }, [sdk, workspace.slug])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="h-5 w-5" />
            REST Endpoint
          </CardTitle>
          <CardDescription>
            Call a workspace webhook endpoint via POST. The automation runs and returns a JSON
            response synchronously.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            variant="outline"
            onClick={handleCallEndpoint}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" /> Calling...
              </>
            ) : (
              <>
                <GlobeIcon className="h-4 w-4 mr-2" /> Get Status
              </>
            )}
          </Button>

          {response && (
            <pre className="text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md p-3 whitespace-pre-wrap">
              {response}
            </pre>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CodeIcon className="h-4 w-4" /> How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            The app makes a POST request to{' '}
            <code className="text-xs bg-secondary px-1 py-0.5 rounded">/webhooks/v1/status</code>. A
            backend automation handles the request and returns JSON directly.
          </p>
          <pre className="text-xs bg-secondary text-secondary-foreground rounded-md p-3 overflow-x-auto">{`// Build the endpoint URL
const url = sdk.host + '/workspaces/slug:' + workspace.slug + '/webhooks/v1/status'

// Call the endpoint
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders },
  credentials: 'include',
  body: JSON.stringify({}),
})
const data = await res.json()`}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App — tabbed layout (default export is what the platform mounts)
// ---------------------------------------------------------------------------

export default function App({ sdk, workspace }: AppProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto p-4 py-8">
        <Tabs defaultValue="home" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="home" className="gap-1.5">
              <BotIcon className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5">
              <ZapIcon className="h-4 w-4" /> Events
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5">
              <GlobeIcon className="h-4 w-4" /> API
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home">
            <HomePage />
          </TabsContent>

          <TabsContent value="events">
            <EventsPage sdk={sdk} workspace={workspace} />
          </TabsContent>

          <TabsContent value="api">
            <ApiPage sdk={sdk} workspace={workspace} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
