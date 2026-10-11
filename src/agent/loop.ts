import type { Message, Provider, ToolCall } from "../types.js";
import type { ToolContext, ToolRegistry } from "../tools/index.js";

export type AgentEvent =
  | { type: "step"; index: number; maxSteps: number }
  | { type: "assistant_text"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; output: string; isError: boolean }
  | { type: "done"; text: string; steps: number }
  | { type: "limit_reached"; steps: number };

export interface AgentOptions {
  provider: Provider;
  tools: ToolRegistry;
  ctx: ToolContext;
  system: string;
  maxSteps: number;
  maxTokens?: number;
  history?: readonly Message[];
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentResult {
  status: "done" | "limit_reached";
  text: string;
  steps: number;
  messages: Message[];
}

export { BASE_SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "./context.js";

function emit(
  onEvent: ((event: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  onEvent?.(event);
}

export async function runAgentLoop(
  prompt: string,
  options: AgentOptions,
): Promise<AgentResult> {
  const messages: Message[] = [
    ...(options.history ?? []),
    { role: "user", content: prompt },
  ];
  const toolDefs = options.tools.list();
  let lastText = "";
  const unlimited = options.maxSteps === 0;
  let step = 0;

  for (step = 1; unlimited || step <= options.maxSteps; step += 1) {
    emit(options.onEvent, { type: "step", index: step, maxSteps: options.maxSteps });

    const turn = await options.provider.chat({
      system: options.system,
      messages,
      tools: toolDefs,
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    });

    if (turn.text) {
      lastText = turn.text;
      emit(options.onEvent, { type: "assistant_text", text: turn.text });
    }

    messages.push({
      role: "assistant",
      content: turn.text,
      ...(turn.toolCalls.length > 0 ? { toolCalls: turn.toolCalls } : {}),
    });

    if (turn.toolCalls.length === 0) {
      const text = turn.text || lastText;
      emit(options.onEvent, { type: "done", text, steps: step });
      return { status: "done", text, steps: step, messages };
    }

    for (const call of turn.toolCalls) {
      const results = await executeToolCall(call, options);
      messages.push(results);
    }
  }

  emit(options.onEvent, { type: "limit_reached", steps: step - 1 });
  return {
    status: "limit_reached",
    text: lastText,
    steps: step - 1,
    messages,
  };
}

async function executeToolCall(
  call: ToolCall,
  options: AgentOptions,
): Promise<Message> {
  emit(options.onEvent, { type: "tool_start", name: call.name, args: call.arguments });

  let result: { output: string; isError: boolean };
  try {
    result = await options.tools.execute(call.name, call.arguments, options.ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { output: `Error: ${message}`, isError: true };
  }

  emit(options.onEvent, {
    type: "tool_end",
    name: call.name,
    output: result.output,
    isError: result.isError,
  });

  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: result.output,
    isError: result.isError,
  };
}
