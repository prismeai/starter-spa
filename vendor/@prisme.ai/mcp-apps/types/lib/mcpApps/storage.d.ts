export declare const STORAGE_EXTENSION = "ai.prisme/storage";
export declare const STORAGE_METHODS: {
    readonly get: "ai.prisme/storage/get";
    readonly set: "ai.prisme/storage/set";
    readonly delete: "ai.prisme/storage/delete";
    readonly keys: "ai.prisme/storage/keys";
};
/** Contract v1 limits, announced with the capability. */
export declare const STORAGE_LIMITS: {
    /** Whole namespace, serialized. */
    readonly quotaBytes: 100000;
    readonly maxValueBytes: 20000;
    readonly maxKeyLength: 128;
    readonly maxKeys: 200;
};
export interface ViewStorage {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    keys(): string[];
}
/**
 * All views of the browser together: past it, the namespaces written longest
 * ago go first. A namespace comes from the server's own URIs, so without it a
 * server minting one URI per result could fill the platform's localStorage.
 */
export declare const STORAGE_GLOBAL_BUDGET_BYTES = 1000000;
/** Namespace of one view for one user; null when the user is unknown (no storage then). */
export declare function storageNamespace(parts: {
    user?: string | null;
    agentId?: string;
    server: string;
    resourceUri: string;
}): string | null;
export declare function validateStorageKey(key: unknown): string;
/**
 * Store of one namespace in the browser. When the browser refuses storage
 * (private mode, blocked site data) it keeps the values in memory for the
 * page's lifetime instead of failing the view.
 */
export declare function createBrowserViewStorage(namespace: string, backend?: Storage | null): ViewStorage;
