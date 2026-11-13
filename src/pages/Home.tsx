/**
 * Home: / . Pick something to try; it opens right below. Each choice shows
 * how the app talks to its workspace or to its agent. The page is public:
 * without a session, the choices ask to sign in first.
 */
import { useState, type ComponentType } from 'react'
import { BotIcon, InfoIcon, LogInIcon, MousePointerClickIcon, PlugIcon, UserIcon, WrenchIcon, ZapIcon } from 'lucide-react'
import type { McpApp } from '@prisme.ai/mcp-apps'
import { InfoDialog } from '@/components/ui'
import { Link } from '@/lib/router'
import { AgentButtonsStep, AgentStep, EventsStep, ToolStep, UserStep, WebhookStep } from '@/pages/Dashboard'

type Choice = { id: string; label: string; icon: ComponentType<{ size?: number | string }>; Step: ComponentType<{ app: McpApp }> }

const CHOICES: Choice[] = [
  { id: 'user', label: 'Who is here', icon: UserIcon, Step: UserStep },
  { id: 'backend', label: 'Your backend', icon: PlugIcon, Step: WebhookStep },
  { id: 'realtime', label: 'Real time', icon: ZapIcon, Step: EventsStep },
  { id: 'tools', label: 'Shared tools', icon: WrenchIcon, Step: ToolStep },
  { id: 'agent', label: 'Your agent', icon: BotIcon, Step: AgentStep },
  { id: 'a2ui', label: 'Agent buttons (A2UI)', icon: MousePointerClickIcon, Step: AgentButtonsStep },
]

/** A small drawing of what the choice does: shapes only, it follows the theme. */
function Illustration({ id, icon: Icon }: { id: string; icon: Choice['icon'] }) {
  return (
    <div className={'tile-art art-' + id} aria-hidden="true">
      <div className="art-card">
        <span className="art-icon"><Icon size={18} /></span>
        <span className="art-line long" />
        <span className="art-line" />
      </div>
      <div className="art-card small">
        <span className="art-line" />
        <span className="art-dot" />
      </div>
    </div>
  )
}

export default function Home({ app, navigate }: { app?: McpApp; navigate: (to: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const signedIn = !!app?.user
  const choice = CHOICES.find((c) => c.id === selected)
  const signIn = () => {
    const returnTo = window.location.pathname + window.location.search
    void app?.openLink(window.location.origin + '/signin?returnTo=' + encodeURIComponent(returnTo))
  }

  return (
    <div className="container wide">
      <div className="intro">
        <span className="eyebrow">Example · Full-stack agentic app</span>
        <h1 className="h1">Learn how your app works</h1>
        <p className="muted">
          This starter was created with your app, as a working example. Pick a building block to try it,
          then replace these pages with your own.
        </p>
      </div>

      <div className="tiles" role="list">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="listitem"
            className={selected === c.id ? 'tile selected' : 'tile'}
            aria-pressed={selected === c.id}
            onClick={() => setSelected(selected === c.id ? null : c.id)}
            data-testid={'starter-choice-' + c.id}
          >
            <Illustration id={c.id} icon={c.icon} />
            <span className="tile-label">{c.label}</span>
          </button>
        ))}
      </div>

      {choice && (
        <div className="panel">
          {app && signedIn ? (
            <choice.Step app={app} />
          ) : (
            <div className="signin stack center">
              <p className="muted">Trying this calls your workspace as you: sign in first.</p>
              <button className="button" onClick={signIn} data-testid="starter-sign-in"><LogInIcon size={14} /> Sign in</button>
            </div>
          )}
        </div>
      )}

      <div className="footer-links">
        {signedIn && <Link to="/dashboard" navigate={navigate} className="button ghost small" data-testid="starter-open-dashboard">See all the steps</Link>}
        <InfoDialog
          app={app}
          title="How this app is built"
          trigger={<button className="button ghost small" data-testid="starter-how-built"><InfoIcon size={14} /> How it is built</button>}
        >
          <p>Files: src/pages/Home.tsx (this page) and src/pages/Dashboard.tsx (the steps). Automations: app.greeting, v1/status, mcp, and _auth, which every webhook calls first.</p>
          <p>The app embeds its libraries (React, Radix, lucide): they are copied into it when you deploy, so a platform upgrade never changes it. Deploy again to get their fixes.</p>
          <p>It reaches the platform only through the "app" object. This dialog renders in app.portalContainer, so it keeps the app's styles and theme.</p>
        </InfoDialog>
      </div>
    </div>
  )
}
