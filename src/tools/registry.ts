import type { JsonSchema, ToolDefinition } from "../types.js";
import { ToolNotFoundError } from "../errors.js";
import type { Confirmer } from "../safety/confirm.js";
import type { IgnoreMatcher } from "../safety/gitignore.js";

export interface ToolContext {
  root: string;
  confirmer: Confirmer;
  ignore: IgnoreMatcher;
  allowedCommands: readonly string[];
  log?: (line: string) => void;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface Tool<Args = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  validateArgs(args: unknown): Args;
  run(args: Args, ctx: ToolContext): Promise<string>;
}

export function asObject(args: unknown): Record<string, unknown> {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be a JSON object");
  }
  return args as Record<string, unknown>;
}

export function requireString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Argument "${key}" must be a non-empty string`);
  }
  return value;
}

export function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Argument "${key}" must be a string`);
  }
  return value;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register<Args>(tool: Tool<Args>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as unknown as Tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  subset(allowedNames: readonly string[]): ToolRegistry {
    const next = new ToolRegistry();
    for (const name of allowedNames) {
      const tool = this.tools.get(name);
      if (tool) {
        next.register(tool);
      }
    }
    return next;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(
    name: string,
    args: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    try {
      const validated = tool.validateArgs(args);
      const output = await tool.run(validated, ctx);
      return { output, isError: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Error: ${message}`, isError: true };
    }
  }
}
