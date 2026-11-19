import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import type { McpApp } from '@prisme.ai/mcp-apps'

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>
}

/**
 * A dialog of the app. Radix renders it in a portal: point the portal at
 * app.portalContainer so it stays inside the app (its styles, its theme).
 */
export function InfoDialog({ app, trigger, title, children }: { app?: McpApp; trigger: ReactNode; title: string; children: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal container={app?.portalContainer ?? undefined}>
        <div className="app">
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <Dialog.Title className="h2">{title}</Dialog.Title>
              <Dialog.Close className="button outline" aria-label="Close" data-testid="starter-dialog-close">
                <XIcon size={14} />
              </Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <div className="stack muted">{children}</div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
