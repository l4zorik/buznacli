export type ProviderName = "openai" | "anthropic" | "openrouter" | "zen";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
      isError?: boolean;
    };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ChatRequest {
  system?: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

export type StopReason = "stop" | "tool_calls" | "max_tokens" | "unknown";

export interface AssistantTurn {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
}

export interface Provider {
  readonly name: ProviderName;
  chat(request: ChatRequest): Promise<AssistantTurn>;
}
