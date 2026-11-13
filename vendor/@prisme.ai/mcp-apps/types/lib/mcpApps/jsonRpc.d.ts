/**
 * Minimal JSON-RPC 2.0 peer over an abstract transport.
 *
 * Shared by the host (chat) and the reference view SDK. Requests are
 * correlated by id with a timeout and a cap on in-flight requests, so a view
 * that never answers cannot pile up promises in the host.
 */
import type { McpAppErrorData, McpAppErrorReason, McpAppErrorSource } from './types';
export type JsonRpcId = string | number;
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: JsonRpcId;
    method: string;
    params?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export interface JsonRpcErrorObject {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: JsonRpcId;
    result?: unknown;
    error?: JsonRpcErrorObject;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
export declare const RPC_ERRORS: {
    readonly parseError: -32700;
    readonly invalidRequest: -32600;
    readonly methodNotFound: -32601;
    readonly invalidParams: -32602;
    readonly internalError: -32603;
    /** Host refused the action (policy, consent, not ready). */
    readonly refused: -32000;
};
export declare class JsonRpcError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(code: number, message: string, data?: unknown);
}
/** Anything able to carry JSON-RPC messages both ways. */
export interface Transport {
    send(message: JsonRpcMessage): void;
    /** Registers the single inbound listener; returns an unsubscribe. */
    listen(handler: (message: JsonRpcMessage) => void): () => void;
    close?(): void;
}
export declare function isJsonRpcMessage(value: unknown): value is JsonRpcMessage;
export type RequestHandler = (params: unknown) => unknown | Promise<unknown>;
export type NotificationHandler = (params: unknown) => void;
export interface JsonRpcPeerOptions {
    /** Per-request timeout in ms (default 30s). */
    timeoutMs?: number;
    /** Max requests awaiting a response (default 64). */
    maxPending?: number;
    /** Called for malformed inbound frames and handler crashes. */
    onError?: (error: Error) => void;
    /** Side this peer speaks for, stamped on the errors it answers (`error.data.source`). */
    errorSource?: McpAppErrorSource;
}
/** `error.data` of the contract: who refused, why, and when to retry. */
export declare function errorData(source: McpAppErrorSource, reason: McpAppErrorReason, retryAfter?: number): McpAppErrorData;
/** A request whose answer did not come back in time: the call itself may still be running. */
export declare const timeoutErrorData: (source: McpAppErrorSource) => McpAppErrorData;
export declare class JsonRpcPeer {
    private readonly transport;
    private readonly requestHandlers;
    private readonly notificationHandlers;
    private readonly pending;
    private readonly timeoutMs;
    private readonly maxPending;
    private readonly onError?;
    private readonly errorSource?;
    private nextId;
    private unlisten;
    private closed;
    private errorData;
    constructor(transport: Transport, options?: JsonRpcPeerOptions);
    get isClosed(): boolean;
    onRequest(method: string, handler: RequestHandler): void;
    onNotification(method: string, handler: NotificationHandler): void;
    request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
    notify(method: string, params?: unknown): void;
    close(): void;
    private safeSend;
    private receive;
    private handleRequest;
}
