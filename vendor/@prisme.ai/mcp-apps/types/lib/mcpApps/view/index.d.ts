/**
 * `@prisme/mcp-apps`: the reference view SDK as an app sees it.
 */
export { McpApp, VIEW_SDK_VERSION, errorInfo, type McpAppOptions } from './app';
export { SUPPORTED_PROTOCOL_VERSIONS, PRISME_EXTENSION_PREFIX } from '../types';
export { STORAGE_EXTENSION, STORAGE_LIMITS } from '../storage';
export { WEBHOOKS_EXTENSION, EVENTS_EXTENSION, USER_EXTENSION, NAVIGATION_EXTENSION, FILES_EXTENSION, AGENT_EXTENSION, BRIDGE_LIMITS, type BridgeEvent, type BridgeUser, type EventScope, type WebhookCallOptions, } from '../bridge';
export type * from '../types';
