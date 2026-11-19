/**
 * Reference view SDK (`@prisme/mcp-apps`): what an app running inside the
 * chat uses to talk to its host, per MCP Apps. No Prisme-specific protocol:
 * a view written with it runs in any MCP Apps host.
 */
import { type Transport } from '../jsonRpc';
import { type BridgeEvent, type BridgeUser, type EventScope, type WebhookCallOptions } from '../bridge';
import { type McpAppErrorData, type CallToolResult, type Implementation, type McpUiDisplayMode, type McpUiHostCapabilities, type McpUiHostContext, type McpUiInitializeResult, type McpUiUpdateModelContextParams, type ReadResourceResult } from '../types';
/**
 * How long `callServerTool` waits. Longer than other requests: the chat may
 * first ask the user to approve the call (5 min at most), then run it.
 */
export declare const TOOL_CALL_TIMEOUT_MS = 330000;
/** Version of this kit (`@prisme/mcp-apps`); its public surface is frozen within a major. */
export declare const VIEW_SDK_VERSION = "1.3.1";
/**
 * `error.data` of a failed request (contract v1): who refused (host, relay,
 * server) and why, plus `retryAfter` when rate limited. Undefined for an
 * error that carries none (an older host).
 */
export declare function errorInfo(error: unknown): McpAppErrorData | undefined;
type Listener<T> = (value: T) => void;
export interface McpAppOptions {
    availableDisplayModes?: McpUiDisplayMode[];
    /** Defaults to postMessage with window.parent. */
    transport?: Transport;
    /** Send `size-changed` automatically from a ResizeObserver (default true). */
    autoResize?: boolean;
    requestTimeoutMs?: number;
}
export declare class McpApp {
    private readonly info;
    private readonly options;
    private peer;
    private resizeObserver;
    private lastSize;
    hostContext: McpUiHostContext;
    hostCapabilities: McpUiHostCapabilities;
    hostInfo: Implementation | null;
    toolInput: Record<string, unknown> | undefined;
    toolInputPartial: Record<string, unknown> | undefined;
    toolResult: CallToolResult | undefined;
    private readonly toolInputEvents;
    private readonly toolInputPartialEvents;
    private readonly toolResultEvents;
    private readonly cancelledEvents;
    private readonly contextEvents;
    private readonly teardownEvents;
    private readonly navigationEvents;
    private readonly eventListeners;
    private currentPath;
    /**
     * Where the app should render its portals (menus, dialogs, toasts): inside
     * its own root, so its styles apply. Set by the boot; `document.body` in a
     * frame of its own.
     */
    portalContainer: HTMLElement | null;
    /**
     * `ai.prisme/webhooks`: calls a webhook of the app's own workspace with the
     * user's session, held by the host (the app never gets a token). Resolves
     * with the response body.
     */
    readonly webhooks: {
        call: <T = unknown>(path: string, options?: WebhookCallOptions) => Promise<T>;
    };
    /**
     * `ai.prisme/events`: `workspace` events go through the workspace's event
     * stream (the user's session only), `page` events stay between the apps
     * and views shown together. `on` returns the unsubscribe function.
     */
    readonly events: {
        on: (type: string, listener: Listener<BridgeEvent>, options?: {
            scope?: EventScope;
        }) => (() => void);
        emit: (type: string, payload?: unknown, options?: {
            scope?: EventScope;
        }) => Promise<void>;
    };
    /** `ai.prisme/navigation`: the app's route, mirrored by the host in the page URL. */
    readonly navigation: {
        current: () => string;
        navigate: (path: string, options?: {
            replace?: boolean;
        }) => Promise<void>;
        onChange: (listener: Listener<string>) => () => void;
    };
    /** `ai.prisme/files`: upload to the app's workspace, download through the host. */
    readonly files: {
        upload: (file: Blob, options?: {
            name?: string;
            public?: boolean;
        }) => Promise<{
            url: string;
        }>;
        download: (source: string | Blob, filename: string) => Promise<boolean>;
    };
    /**
     * `ai.prisme/agent`: the chat of the app's agent, floating over the page.
     * Offered when the app was deployed with an agent the user can use: check
     * `hasCapability('ai.prisme/agent')` first. What the app shares with
     * `updateModelContext` goes with the user's next question.
     */
    readonly agent: {
        /** The agent's name, when the host offers one. */
        name: () => string | undefined;
        open: () => Promise<void>;
        close: () => Promise<void>;
    };
    constructor(info: Implementation, options?: McpAppOptions);
    get connected(): boolean;
    connect(): Promise<McpUiInitializeResult>;
    /**
     * Whether the host offers a capability: a standard one (`openLinks`,
     * `serverTools`…) or a Prisme extension (`ai.prisme/<name>`, under
     * `experimental`). Check before using anything that is not in every host.
     */
    hasCapability(name: string): boolean;
    /** `ai.prisme/user`: who is signed in, when the host shares it (never with an external server). */
    get user(): BridgeUser | undefined;
    onToolInput(listener: Listener<Record<string, unknown>>): () => void;
    onToolInputPartial(listener: Listener<Record<string, unknown>>): () => void;
    onToolResult(listener: Listener<CallToolResult>): () => void;
    onToolCancelled(listener: Listener<string | undefined>): () => void;
    onHostContextChanged(listener: Listener<McpUiHostContext>): () => void;
    onTeardown(listener: Listener<string | undefined>): () => void;
    callServerTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
    readServerResource(uri: string): Promise<ReadResourceResult>;
    /**
     * The host may ask the user first (a confirmation without a time limit):
     * waits for that answer rather than the default request timeout.
     */
    sendMessage(text: string): Promise<{
        isError?: boolean;
    }>;
    updateModelContext(params: McpUiUpdateModelContextParams): Promise<Record<string, never>>;
    requestDisplayMode(mode: McpUiDisplayMode): Promise<McpUiDisplayMode>;
    openLink(url: string): Promise<{
        isError?: boolean;
    }>;
    /**
     * `ai.prisme/storage`: keys this view keeps for the current user across
     * reloads (quota announced with the capability). Check
     * `hasCapability('ai.prisme/storage')` first: other hosts do not offer it.
     */
    storageGet<T = unknown>(key: string): Promise<T | undefined>;
    storageSet(key: string, value: unknown): Promise<void>;
    storageDelete(key: string): Promise<void>;
    storageKeys(): Promise<string[]>;
    log(level: 'debug' | 'info' | 'warning' | 'error', data: unknown): void;
    /** Sends the current document height, when autoResize is off. */
    notifySize(size: {
        width?: number;
        height?: number;
    }): void;
    close(): void;
    private require;
    private requireExtension;
    private unsubscribe;
    private setPath;
    private requireStorage;
    private observeSize;
}
export {};
