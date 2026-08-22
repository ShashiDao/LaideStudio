export type LLMImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export type LLMContentBlock =
  | { type: 'text'; text: string; cacheable?: boolean }
  | { type: 'image'; mediaType: LLMImageMediaType | string; data: string; cacheable?: boolean };

export type LLMContentPart = LLMContentBlock;

export interface LLMMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | LLMContentBlock[];
  cacheable?: boolean;
  toolCalls?: LLMToolCall[]; // Present if role is 'assistant' and model called tools
  toolCallId?: string; // Present if role is 'tool'
  toolName?: string; // Present if role is 'tool' (Google needs it)
  model?: string; // Model or profile name associated with assistant message
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  systemPromptCacheable?: boolean;
  tools?: LLMTool[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface LLMToolCall {
  id: string;
  name: string;
  args: string;
}

export interface LLMResponse {
  text: string;
  toolCalls?: LLMToolCall[];
  usage: LLMUsage;
}

export type LLMStreamYield = 
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: LLMToolCall }
  | { type: 'usage'; usage: LLMUsage };

export interface LLMAdapter {
  send(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown>;
  countTokens(request: LLMRequest): Promise<number>;
}

