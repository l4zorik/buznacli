import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./readFile.js";
import { writeFileTool } from "./writeFile.js";
import { runCommandTool } from "./exec.js";
import { gitDiffTool } from "./gitDiff.js";
import { listFilesTool } from "./listFiles.js";

export { ToolRegistry } from "./registry.js";
export type { Tool, ToolContext, ToolResult } from "./registry.js";

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(listFilesTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(runCommandTool);
  registry.register(gitDiffTool);
  return registry;
}
