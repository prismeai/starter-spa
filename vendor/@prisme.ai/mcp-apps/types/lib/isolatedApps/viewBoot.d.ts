/**
 * `@prisme.ai/mcp-apps/boot`: starts an isolated app's view.
 *
 * Vendored (see `scripts/build-vendor.mjs`) and called by the entry the
 * Builder generates for each view, so app authors only write a component:
 *
 *   export default function TicketCard({ app }: { app: McpApp }) { … }
 *
 * The same bundle starts two ways:
 * - in a frame of its own (a chat view): it connects to the parent window
 *   over postMessage and renders into `#root`;
 * - in a page (shell, `/p/:slug`): the page host claims the script before it
 *   runs (`PAGE_REGISTRY_KEY`) and mounts it in-process, in a shadow root,
 *   with an in-memory channel. No iframe, the app's own React.
 * Either way the component gets the same `app` object; only the transport
 * differs. Copied into each bundle at build time, like React: a later
 * platform version never changes it under a published app.
 */
import { type ComponentType } from 'react';
import { McpApp } from '../mcpApps/view/index';
import type { Transport } from '../mcpApps/jsonRpc';
import type { McpUiDisplayMode, McpUiHostContext } from '../mcpApps/types';
export interface IsolatedViewProps {
    app: McpApp;
    appName: string;
}
export interface MountViewOptions {
    appName: string;
    /** Display modes the view supports. Default: inline and fullscreen. */
    displayModes?: McpUiDisplayMode[];
    /** Element to render into, in a frame of its own. Default: `#root`, else `<body>`. */
    container?: HTMLElement;
}
/** Where an in-process host mounts a view. */
export interface IsolatedMountTarget {
    /** The view renders here. */
    root: HTMLElement;
    /**
     * Gets the host's theme (variables, `dark` class). Contains `root` and
     * `portal`, so menus and dialogs share the theme. Default: `root`.
     */
    themeRoot?: HTMLElement;
    /** Where the view's stylesheets go (the shadow root). */
    styleRoot: Node;
    /** `app.portalContainer`: menus and dialogs render here, inside the styles. */
    portal: HTMLElement;
    /** The app side of the channel to the host. */
    transport: Transport;
}
/** Mounts a claimed view; resolves with its unmount. */
export type IsolatedMount = (target: IsolatedMountTarget) => Promise<() => void>;
/**
 * Global the page host sets before inserting a view's script: it claims the
 * script (by its absolute URL) so the view hands over its mount instead of
 * starting itself.
 */
export declare const PAGE_REGISTRY_KEY = "__prismeIsolatedApps";
export interface PageRegistry {
    claim(scriptUrl: string): ((mount: IsolatedMount) => void) | undefined;
}
/** Called by the bundle's CSS imports: the stylesheet goes where the view renders. */
export declare function addStyle(css: string): void;
/** Applies `theme` and the standard style variables of the host to `root`. */
export declare function applyHostTheme(ctx: McpUiHostContext, root?: HTMLElement): void;
export declare function mountView(View: ComponentType<IsolatedViewProps>, options: MountViewOptions): Promise<McpApp | null>;
