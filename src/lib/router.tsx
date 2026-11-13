import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { NAVIGATION_EXTENSION, type McpApp } from '@prisme.ai/mcp-apps'

/**
 * Routing between the pages of the app. In a page the host mirrors the route
 * in the URL (/p/<slug>#/dashboard): links can be shared and Back works.
 * Where the host has no navigation (the chat), the route stays in memory.
 */
export function useRoute(app: McpApp | undefined) {
  const hosted = !!app && app.hasCapability(NAVIGATION_EXTENSION)
  const [path, setPath] = useState(() => (hosted && app ? app.navigation.current() : '/'))

  useEffect(() => {
    if (!hosted || !app) return
    setPath(app.navigation.current())
    return app.navigation.onChange(setPath)
  }, [app, hosted])

  const navigate = useCallback(
    (to: string) => {
      if (hosted && app) void app.navigation.navigate(to)
      else setPath(to)
    },
    [app, hosted]
  )

  return { path, navigate }
}

export function Link({ to, navigate, className, children, ...rest }: { to: string; navigate: (to: string) => void; className?: string; children: ReactNode; 'data-testid'?: string }) {
  return (
    <a
      {...rest}
      href={'#' + to}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
