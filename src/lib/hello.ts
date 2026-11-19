import { useState } from 'react'
import type { McpApp } from '@prisme.ai/mcp-apps'

/** Text of a tool result. */
export function resultText(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((block) => (block.type === 'text' ? block.text ?? '' : '')).join('\n')
}

/**
 * Calls the workspace MCP tool "hello" (automation "mcp"). The same tool can
 * be given to an agent, which calls it too.
 */
export function useHello(app: McpApp | undefined) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const sayHello = async (name: string) => {
    if (!app) return
    setLoading(true)
    setError(null)
    try {
      const result = await app.callServerTool('hello', { name })
      if (result.isError) setError(resultText(result) || 'The tool failed')
      else setMessage(resultText(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return { message, error, loading, sayHello }
}
