import type { McpApp } from './app';
import type { CallToolResult, McpUiHostContext } from '../types';
export declare function useToolInput(app: McpApp): Record<string, unknown> | undefined;
export declare function useToolInputPartial(app: McpApp): Record<string, unknown> | undefined;
export declare function useToolResult(app: McpApp): CallToolResult | undefined;
export declare function useHostContext(app: McpApp): McpUiHostContext;
