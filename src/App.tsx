/**
 * The app: shown in the platform shell (/apps/<slug>) and at /p/<slug>.
 * It gets everything from the "app" object the host gives it:
 *   app.navigation  routes, mirrored in the page URL
 *   app.user        who is signed in (absent for an anonymous visitor)
 *   app.webhooks    your workspace webhooks (automations with an endpoint)
 *   app.events      your workspace events, in real time
 *   app.callServerTool  your workspace MCP tools
 * Add a page = a file in src/pages/ + a line in PAGES.
 */
import type { McpApp } from '@prisme.ai/mcp-apps'
import { useRoute } from '@/lib/router'
import Home from '@/pages/Home'
import Dashboard from '@/pages/Dashboard'
import './styles.css'

const PAGES: Record<string, typeof Home> = {
  '/': Home,
  '/dashboard': Dashboard,
}

export default function App({ app }: { app?: McpApp; appName?: string }) {
  const { path, navigate } = useRoute(app)
  const Page = PAGES[path] ?? Home
  return (
    <div className="app">
      <Page app={app} navigate={navigate} />
    </div>
  )
}
