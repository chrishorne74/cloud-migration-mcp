import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuardrailsTools } from "./tools/guardrails.js";
import { registerAssessmentTools } from "./tools/assessment.js";
import { registerStrategyTools } from "./tools/strategy.js";
import { registerDiagramTools } from "./tools/diagram.js";
import { registerWaveTools } from "./tools/waves.js";
import { registerRedFlagsTools } from "./tools/red-flags.js";
import { registerContainerTools } from "./tools/container.js";
import { registerDatabaseTools } from "./tools/database.js";
import { registerRunbookTools } from "./tools/runbook.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerVMwareTools } from "./tools/vmware.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "cloud-migration-mcp",
    version: "1.1.0",
  });

  registerGuardrailsTools(server);
  registerAssessmentTools(server);
  registerStrategyTools(server);
  registerDiagramTools(server);
  registerWaveTools(server);
  registerRedFlagsTools(server);
  registerContainerTools(server);
  registerDatabaseTools(server);
  registerRunbookTools(server);
  registerNetworkTools(server);
  registerPortfolioTools(server);
  registerVMwareTools(server);

  return server;
}
