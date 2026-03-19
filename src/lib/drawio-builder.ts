import type {
  DiagramEdge,
  DiagramNode,
  MigrationDiagramSpec,
  MigrationStrategy,
} from "../types/index.js";

// ─── Draw.io shape mappings ───────────────────────────────────────────────────

// Uses native draw.io AWS / Azure / GCP shape libraries
// Shape IDs reference the built-in draw.io stencil libraries

interface ShapeSpec {
  style: string;
  width: number;
  height: number;
}

const AWS_SHAPES: Record<string, ShapeSpec> = {
  ec2:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;", width: 60, height: 60 },
  rds:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;", width: 60, height: 60 },
  s3:       { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;", width: 60, height: 60 },
  lambda:   { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;", width: 60, height: 60 },
  ecs:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;", width: 60, height: 60 },
  eks:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eks;", width: 60, height: 60 },
  elb:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;", width: 60, height: 60 },
  vpc:      { style: "points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[0,1],[0.25,1],[0.5,1],[0.75,1],[1,1],[0,0.25],[0,0.5],[0,0.75],[1,0.25],[1,0.5],[1,0.75]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;", width: 350, height: 250 },
  subnet:   { style: "points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[0,1],[0.25,1],[0.5,1],[0.75,1],[1,1],[0,0.25],[0,0.5],[0,0.75],[1,0.25],[1,0.5],[1,0.75]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;", width: 250, height: 180 },
  sqs:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;", width: 60, height: 60 },
  sns:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;", width: 60, height: 60 },
  apigateway: { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;", width: 60, height: 60 },
  cloudfront: { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;", width: 60, height: 60 },
  route53:  { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;", width: 60, height: 60 },
  waf:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf;", width: 60, height: 60 },
  secretsmanager: { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.secrets_manager;", width: 60, height: 60 },
  cloudwatch: { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch;", width: 60, height: 60 },
  iam:      { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.role;", width: 60, height: 60 },
  generic:  { style: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.general;", width: 60, height: 60 },
};

const AZURE_SHAPES: Record<string, ShapeSpec> = {
  vm:         { style: "shape=mxgraph.azure2.virtual_machine;", width: 64, height: 64 },
  sql:        { style: "shape=mxgraph.azure2.sql_database;", width: 64, height: 64 },
  storage:    { style: "shape=mxgraph.azure2.storage;", width: 64, height: 64 },
  functions:  { style: "shape=mxgraph.azure2.function_apps;", width: 64, height: 64 },
  aks:        { style: "shape=mxgraph.azure2.kubernetes_services;", width: 64, height: 64 },
  appservice: { style: "shape=mxgraph.azure2.app_services;", width: 64, height: 64 },
  vnet:       { style: "shape=mxgraph.azure2.virtual_networks;", width: 64, height: 64 },
  loadbalancer: { style: "shape=mxgraph.azure2.load_balancers;", width: 64, height: 64 },
  servicebus: { style: "shape=mxgraph.azure2.service_bus;", width: 64, height: 64 },
  keyvault:   { style: "shape=mxgraph.azure2.key_vaults;", width: 64, height: 64 },
  monitor:    { style: "shape=mxgraph.azure2.monitor;", width: 64, height: 64 },
  generic:    { style: "shape=mxgraph.azure2.server;", width: 64, height: 64 },
};

const GCP_SHAPES: Record<string, ShapeSpec> = {
  gce:         { style: "shape=mxgraph.gcp2.compute_engine;", width: 64, height: 64 },
  cloudsql:    { style: "shape=mxgraph.gcp2.cloud_sql;", width: 64, height: 64 },
  gcs:         { style: "shape=mxgraph.gcp2.cloud_storage;", width: 64, height: 64 },
  cloudfunctions: { style: "shape=mxgraph.gcp2.cloud_functions;", width: 64, height: 64 },
  gke:         { style: "shape=mxgraph.gcp2.container_engine;", width: 64, height: 64 },
  pubsub:      { style: "shape=mxgraph.gcp2.cloud_pub_sub;", width: 64, height: 64 },
  vpc:         { style: "shape=mxgraph.gcp2.virtual_private_cloud;", width: 64, height: 64 },
  generic:     { style: "shape=mxgraph.gcp2.generic_gcp;", width: 64, height: 64 },
};

// ─── Strategy colour coding ───────────────────────────────────────────────────

const STRATEGY_COLOURS: Record<MigrationStrategy, string> = {
  Rehost:     "#dae8fc",  // light blue
  Replatform: "#d5e8d4",  // light green
  Repurchase: "#fff2cc",  // light yellow
  Refactor:   "#e1d5e7",  // light purple
  Retire:     "#f8cecc",  // light red/pink
  Retain:     "#f5f5f5",  // light grey
  Relocate:   "#ffe6cc",  // light orange
};

// ─── XML builder ──────────────────────────────────────────────────────────────

export function buildMigrationDiagramXml(spec: MigrationDiagramSpec): string {
  const cells: string[] = [];
  let yOffset = 80;

  // ── Title ──
  cells.push(
    `<mxCell id="title" value="${escapeXml(spec.title)}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=18;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="900" height="40" as="geometry"/></mxCell>`
  );

  // ── Legend ──
  let legendX = 20;
  const legendY = 70;
  cells.push(`<mxCell id="legend-title" value="Migration Strategy" style="text;html=1;strokeColor=none;fillColor=none;fontStyle=1;fontSize=10;" vertex="1" parent="1"><mxGeometry x="${legendX}" y="${legendY}" width="140" height="20" as="geometry"/></mxCell>`);
  legendX += 150;

  const strategies: MigrationStrategy[] = ["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"];
  for (const s of strategies) {
    const colour = STRATEGY_COLOURS[s];
    cells.push(
      `<mxCell id="legend-${s}" value="${s}" style="rounded=1;whiteSpace=wrap;fillColor=${colour};strokeColor=#666666;fontSize=9;" vertex="1" parent="1"><mxGeometry x="${legendX}" y="${legendY}" width="90" height="20" as="geometry"/></mxCell>`
    );
    legendX += 100;
  }

  yOffset = legendY + 40;

  // ── Source environment panel ──
  const sourceEnvLabel = spec.sourceEnvironment ?? "Source (On-Premises)";
  cells.push(
    `<mxCell id="source-env" value="${escapeXml(sourceEnvLabel)}" style="swimlane;fontStyle=1;fontSize=14;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1"><mxGeometry x="20" y="${yOffset}" width="420" height="${Math.max(200, spec.sourceNodes.length * 90 + 60)}" as="geometry"/></mxCell>`
  );

  // Source nodes
  let srcY = 40;
  const srcNodePositions = new Map<string, { x: number; y: number }>();
  for (const node of spec.sourceNodes) {
    const shape = getSourceShape();
    const nx = 30;
    const ny = srcY;
    srcNodePositions.set(node.id, { x: 20 + nx + shape.width / 2, y: yOffset + ny + shape.height / 2 });

    cells.push(
      `<mxCell id="${node.id}" value="${escapeXml(node.label)}" style="${shape.style}fontSize=10;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="source-env"><mxGeometry x="${nx}" y="${ny}" width="${shape.width}" height="${shape.height}" as="geometry"/></mxCell>`
    );

    // Strategy badge
    if (node.strategy) {
      const colour = STRATEGY_COLOURS[node.strategy];
      cells.push(
        `<mxCell id="${node.id}-badge" value="${node.strategy}" style="rounded=1;fillColor=${colour};strokeColor=#666666;fontSize=8;" vertex="1" parent="source-env"><mxGeometry x="${nx + shape.width + 5}" y="${ny + 10}" width="80" height="22" as="geometry"/></mxCell>`
      );
    }
    srcY += 85;
  }

  // ── Migration arrow ──
  const panelH = Math.max(200, Math.max(spec.sourceNodes.length, spec.targetNodes.length) * 90 + 60);
  const arrowY = yOffset + panelH / 2;
  cells.push(
    `<mxCell id="migration-arrow" value="Migration" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=3;strokeColor=#0066CC;fontStyle=1;endArrow=block;endFill=1;" edge="1" parent="1" source="source-env" target="target-env"><mxGeometry relative="1" as="geometry"/></mxCell>`
  );
  void arrowY;

  // ── Target environment panel ──
  const cloudLabel = spec.targetCloud
    ? `Target (${spec.targetCloud.toUpperCase()})`
    : "Target Cloud";
  cells.push(
    `<mxCell id="target-env" value="${escapeXml(cloudLabel)}" style="swimlane;fontStyle=1;fontSize=14;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="520" y="${yOffset}" width="450" height="${panelH}" as="geometry"/></mxCell>`
  );

  // Target nodes
  let tgtY = 40;
  const tgtNodePositions = new Map<string, { x: number; y: number }>();
  for (const node of spec.targetNodes) {
    const cloud = spec.targetCloud ?? "aws";
    const shape = getCloudShape(cloud, node.service ?? "generic");
    const nx = 30;
    const ny = tgtY;
    tgtNodePositions.set(node.id, { x: 520 + nx + shape.width / 2, y: yOffset + ny + shape.height / 2 });

    const fillColour = node.strategy ? STRATEGY_COLOURS[node.strategy] : "#ffffff";

    cells.push(
      `<mxCell id="${node.id}" value="${escapeXml(node.label)}" style="${shape.style}fontSize=10;fillColor=${fillColour};strokeColor=#0066CC;" vertex="1" parent="target-env"><mxGeometry x="${nx}" y="${ny}" width="${shape.width}" height="${shape.height}" as="geometry"/></mxCell>`
    );

    // Service label
    if (node.service) {
      cells.push(
        `<mxCell id="${node.id}-svc" value="${node.service}" style="text;html=1;fontSize=8;fillColor=none;strokeColor=none;" vertex="1" parent="target-env"><mxGeometry x="${nx}" y="${ny + shape.height}" width="${shape.width}" height="16" as="geometry"/></mxCell>`
      );
    }

    tgtY += 90;
  }

  // ── Edges ──
  for (const edge of spec.edges) {
    const edgeStyle = edge.style === "dashed" ? "dashed=1;" : edge.style === "dotted" ? "dashed=1;dash=2;" : "";
    cells.push(
      `<mxCell id="edge-${edge.source}-${edge.target}" value="${escapeXml(edge.label ?? "")}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;${edgeStyle}strokeColor=#333333;" edge="1" parent="1" source="${edge.source}" target="${edge.target}"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
  }

  void srcNodePositions;
  void tgtNodePositions;

  return wrapInDiagram(cells.join("\n    "), spec.title);
}

function getSourceShape(): ShapeSpec {
  return { style: "shape=mxgraph.network.server;", width: 60, height: 60 };
}

function getCloudShape(cloud: string, service: string): ShapeSpec {
  const lower = service.toLowerCase();
  if (cloud === "aws") return AWS_SHAPES[lower] ?? AWS_SHAPES["generic"]!;
  if (cloud === "azure") return AZURE_SHAPES[lower] ?? AZURE_SHAPES["generic"]!;
  if (cloud === "gcp") return GCP_SHAPES[lower] ?? GCP_SHAPES["generic"]!;
  return AWS_SHAPES["generic"]!;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapInDiagram(cells: string, title: string): string {
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
    ${cells}
  </root></mxGraphModel>`;
}

// ─── Quick diagram builder for a workload assessment ─────────────────────────

export function buildAssessmentDiagram(
  workloadName: string,
  strategy: MigrationStrategy,
  targetCloud: "aws" | "azure" | "gcp",
  sourceComponents: { label: string; type: string }[],
  targetComponents: { label: string; service: string }[]
): string {
  const sourceNodes: DiagramNode[] = sourceComponents.map((c, i) => ({
    id: `src-${i}`,
    label: c.label,
    type: c.type as DiagramNode["type"],
    strategy,
  }));

  const targetNodes: DiagramNode[] = targetComponents.map((c, i) => ({
    id: `tgt-${i}`,
    label: c.label,
    type: "compute",
    service: c.service,
    strategy,
    cloud: targetCloud,
  }));

  const edges: DiagramEdge[] = sourceNodes.map((sn, i) => ({
    source: sn.id,
    target: targetNodes[i]?.id ?? targetNodes[0]!.id,
    label: strategy,
    style: "dashed",
  }));

  const spec: MigrationDiagramSpec = {
    title: `${workloadName} — ${strategy} Migration to ${targetCloud.toUpperCase()}`,
    targetCloud,
    sourceNodes,
    targetNodes,
    edges,
  };

  return buildMigrationDiagramXml(spec);
}
