/**
 * A view for the chat: when the agent calls the "hello" tool, this card shows
 * under the tool call in the conversation.
 *
 * How it gets there (see automations/mcp.yml):
 *   1. tools/list declares hello with _meta.ui.resourceUri = ui://app/hello-card
 *   2. the chat asks resources/read for that URI; mcp answers an HTML page
 *      that loads this view's bundle (bundles[<slug>].views["hello-card"],
 *      written by npm run deploy)
 *   3. the view gets the tool's input and result, and the same `app` object as
 *      the app: app.callServerTool runs a tool again, through the agent;
 *      app.sendMessage proposes a message to the user.
 *
 * File name = view name: src/views/HelloCard.tsx → "hello-card".
 */
import { useState } from 'react'
import { HandIcon, MessageSquareIcon, RefreshCwIcon } from 'lucide-react'
import type { McpApp } from '@prisme.ai/mcp-apps'
import { useToolInput, useToolResult } from '@prisme.ai/mcp-apps/react'
import { resultText } from '@/lib/hello'
import '@/styles.css'

export default function HelloCard({ app }: { app: McpApp }) {
  const input = useToolInput(app)
  const result = useToolResult(app)
  const [again, setAgain] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = String(input?.name ?? 'World')
  const text = again ?? (result ? resultText(result) : null)

  const sayAgain = async () => {
    setBusy(true)
    setError(null)
    try {
      const answer = await app.callServerTool('hello', { name: name + ' (again)' })
      setAgain(resultText(answer))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="card stack" data-testid="hello-card">
        <div className="h2"><HandIcon size={16} /> {text ?? 'Waiting for the tool…'}</div>
        <p className="muted small">A view of your app, shown by the hello tool of your workspace. File: src/views/HelloCard.tsx.</p>
        <div className="row">
          <button className="button outline small" onClick={() => void sayAgain()} disabled={busy} data-testid="hello-card-again">
            <RefreshCwIcon size={12} /> Call hello again
          </button>
          <button className="button ghost small" onClick={() => void app.sendMessage(`Tell me more about ${name}`)} data-testid="hello-card-message">
            <MessageSquareIcon size={12} /> Ask the agent
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  )
}
