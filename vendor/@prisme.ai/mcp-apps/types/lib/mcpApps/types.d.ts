/**
 * MCP Apps (SEP-1865) wire types, stable spec 2026-01-26.
 *
 * Only what the host and the reference view SDK exchange. Field names follow
 * the spec verbatim; see https://github.com/modelcontextprotocol/ext-apps.
 */
export declare const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";
/**
 * Protocol versions this side speaks, newest first. Negotiation (ui/initialize):
 * the host answers the view's version when it speaks it, else its newest; the
 * view stops with a clear error if the answer is not one it speaks.
 */
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly string[];
/**
 * Prisme extensions live only under `experimental["ai.prisme/<name>"]` of the
 * negotiated capabilities (reverse DNS of prisme.ai). A view checks one with
 * `hasCapability` before using it; an unknown method answers -32601.
 */
export declare const PRISME_EXTENSION_PREFIX = "ai.prisme/";
/** Who refused or failed a request: carried in every error's `data` (contract v1). */
export type McpAppErrorSource = 'host' | 'relay' | 'server' | 'view';
/** Stable reasons a view can branch on (contract v1; new ones may be added). */
export type McpAppErrorReason = 'rate_limited' | 'not_initialized' | 'invalid_params' | 'method_not_found' | 'not_ui_resource' | 'unknown_tool' | 'tool_not_app_visible' | 'tool_requires_approval' | 'approval_required' | 'approval_rejected' | 'approval_pending' | 'server_not_allowed' | 'resource_not_found' | 'not_html' | 'too_large' | 'quota_exceeded' | 'unknown_server' | 'timeout' | 'unavailable' | 'unauthorized' | 'user_session_required' | 'agent_not_published' | 'unsupported_version' | 'server_error' | 'internal' | (string & {});
export interface McpAppErrorData {
    source: McpAppErrorSource;
    reason: McpAppErrorReason;
    /** Seconds to wait before retrying (rate_limited). */
    retryAfter?: number;
    /**
     * `timeout` only: the answer was lost, not the call. The tool may still run
     * to its end on the server, so retrying blindly can do the action twice.
     */
    maybeRunning?: true;
}
export declare const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";
export declare const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export declare const UI_URI_SCHEME = "ui://";
export type McpUiDisplayMode = 'inline' | 'fullscreen' | 'pip';
export type McpUiToolVisibility = 'model' | 'app';
export interface McpUiToolMeta {
    resourceUri?: string;
    visibility?: McpUiToolVisibility[];
}
export interface McpUiResourceCsp {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
}
export interface McpUiResourcePermissions {
    camera?: Record<string, never>;
    microphone?: Record<string, never>;
    geolocation?: Record<string, never>;
    clipboardWrite?: Record<string, never>;
}
export interface McpUiResourceMeta {
    csp?: McpUiResourceCsp;
    permissions?: McpUiResourcePermissions;
    domain?: string;
    prefersBorder?: boolean;
}
export interface Implementation {
    name: string;
    version: string;
    [key: string]: unknown;
}
export type ContentBlock = {
    type: 'text';
    text: string;
    [key: string]: unknown;
} | {
    type: 'image';
    data: string;
    mimeType: string;
    [key: string]: unknown;
} | {
    type: string;
    [key: string]: unknown;
};
export interface CallToolResult {
    content?: ContentBlock[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    _meta?: Record<string, unknown>;
}
export interface ResourceContents {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: {
        ui?: McpUiResourceMeta;
        [key: string]: unknown;
    };
}
export interface ReadResourceResult {
    contents: ResourceContents[];
}
export interface McpUiAppCapabilities {
    experimental?: Record<string, unknown>;
    tools?: {
        listChanged?: boolean;
    };
    availableDisplayModes?: McpUiDisplayMode[];
}
export interface McpUiHostCapabilities {
    experimental?: Record<string, unknown>;
    openLinks?: Record<string, never>;
    serverTools?: {
        listChanged?: boolean;
    };
    serverResources?: {
        listChanged?: boolean;
    };
    logging?: Record<string, never>;
    sandbox?: {
        permissions?: McpUiResourcePermissions;
        csp?: McpUiResourceCsp;
    };
    updateModelContext?: Record<string, unknown>;
    message?: Record<string, unknown>;
}
export interface McpUiHostContext {
    toolInfo?: {
        id?: string | number;
        tool: {
            name: string;
            [key: string]: unknown;
        };
    };
    theme?: 'light' | 'dark';
    styles?: {
        variables?: Record<string, string>;
        css?: {
            fonts?: string;
        };
    };
    displayMode?: McpUiDisplayMode;
    availableDisplayModes?: McpUiDisplayMode[];
    containerDimensions?: {
        width?: number;
        maxWidth?: number;
        height?: number;
        maxHeight?: number;
    };
    locale?: string;
    timeZone?: string;
    userAgent?: string;
    platform?: 'web' | 'desktop' | 'mobile';
    deviceCapabilities?: {
        touch?: boolean;
        hover?: boolean;
    };
    [key: string]: unknown;
}
export interface McpUiInitializeParams {
    protocolVersion: string;
    appInfo: Implementation;
    appCapabilities: McpUiAppCapabilities;
}
export interface McpUiInitializeResult {
    protocolVersion: string;
    hostInfo: Implementation;
    hostCapabilities: McpUiHostCapabilities;
    hostContext: McpUiHostContext;
}
export interface McpUiUpdateModelContextParams {
    content?: ContentBlock[];
    structuredContent?: Record<string, unknown>;
}
/** Method names, grouped by direction. */
export declare const METHODS: {
    readonly initialize: "ui/initialize";
    readonly initialized: "ui/notifications/initialized";
    readonly sizeChanged: "ui/notifications/size-changed";
    readonly requestTeardown: "ui/notifications/request-teardown";
    readonly message: "ui/message";
    readonly updateModelContext: "ui/update-model-context";
    readonly requestDisplayMode: "ui/request-display-mode";
    readonly openLink: "ui/open-link";
    readonly toolsCall: "tools/call";
    readonly resourcesRead: "resources/read";
    readonly log: "notifications/message";
    readonly ping: "ping";
    readonly toolInput: "ui/notifications/tool-input";
    readonly toolInputPartial: "ui/notifications/tool-input-partial";
    readonly toolResult: "ui/notifications/tool-result";
    readonly toolCancelled: "ui/notifications/tool-cancelled";
    readonly hostContextChanged: "ui/notifications/host-context-changed";
    readonly resourceTeardown: "ui/resource-teardown";
};
