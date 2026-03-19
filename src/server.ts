import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuardrailsTools } from "./tools/guardrails.js";
import { registerAssessmentTools } from "./tools/assessment.js";
import { registerStrategyTools } from "./tools/strategy.js";
import { registerDiagramTools } from "./tools/diagram.js";
import { registerWaveTools } from "./tools/waves.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "cloud-migration-mcp",
    version: "1.0.0",
  });

  registerGuardrailsTools(server);
  registerAssessmentTools(server);
  registerStrategyTools(server);
  registerDiagramTools(server);
  registerWaveTools(server);

  return server;
}
