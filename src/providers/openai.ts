import type {
  AssistantTurn,
  ChatRequest,
  Message,
  Provider,
  ProviderName,
  StopReason,
  ToolCall,
} from "../types.js";
import { postJson, streamSse } from "./http.js";

interface OpenAIChatCompletion {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerName?: ProviderName;
  extraHeaders?: Record<string, string>;
}

function mapStopReason(finishReason: string | null | undefined): StopReason {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "max_tokens";
    default:
      return finishReason ? "unknown" : "stop";
  }
}

export function messagesToOpenAI(messages: Message[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const entry: Record<string, unknown> = {
        role: "assistant",
        content: message.content || null,
      };
      if (message.toolCalls && message.toolCalls.length > 0) {
        entry["tool_calls"] = message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        }));
      }
      out.push(entry);
      continue;
    }
    out.push({
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    });
  }
  return out;
}

export function parseOpenAIToolCalls(
  raw: OpenAIChatCompletion | undefined,
): ToolCall[] {
  const message = raw?.choices?.[0]?.message;
  const calls = message?.tool_calls ?? [];
  const toolCalls: ToolCall[] = [];
  for (let i = 0; i < calls.length; i += 1) {
    const call = calls[i]!;
    const name = call.function?.name;
    if (!name) {
      continue;
    }
    let args: Record<string, unknown> = {};
    const rawArgs = call.function?.arguments;
    if (rawArgs && rawArgs.trim() !== "") {
      try {
        const parsed: unknown = JSON.parse(rawArgs);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = { _raw: rawArgs };
      }
    }
    toolCalls.push({
      id: call.id ?? `call_${i}`,
      name,
      arguments: args,
    });
  }
  return toolCalls;
}

export function createOpenAIProvider(
  options: OpenAIProviderOptions,
): Provider {
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const providerName = options.providerName ?? "openai";

  return {
    name: providerName,
    async chat(request: ChatRequest): Promise<AssistantTurn> {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: messagesToOpenAI(request.messages),
      };
      if (request.system) {
        body["messages"] = [
          { role: "system", content: request.system },
          ...(body["messages"] as unknown[]),
        ];
      }
      if (request.tools.length > 0) {
        body["tools"] = request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
        body["tool_choice"] = "auto";
      }
      if (request.maxTokens) {
        body["max_tokens"] = request.maxTokens;
      }

      const headers = {
        authorization: `Bearer ${options.apiKey}`,
        ...(options.extraHeaders ?? {}),
      };

      if (request.onText) {
        return streamOpenAIChat({
          url: `${baseUrl}/chat/completions`,
          providerLabel: providerName,
          headers,
          body,
          onText: request.onText,
          ...(request.signal ? { signal: request.signal } : {}),
        });
      }

      const result = await postJson<OpenAIChatCompletion>({
        url: `${baseUrl}/chat/completions`,
        providerLabel: providerName,
        headers,
        body,
        ...(request.signal ? { signal: request.signal } : {}),
      });

      const choice = result.choices?.[0];
      const toolCalls = parseOpenAIToolCalls(result);
      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        stopReason:
          toolCalls.length > 0
            ? "tool_calls"
            : mapStopReason(choice?.finish_reason),
      };
    },
  };
}

interface StreamOpenAIOptions {
  url: string;
  providerLabel: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

async function streamOpenAIChat(
  options: StreamOpenAIOptions,
): Promise<AssistantTurn> {
  let text = "";
  let finish: string | null | undefined;
  const calls = new Map<number, { id: string; name: string; args: string }>();

  await streamSse({
    url: options.url,
    providerLabel: options.providerLabel,
    headers: options.headers,
    body: options.body,
    ...(options.signal ? { signal: options.signal } : {}),
    onEvent: (data) => {
      let chunk: OpenAIStreamChunk;
      try {
        chunk = JSON.parse(data) as OpenAIStreamChunk;
      } catch {
        return;
      }
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) {
        finish = choice.finish_reason;
      }
      const delta = choice?.delta;
      if (delta?.content) {
        text += delta.content;
        options.onText(delta.content);
      }
      for (const tc of delta?.tool_calls ?? []) {
        const index = tc.index ?? 0;
        const entry = calls.get(index) ?? { id: "", name: "", args: "" };
        if (tc.id) {
          entry.id = tc.id;
        }
        if (tc.function?.name) {
          entry.name += tc.function.name;
        }
        if (tc.function?.arguments) {
          entry.args += tc.function.arguments;
        }
        calls.set(index, entry);
      }
    },
  });

  const toolCalls: ToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, entry], i) => {
      let args: Record<string, unknown> = {};
      if (entry.args.trim() !== "") {
        try {
          const parsed: unknown = JSON.parse(entry.args);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = { _raw: entry.args };
        }
      }
      return {
        id: entry.id || `call_${index}_${i}`,
        name: entry.name || "unknown",
        arguments: args,
      };
    });

  return {
    text,
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_calls" : mapStopReason(finish),
  };
}
