/**
 * Snappi Preview MCP — stdio server; tools delegate to ../lib/pipeline.mjs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  resolvePreviewPaths,
  cloneAndCheckout,
  analyzeStack,
  prepareEnv,
  startPreview,
} from "../lib/pipeline.mjs";

function textResult(obj) {
  const text =
    typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: "text", text }] };
}

async function main() {
  const server = new McpServer({
    name: "snappi-preview-mcp",
    version: "1.0.0",
  });

  server.tool(
    "clone_and_checkout",
    "Clone github.com owner/repo and checkout the PR head ref (fetch pull/N/head).",
    {
      pr_url: z
        .string()
        .describe("Full PR URL, e.g. https://github.com/org/repo/pull/1"),
    },
    async ({ pr_url }) => {
      const paths = resolvePreviewPaths();
      const r = await cloneAndCheckout(pr_url, paths);
      return textResult(
        r.ok
          ? {
              ...r,
              message:
                "Use this path with analyze_stack → prepare_env → start_preview.",
            }
          : r
      );
    }
  );

  server.tool(
    "analyze_stack",
    "Read package.json: framework guess, package manager from lockfiles, dev script name.",
    {
      path: z.string().describe("Absolute path to project root"),
    },
    async ({ path: projectPath }) => {
      const paths = resolvePreviewPaths();
      const r = await analyzeStack(projectPath, paths);
      return textResult(r);
    }
  );

  server.tool(
    "prepare_env",
    "Optional .env content, then run install (npm/pnpm/yarn/bun) in the project.",
    {
      path: z.string().describe("Project root"),
      env_vars: z
        .string()
        .optional()
        .describe(
          'Dotenv lines (KEY=value) or JSON object string, e.g. {"API_URL":"http://localhost:8080"}'
        ),
    },
    async ({ path: projectPath, env_vars }) => {
      const paths = resolvePreviewPaths();
      const r = await prepareEnv(projectPath, paths, env_vars);
      return textResult(r);
    }
  );

  server.tool(
    "start_preview",
    "Start dev server in background (detached). Returns suggested local URL.",
    {
      path: z.string().describe("Project root"),
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .optional()
        .describe(
          "Omit to auto-pick from 5173 upward (run multiple PRs in parallel)"
        ),
      script: z.string().optional().default("dev"),
    },
    async ({ path: projectPath, port, script }) => {
      const paths = resolvePreviewPaths();
      const r = await startPreview(projectPath, paths, { port, script });
      return textResult(
        r.ok
          ? {
              ...r,
              note: "Vite/Next may ignore extra CLI flags; check logFile if the page does not load.",
            }
          : r
      );
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`snappi-preview-mcp fatal: ${e}\n`);
  process.exit(1);
});
