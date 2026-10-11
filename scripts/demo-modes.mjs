// Demo: lazorik plan vs code mode against a local mock OpenAI-compatible server.
// Usage: node scripts/demo-modes.mjs
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const cli = path.join(import.meta.dirname, "..", "dist", "index.js");

function response(toolCall) {
  const message = toolCall
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: `call_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: toolCall },
        ],
      }
    : { role: "assistant", content: "Hotovo — režim funguje správně." };
  return JSON.stringify({
    choices: [{ finish_reason: toolCall ? "tool_calls" : "stop", message }],
  });
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const hasToolResult = (body.messages ?? []).some((m) => m.role === "tool");
    console.log(
      `  [mock] request: tools=[${(body.tools ?? []).map((t) => t.function?.name).join(", ")}]`,
    );
    res.writeHead(200, { "content-type": "application/json" });
    if (hasToolResult) {
      res.end(response());
    } else {
      res.end(
        response({
          name: "write_file",
          arguments: JSON.stringify({ path: "pwned.txt", content: "owned" }),
        }),
      );
    }
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/v1`;

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lazorik-demo-"));
process.env.OPENAI_API_KEY = "demo-key";
process.env.OPENAI_BASE_URL = baseUrl;

function run(args, label) {
  return new Promise((resolve) => {
    console.log(`\n=== ${label}: lazorik ${args.join(" ")} ===`);
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: dir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("close", (code) => resolve({ code, out }));
  });
}

const plan = await run(
  ["run", "--root", dir, "--provider", "openai", "--mode", "plan", "--yes", "zkus zapsat soubor pwned.txt"],
  "PLAN",
);
let planFile = "neexistuje";
try {
  await fs.access(path.join(dir, "pwned.txt"));
  planFile = "VYTVOŘEN (!)";
} catch {
  planFile = "nevytvořen (správně)";
}

const code = await run(
  ["run", "--root", dir, "--provider", "openai", "--mode", "code", "--yes", "zkus zapsat soubor pwned.txt"],
  "CODE",
);
let codeFile = "neexistuje";
try {
  codeFile = `přečten: ${(await fs.readFile(path.join(dir, "pwned.txt"), "utf8")).trim()}`;
} catch {
  codeFile = "nevytvořen (!)";
}

console.log("\n=== SHRNUTÍ ===");
console.log(`PLAN  exit=${plan.code}  soubor pwned.txt: ${planFile}`);
console.log(`CODE  exit=${code.code}  soubor pwned.txt: ${codeFile}`);

server.close();
await fs.rm(dir, { recursive: true, force: true });
process.exit(plan.code === 0 && code.code === 0 && planFile.includes("nevytvo") && codeFile.includes("owned") ? 0 : 1);
