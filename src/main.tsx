/**
 * Local development only (`npm run dev`): the platform never runs this file.
 * Deployed, the app is started by the kit (`mountView`), in a page or in the
 * chat, and gets the real `app` object. Here it gets a local one
 * (src/dev/devApp.ts): simulated, or wired to your workspace with
 * `npm run dev:live`.
 *
 * A view of src/views/ opens with ?view=<name> (e.g. /?view=hello-card), as
 * if a tool had just shown it in the chat.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'
import type { McpApp } from '@prisme.ai/mcp-apps'
import App from './App'
import { createDevApp } from './dev/devApp'

const views = import.meta.glob<{ default: ComponentType<{ app: McpApp }> }>('./views/*.tsx')
const viewName = new URLSearchParams(window.location.search).get('view') ?? undefined
const toViewName = (file: string) => file.replace(/^.*\/|\.tsx$/g, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase()
const loadView = Object.entries(views).find(([file]) => toViewName(file) === viewName)?.[1]
const View = loadView ? (await loadView()).default : App

const app = await createDevApp(loadView ? viewName : undefined)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <View app={app} />
  </StrictMode>
)
