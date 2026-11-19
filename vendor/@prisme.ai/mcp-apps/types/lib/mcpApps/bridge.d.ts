export declare const WEBHOOKS_EXTENSION = "ai.prisme/webhooks";
export declare const EVENTS_EXTENSION = "ai.prisme/events";
export declare const USER_EXTENSION = "ai.prisme/user";
export declare const NAVIGATION_EXTENSION = "ai.prisme/navigation";
export declare const FILES_EXTENSION = "ai.prisme/files";
export declare const AGENT_EXTENSION = "ai.prisme/agent";
export declare const BRIDGE_METHODS: {
    readonly webhooksCall: "ai.prisme/webhooks/call";
    readonly eventsSubscribe: "ai.prisme/events/subscribe";
    readonly eventsUnsubscribe: "ai.prisme/events/unsubscribe";
    readonly eventsEmit: "ai.prisme/events/emit";
    /** Notification host → app: `{ subscription, event }`. */
    readonly eventsEvent: "ai.prisme/events/event";
    readonly navigationNavigate: "ai.prisme/navigation/navigate";
    /** Notification host → app: `{ path }` (Back, Forward, a shared link). */
    readonly navigationChanged: "ai.prisme/navigation/changed";
    readonly filesUpload: "ai.prisme/files/upload";
    readonly filesDownload: "ai.prisme/files/download";
    readonly agentOpen: "ai.prisme/agent/open";
    readonly agentClose: "ai.prisme/agent/close";
};
export type EventScope = 'workspace' | 'page';
export interface BridgeEvent {
    type: string;
    payload: unknown;
    /** `workspace` events carry the source the event service gives them. */
    source?: Record<string, unknown>;
    createdAt?: string;
}
export interface BridgeUser {
    id: string;
    name?: string;
    email?: string;
    locale?: string;
}
export interface WebhookCallOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Record<string, string>;
}
export interface UploadParams {
    name: string;
    /** MIME type. */
    type: string;
    /** Base64 content (no `data:` prefix). */
    data: string;
    public?: boolean;
}
export interface DownloadParams {
    filename: string;
    /** An https URL… */
    url?: string;
    /** …or base64 content with its MIME type. */
    data?: string;
    type?: string;
}
/** Contract v1 limits of the bridge. */
export declare const BRIDGE_LIMITS: {
    /** Upload size, decoded. */
    readonly maxUploadBytes: 10000000;
    readonly maxDownloadBytes: 20000000;
    readonly maxEventPayloadBytes: 100000;
    readonly maxSubscriptions: 50;
    readonly maxPathLength: 512;
};
/**
 * Host side: what a host offers. Absent piece = capability not announced.
 * The host fixes the scope (which workspace, which session, which page):
 * nothing the app sends can widen it.
 */
export interface PlatformBridge {
    webhooks?: {
        call(path: string, options: WebhookCallOptions): Promise<unknown>;
    };
    events?: {
        scopes: EventScope[];
        subscribe(type: string, scope: EventScope, listener: (event: BridgeEvent) => void): () => void;
        emit(type: string, payload: unknown, scope: EventScope): void | Promise<void>;
    };
    user?: BridgeUser;
    navigation?: {
        current(): string;
        navigate(path: string, options?: {
            replace?: boolean;
        }): void;
        onChange(listener: (path: string) => void): () => void;
    };
    files?: {
        upload?(params: UploadParams): Promise<{
            url: string;
        }>;
        /** True when the download started (the host may ask the user first). */
        download?(params: DownloadParams): Promise<boolean>;
    };
    /** The app's agent: its name, and the floating chat the host opens or closes. */
    agent?: {
        name: string;
        open(): void;
        close(): void;
    };
}
/** A webhook path of the app's workspace: slugs and slashes, no dot segment, no query. */
export declare const WEBHOOK_PATH_PATTERN: RegExp;
export declare function validateWebhookPath(path: unknown): string;
/** Event types: the workspace naming (`app.greeting.requested`). */
export declare const EVENT_TYPE_PATTERN: RegExp;
export declare function validateEventType(type: unknown): string;
export declare function validateEventScope(scope: unknown, offered: EventScope[]): EventScope;
/** An app route: absolute, no scheme nor host, no `//`. */
export declare function validateAppPath(path: unknown): string;
export declare function base64Size(data: string): number;
