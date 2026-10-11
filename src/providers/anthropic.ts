import type {
  AssistantTurn,
  ChatRequest,
  Message,
  Provider,
  StopReason,
  ToolCall,
} from "../types.js";
import { postJson, streamSse } from "./http.js";

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason?: string | null;
}

interface AnthropicStreamEvent {
  type?: string;
  index?: number;
  message?: { stop_reason?: string | null };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null };
  content_block?: { type?: string; id?: string; name?: string };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

function mapStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "max_tokens";
    default:
      return reason ? "unknown" : "stop";
  }
}

export function messagesToAnthropic(messages: Message[]): unknown[] {
  const out: unknown[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: message.content }] });
      continue;
    }

    if (message.role === "assistant") {
      const content: unknown[] = [];
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments,
        });
      }
      if (content.length === 0) {
        content.push({ type: "text", text: "" });
      }
      out.push({ role: "assistant", content });
      continue;
    }

    const last = out[out.length - 1] as
      | { role: string; content: unknown[] }
      | undefined;
    const toolResult = {
      type: "tool_result",
      tool_use_id: message.toolCallId,
      content: message.content,
      is_error: message.isError === true,
    };
    if (last && last.role === "user" && Array.isArray(last.content)) {
      last.content.push(toolResult);
    } else {
      out.push({ role: "user", content: [toolResult] });
    }
  }

  return out;
}

export function parseAnthropicResponse(result: AnthropicResponse): AssistantTurn {
  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (block.type === "tool_use") {
      const input =
        block.input && typeof block.input === "object" && !Array.isArray(block.input)
          ? (block.input as Record<string, unknown>)
          : {};
      toolCalls.push({
        id: block.id ?? `toolu_${toolCalls.length}`,
        name: block.name ?? "unknown",
        arguments: input,
      });
    }
  }

  return {
    text,
    toolCalls,
    stopReason:
      toolCalls.length > 0 ? "tool_calls" : mapStopReason(result.stop_reason),
  };
}

export function createAnthropicProvider(
  options: AnthropicProviderOptions,
): Provider {
  const baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
  const version = options.anthropicVersion ?? "2023-06-01";

  return {
    name: "anthropic",
    async chat(request: ChatRequest): Promise<AssistantTurn> {
      const body: Record<string, unknown> = {
        model: options.model,
        max_tokens: request.maxTokens ?? 4096,
        messages: messagesToAnthropic(request.messages),
      };
      if (request.system) {
        body["system"] = request.system;
      }
      if (request.tools.length > 0) {
        body["tools"] = request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        }));
      }

      const headers = {
        "x-api-key": options.apiKey,
        "anthropic-version": version,
      };

      if (request.onText) {
        return streamAnthropicMessages({
          url: `${baseUrl}/v1/messages`,
          headers,
          body,
          onText: request.onText,
          ...(request.signal ? { signal: request.signal } : {}),
        });
      }

      const result = await postJson<AnthropicResponse>({
        url: `${baseUrl}/v1/messages`,
        providerLabel: "anthropic",
        headers,
        body,
        ...(request.signal ? { signal: request.signal } : {}),
      });

      return parseAnthropicResponse(result);
    },
  };
}

interface StreamAnthropicOptions {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

async function streamAnthropicMessages(
  options: StreamAnthropicOptions,
): Promise<AssistantTurn> {
  let text = "";
  let stopReason: string | null | undefined;
  const blocks = new Map<number, { id: string; name: string; json: string; isTool: boolean }>();

  await streamSse({
    url: options.url,
    providerLabel: "anthropic",
    headers: options.headers,
    body: options.body,
    ...(options.signal ? { signal: options.signal } : {}),
    onEvent: (data) => {
      let event: AnthropicStreamEvent;
      try {
        event = JSON.parse(data) as AnthropicStreamEvent;
      } catch {
        return;
      }
      if (event.type === "content_block_start") {
        blocks.set(event.index ?? 0, {
          id: event.content_block?.id ?? "",
          name: event.content_block?.name ?? "",
          json: "",
          isTool: event.content_block?.type === "tool_use",
        });
        return;
      }
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta?.type === "text_delta" && delta.text) {
          text += delta.text;
          options.onText(delta.text);
        } else if (delta?.type === "input_json_delta" && delta.partial_json) {
          const block = blocks.get(event.index ?? 0);
          if (block) {
            block.json += delta.partial_json;
          }
        }
        return;
      }
      if (event.type === "message_delta") {
        stopReason = event.delta?.stop_reason ?? event.message?.stop_reason ?? stopReason;
      }
    },
  });

  const toolCalls: ToolCall[] = [...blocks.entries()]
    .filter(([, block]) => block.isTool)
    .sort(([a], [b]) => a - b)
    .map(([index, block], i) => {
      let args: Record<string, unknown> = {};
      if (block.json.trim() !== "") {
        try {
          const parsed: unknown = JSON.parse(block.json);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = { _raw: block.json };
        }
      }
      return {
        id: block.id || `toolu_${index}_${i}`,
        name: block.name || "unknown",
        arguments: args,
      };
    });

  return {
    text,
    toolCalls,
    stopReason:
      toolCalls.length > 0 ? "tool_calls" : mapStopReason(stopReason),
  };
}
