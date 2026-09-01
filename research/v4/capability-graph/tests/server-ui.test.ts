import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import {
  createCapabilityGraphServer,
  parsePort,
} from "../src/serve.ts";
import { APP_PATH, loadFixtures, loadWebFiles } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const serverHandle = createCapabilityGraphServer();
const WORKBENCH_URL = new URL("../web/workbench.js", import.meta.url);
const BRANCH_PLAN_URL = new URL("../data/branch-plan.json", import.meta.url);
const BRANCH_ANALYSIS_URL = new URL("../data/branch-analysis.json", import.meta.url);
let port = 0;

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

interface PlannedPort {
  id: string;
  artifactTypeId: string;
}

interface PlannedPortGroup {
  id: string;
  ports: PlannedPort[];
}

interface PlannedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  producerPortId: string;
  consumerPortId: string;
  artifactTypeId: string;
  recipeIds: Set<string>;
}

interface PlannedMechanism {
  id: string;
  title: string;
  operation: string;
  origin: "existing" | "proposed";
  layer: string;
  sourceRef: string;
  witnessRecipeIds: string[];
  sidecars: {
    fixtureId: string;
    visualizationId: string;
    humanScoreId: string;
  };
  readiness: {
    implementationAvailable: boolean;
    fixtureAvailable: boolean;
    visualizationAvailable: boolean;
    humanScoreAvailable: boolean;
  };
  contract: {
    productInputs: PlannedPortGroup[];
    outputBranches: PlannedPortGroup[];
  };
}

interface BranchWorkbench {
  mechanisms: PlannedMechanism[];
  mechanismById: Map<string, PlannedMechanism>;
  condemned: Array<{
    id: string;
    reason: string;
    evidenceRefs: string[];
  }>;
  edges: PlannedEdge[];
  layers: Array<{
    id: string;
    label: string;
    mechanismIds: string[];
    existingCount: number;
    proposedCount: number;
  }>;
  defaultLayerId: string;
  recipeById: Map<string, {
    recipeId: string;
    family: string;
    preferred: boolean;
    routeOccurrences: Map<string, Array<{ ordinal: number; instanceId: string }>>;
  }>;
  recipeFamilies: Map<string, string[]>;
  interchangeabilitySlots: BranchAnalysisFixture["interchangeabilitySlots"];
  missingHandoffs: Array<{
    mechanismId: string;
    operation: string;
    upstream: PlannedEdge[];
    downstream: PlannedEdge[];
  }>;
}

interface BranchPlanFixture {
  currentMechanisms: Array<{
    mechanismId: string;
    disposition: string;
    reason: string;
    workbenchLayer?: string;
    evidenceRefs?: string[];
  }>;
  proposedArtifacts: Array<{ id: string; kind: string }>;
  proposedMechanisms: Array<{
    id: string;
    title: string;
    layer: string;
    workbenchLayer: string;
    sourceRef: string;
    operation: string;
    productInputs: PlannedPortGroup[];
    productOutputs: PlannedPortGroup[];
    readiness: {
      implementationAvailable: boolean;
      fixtureAvailable: boolean;
      visualizationAvailable: boolean;
      humanScoreAvailable: boolean;
    };
    sidecars: PlannedMechanism["sidecars"];
  }>;
  recipes: Array<{
    id: string;
    preferred: boolean;
    goalBinding: {
      producerInstanceId: string;
      producerPortId: string;
    };
  }>;
}

interface BranchAnalysisFixture {
  documentKind: string;
  schemaVersion: string;
  branchPlanDigest: {
    algorithm: string;
    basis: string;
    sha256: string;
  };
  capabilityGraphDigest: {
    algorithm: string;
    basis: string;
    sha256: string;
  };
  builtMetrics: {
    currentMechanisms: number;
    primaryMechanisms: number;
    sourceReachablePrimaryMechanisms: number;
    goalReachablePrimaryMechanisms: number;
  };
  inventoryCounts: {
    currentRetained: number;
    currentCondemned: number;
    currentDemoted: number;
    existingSidecars: number;
    totalSidecarInspectors: number;
    proposedMechanisms: number;
  };
  plannedConnected: {
    currentMechanismIds: string[];
    proposedMechanismIds: string[];
  };
  workbenchMechanisms: Array<{
    mechanismId: string;
    origin: "current" | "proposed";
    workbenchLayer: string;
  }>;
  workbenchLayers: Array<{
    workbenchLayer: string;
    currentMechanismIds: string[];
    proposedMechanismIds: string[];
  }>;
  essentialWitnesses: Array<{
    mechanismId: string;
    recipeIds: string[];
  }>;
  interchangeabilitySlots: Array<{
    slotId: string;
    mechanismIds: string[];
    cleanWitnesses: Array<{
      mechanismId: string;
      recipeIds: string[];
    }>;
    comparisons: Array<{
      leftMechanismId: string;
      leftRecipeId: string;
      rightMechanismId: string;
      rightRecipeId: string;
      normalizedSurroundingSha256: string;
    }>;
  }>;
  recipeCounts: {
    declared: number;
    successful: number;
    executionReady: number;
  };
  effectiveDispositions: Array<{
    mechanismId: string;
    effectiveDisposition: string;
    reason: string;
  }>;
  recipes: Array<{
    recipeId: string;
    family: string;
    successful: boolean;
    essentialMechanismIds: string[];
    expandedSteps: Array<{
      instanceId: string;
      mechanismId: string;
      productBindings: Array<{
        consumerPortId: string;
        producerInstanceId: string;
        producerPortId: string;
      }>;
    }>;
  }>;
}

interface WorkbenchModule {
  assertBranchPayloadIntegrity(graph: unknown, plan: unknown, analysis: unknown): void;
  buildBranchWorkbench(graph: unknown, plan: unknown, analysis: unknown): BranchWorkbench;
  buildLayerProjection(workbench: BranchWorkbench, layerId: string): {
    selectedIds: Set<string>;
    contextIds: Set<string>;
    upstreamContextIds: Set<string>;
    downstreamContextIds: Set<string>;
    mechanismIds: Set<string>;
    edges: PlannedEdge[];
  };
  isForbiddenPlannedLineArtifact(artifactTypeId: string): boolean;
  indexRouteOccurrences(steps: Array<{ instanceId: string; mechanismId: string }>): Map<string, Array<{ ordinal: number; instanceId: string }>>;
  verifyBranchPlanDigest(plan: unknown, analysis: unknown): Promise<string>;
  verifyCapabilityGraphDigest(graph: unknown, analysis: unknown): Promise<string>;
  searchBranchWorkbench(workbench: BranchWorkbench, query: string): Array<{ id: string; status: string }>;
  plannedInspectorData(workbench: BranchWorkbench, mechanismId: string): {
    kind: "planned" | "condemned";
    mechanism: PlannedMechanism & { reason?: string; evidenceRefs?: string[] };
    inputs?: PlannedPortGroup[];
    outputs?: PlannedPortGroup[];
    upstream?: PlannedEdge[];
    downstream?: PlannedEdge[];
    sidecars?: Array<{ kind: string; id: string; available: boolean }>;
  } | undefined;
}

interface PlannedPresentationModule {
  plannedProjectionPresentation(projection: {
    selectedIds: Set<string>;
    upstreamContextIds: Set<string>;
    downstreamContextIds: Set<string>;
  }): {
    dualRoleIds: string[];
    columns: Array<{
      role: string;
      mechanismIds: string[];
    }>;
  };
  plannedNodePresentation(
    node: { origin: "existing" | "proposed"; dualRole: boolean },
    routeOccurrences?: Array<{ ordinal: number; instanceId: string }>,
  ): {
    statusText: string;
    routeBadgeText: string;
    routeTooltipText: string;
  };
}

async function loadBranchFixtures(): Promise<{
  plan: BranchPlanFixture;
  analysis: BranchAnalysisFixture;
}> {
  const [planSource, analysisSource] = await Promise.all([
    readFile(BRANCH_PLAN_URL, "utf8"),
    readFile(BRANCH_ANALYSIS_URL, "utf8"),
  ]);
  return {
    plan: JSON.parse(planSource) as BranchPlanFixture,
    analysis: JSON.parse(analysisSource) as BranchAnalysisFixture,
  };
}

function httpRequest(path: string, method = "GET"): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      { host: "127.0.0.1", port, method, path },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

before(async () => {
  port = await serverHandle.listen(0);
});

after(async () => {
  await serverHandle.close();
});

test("fixed routes return their declared content types", async () => {
  const routes = [
    ["/", "text/html; charset=utf-8"],
    ["/index.html", "text/html; charset=utf-8"],
    ["/styles.css", "text/css; charset=utf-8"],
    ["/app.js", "text/javascript; charset=utf-8"],
    ["/workbench.js", "text/javascript; charset=utf-8"],
    ["/api/graph", "application/json; charset=utf-8"],
    ["/api/orphans", "application/json; charset=utf-8"],
    ["/api/branch-plan", "application/json; charset=utf-8"],
    ["/api/branch-analysis", "application/json; charset=utf-8"],
    ["/MECHANISMS.md", "text/markdown; charset=utf-8"],
    ["/MECHANISMS.html", "text/html; charset=utf-8"],
    ["/BRANCH_RESEARCH.md", "text/markdown; charset=utf-8"],
  ] as const;
  for (const [path, contentType] of routes) {
    const response = await httpRequest(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers["content-type"], contentType, path);
    assert.ok(response.body.byteLength > 0, path);
    assert.equal(Number(response.headers["content-length"]), response.body.byteLength, path);
  }
  assert.equal(
    JSON.parse((await httpRequest("/api/graph")).body.toString()).documentKind,
    "typed-capability-compatibility-hypergraph",
  );
});

test("HEAD, 404, traversal rejection, and method Allow behavior are explicit", async () => {
  const head = await httpRequest("/api/graph", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body.byteLength, 0);
  assert.ok(Number(head.headers["content-length"]) > 0);

  const missing = await httpRequest("/not-a-route");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.toString(), "Not found.\n");

  for (const path of [
    "/../app.js",
    "/%2e%2e/app.js",
    "/..%2fapp.js",
    "/%2e%2e%5capp.js",
  ]) {
    const traversal = await httpRequest(path);
    assert.equal(traversal.status, 404, path);
  }

  const post = await httpRequest("/api/graph", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
  assert.equal(post.body.toString(), "Capability graph server is read-only.\n");
});

test("the source HTML exposes escaped, stable one-based line anchors", async () => {
  const response = await httpRequest("/MECHANISMS.html");
  const html = response.body.toString();
  assert.equal(response.status, 200);
  assert.match(
    html,
    /<span class="line" id="L1"><a href="#L1" aria-label="Line 1">1<\/a><code>/,
  );
  assert.match(
    html,
    /<span class="line" id="L82"><a href="#L82" aria-label="Line 82">82<\/a><code>/,
  );
  assert.match(html, /### `raster\.native-opaque-decode` - Native opaque raster custody/);
  assert.match(html, /Inputs -&gt; outputs/);
});

test("CLI port parsing covers defaults, both overrides, and invalid forms", () => {
  assert.equal(parsePort([]), 4200);
  assert.equal(parsePort(["4300"]), 4300);
  assert.equal(parsePort(["--port", "4301"]), 4301);
  for (const arguments_ of [
    ["--port"],
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "4.2"],
    ["--unknown", "4300"],
    ["4300", "4301"],
  ]) {
    assert.throws(() => parsePort(arguments_), /Usage|Invalid port/);
  }
});

test("HTML supplies every JavaScript-bound control and required ARIA contract", async () => {
  const { html, javascript } = await loadWebFiles();
  const elementBlock = /const elements = (?:browserEnvironment \? )?Object\.fromEntries\(\[([\s\S]*?)\]\.map/.exec(
    javascript,
  );
  assert.ok(elementBlock);
  const boundIds = [...elementBlock[1].matchAll(/"([A-Za-z][A-Za-z0-9]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(boundIds.length > 0);
  for (const id of boundIds) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  const declaredIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(declaredIds).size, declaredIds.length);

  for (const mode of ["workbench", "product", "full", "frontiers", "orphans", "diagnostics", "runtime"]) {
    assert.match(
      html,
      new RegExp(`data-mode="${mode}"[^>]*aria-pressed="(?:true|false)"`),
    );
  }
  assert.match(html, /<title>Palette Planned Branch Workbench<\/title>/);
  const primaryModeBlock = /<div class="mode-grid primary-mode-grid">([\s\S]*?)<\/div>/.exec(html)?.[1];
  assert.ok(primaryModeBlock);
  assert.match(primaryModeBlock, /data-mode="workbench"[^>]*aria-pressed="true"[^>]*>Planned workbench<\/button>/);
  assert.doesNotMatch(primaryModeBlock, /data-mode="product"|data-mode="full"|productOverlay|recipe\./);
  assert.match(
    html,
    /<details class="secondary-controls" id="secondaryControls">[\s\S]*?<summary>Research details<\/summary>/,
  );
  assert.doesNotMatch(html, /<details class="secondary-controls" id="secondaryControls"[^>]*\sopen/);
  const researchStart = html.indexOf('<details class="secondary-controls" id="secondaryControls">');
  assert.ok(researchStart > 0);
  assert.ok(html.indexOf('data-mode="product"', researchStart) > researchStart);
  assert.ok(html.indexOf('data-mode="full"', researchStart) > researchStart);
  assert.ok(html.indexOf('id="showAllProductContracts"', researchStart) > researchStart);
  assert.ok(html.indexOf('id="productOverlay"', researchStart) > researchStart);
  assert.match(html, /Secondary evaluation and research context/);
  assert.match(html, /id="productConnectivity"[^>]*aria-labelledby="productConnectivityHeading"/);
  assert.match(html, /<span>Confirmed structural gap<\/span>/);
  assert.match(html, /<details class="open-contracts" id="openContracts">[\s\S]*?<span>Open built contracts<\/span>/);
  assert.doesNotMatch(html, /<details class="open-contracts" id="openContracts"[^>]*\sopen/);
  const openContractsBlock = /<details class="open-contracts" id="openContracts">([\s\S]*?)<\/details>/.exec(html)?.[1];
  assert.ok(openContractsBlock);
  assert.doesNotMatch(openContractsBlock, /gaps?|blockers?|required work|priority/i);
  assert.doesNotMatch(html, /Product gaps|Natural input gap|Unconsumed product evidence/);
  assert.match(html, /progress once a mechanism's outputs are validated/);
  assert.doesNotMatch(html, /progress from validated outputs/i);
  assert.match(html, /id="plannedError"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="layerTabs"[^>]*role="tablist"/);
  assert.match(html, /<span class="origin-existing">Existing<\/span>/);
  assert.match(html, /<span class="origin-proposed">Missing mechanism to build<\/span>/);
  assert.match(html, /<details class="plan-disclosure" id="recipeControls">/);
  assert.match(html, /<details class="plan-disclosure" id="handoffControls">/);
  assert.match(html, /<details class="condemned-controls" id="condemnedControls">/);
  assert.doesNotMatch(html, /id="(?:recipeControls|handoffControls|condemnedControls)"[^>]*\sopen/);
  assert.match(html, /Type-closed on paper; not implemented or evaluated/);
  assert.doesNotMatch(html, /candidate closure|semantic audit/i);
  assert.match(
    html,
    /id="visibleNodeNavigator"[^>]*role="listbox"[^>]*aria-label="Currently visible graph entries"/,
  );
  assert.match(
    html,
    /id="liveStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  );
  assert.match(html, /id="visibleCount"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(
    html,
    /id="graphCanvas"[^>]*tabindex="0"[^>]*role="img"[^>]*aria-label=/,
  );
  assert.match(html, /id="inspector"[^>]*aria-live="polite"[^>]*aria-label="Selected mechanism or contract inspector"/);
});

test("disclosure, navigator, live status, and zoom interactions remain wired", async () => {
  const { javascript, css } = await loadWebFiles();
  assert.match(javascript, /secondaryControls\.open = !state\.workbench/);
  assert.match(javascript, /openContracts\.open = false/);
  assert.match(javascript, /recipeControls\.open = false/);
  assert.match(javascript, /handoffControls\.open = false/);
  assert.match(javascript, /condemnedControls\.open = false/);
  assert.match(javascript, /function frameReadablePlannedView\(\)/);
  assert.match(javascript, /href="\/BRANCH_RESEARCH\.md"/);
  assert.match(javascript, /layerTabs\.addEventListener\("keydown"/);
  assert.match(javascript, /event\.stopPropagation\(\)/);
  assert.match(javascript, /recipeSelect\.addEventListener\("change"/);
  assert.match(javascript, /recipeSlotSelect\.addEventListener\("change"/);
  assert.match(javascript, /Each pair below has matching normalized surroundings; different pairs may have different digests/);
  assert.doesNotMatch(javascript, /Every comparison below has the same normalized surroundings digest/);
  assert.match(javascript, /handoffSearch\.addEventListener\("input"/);
  assert.match(javascript, /productOverlay\.addEventListener\("change"/);
  assert.match(javascript, /showAllProductContracts\.addEventListener\("change"/);
  assert.match(javascript, /productConnectivity\.addEventListener\("click"/);
  assert.match(javascript, /function frameReadableProductView\(\)/);
  assert.match(javascript, /const PRODUCT_INITIAL_SCALE = 0\.58/);
  assert.match(javascript, /if \(state\.showAllProductContracts\) return model\.productProjection/);
  assert.match(javascript, /dataset\.mechanismLabels/);
  assert.match(javascript, /visibleCountSegments\(\{/);
  assert.match(javascript, /\.map\(\(segment\) => `<span>\$\{escapeHtml\(segment\)\}<\/span>`\)/);
  assert.match(javascript, /materializerGaps/);
  assert.match(javascript, /openInputContracts/);
  assert.match(javascript, /openAlternativeContracts/);
  assert.match(javascript, /openOutputContracts/);
  assert.doesNotMatch(javascript, /productFocus\.gaps|buildProductGapGroups/);
  assert.doesNotMatch(javascript, /producerless product gap|group blockers|blocking obligations|Missing direct obligations|Missing alternative groups/);
  assert.match(javascript, /confirmed product materializer gap/);
  assert.match(javascript, /group unresolved conditions/);
  assert.match(javascript, /declared required conditions remain unresolved/);
  assert.doesNotMatch(javascript, /candidate closure|Candidate closure/);
  assert.match(javascript, /function revealInFullRegistry\(key\)/);
  assert.match(javascript, /visibleNodeNavigator\.addEventListener\("change"/);
  assert.match(javascript, /function announce\(message\)/);
  assert.match(javascript, /zoomInButton\.addEventListener\("click"/);
  assert.match(javascript, /zoomOutButton\.addEventListener\("click"/);
  assert.match(javascript, /graphCanvas\.addEventListener\("wheel"/);
  assert.match(
    javascript,
    /event\.key === "Home" \|\| event\.key\.toLowerCase\(\) === "f"/,
  );
  assert.match(javascript, /event\.key === "\+" \|\| event\.key === "="/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /details:not\(\[open\]\) > :not\(summary\) \{ display: none !important; \}/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /#minimap \{ display: none; \}/);
  assert.match(css, /max-height: 55dvh/);
  assert.match(css, /min-height: 44px/);
});

test("mobile actionable target rules establish 44 CSS pixel bounds", async () => {
  const { css } = await loadWebFiles();
  const mobileStart = css.indexOf("@media (max-width: 520px)");
  const mobileEnd = css.indexOf("@media (prefers-reduced-motion", mobileStart);
  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart);
  const mobileCss = css.slice(mobileStart, mobileEnd);

  const declarationsFor = (selector: string) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declarations = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(mobileCss)?.[1];
    assert.ok(declarations, selector);
    return declarations;
  };
  const assertMinimum = (selector: string, dimension: "width" | "height") => {
    assert.match(declarationsFor(selector), new RegExp(`min-${dimension}:\\s*44px`), selector);
  };

  for (const selector of [".source-link", ".map-toolbar button", ".text-button", ".inspector-close", ".node-jump", ".inspector a"]) {
    assertMinimum(selector, "width");
    assertMinimum(selector, "height");
  }
  for (const selector of [".view-actions button:first-child", ".view-actions button:nth-child(2)"]) {
    assertMinimum(selector, "width");
  }
  for (const selector of [".search-field input", ".switch-row", ".check-row label"]) {
    assertMinimum(selector, "height");
  }
});

test("mobile visible counts share bounded wrapping without clipping or ellipsis", async () => {
  const { css } = await loadWebFiles();
  const mobileStart = css.indexOf("@media (max-width: 520px)");
  const mobileEnd = css.indexOf("@media (prefers-reduced-motion", mobileStart);
  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart);
  const mobileCss = css.slice(mobileStart, mobileEnd);
  const countRule = /\.visible-count\s*\{([^}]*)\}/.exec(mobileCss)?.[1];
  const spanRule = /\.visible-count span\s*\{([^}]*)\}/.exec(mobileCss)?.[1];
  assert.ok(countRule);
  assert.ok(spanRule);
  assert.match(countRule, /max-width:\s*100%/);
  assert.match(countRule, /flex-wrap:\s*wrap/);
  assert.match(countRule, /overflow:\s*visible/);
  assert.match(countRule, /text-overflow:\s*clip/);
  assert.doesNotMatch(countRule, /white-space:\s*nowrap|text-overflow:\s*ellipsis/);
  assert.match(spanRule, /max-width:\s*100%/);
  assert.match(spanRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(mobileCss, /\.visible-count\.[\w-]+/);
});

test("every projection renders concise visible count spans", async () => {
  const webModule = await import(pathToFileURL(APP_PATH).href) as {
    visibleCountSegments(options: {
      mode: string;
      productOverlay?: boolean;
      showAllProductContracts?: boolean;
      visibleArtifacts: number;
      visibleMechanisms: number;
      visibleIncidences: number;
      totalProductContracts: number;
    }): string[];
  };
  const counts = {
    visibleArtifacts: 12,
    visibleMechanisms: 34,
    visibleIncidences: 56,
    totalProductContracts: 78,
  };
  const projections = [
    { name: "compact Product", options: { mode: "product" }, expected: ["34 mechanisms", "12 visible contracts", "56 incidences", "78 total contracts"] },
    { name: "all Product", options: { mode: "product", showAllProductContracts: true }, expected: ["All product", "12 contracts", "34 mechanisms", "56 incidences"] },
    { name: "Product overlay", options: { mode: "product", productOverlay: true }, expected: ["Overlay", "12 contracts", "34 mechanisms", "56 incidences"] },
    { name: "Full", options: { mode: "full" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
    { name: "Declared input reach", options: { mode: "frontiers" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
    { name: "Orphans", options: { mode: "orphans" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
    { name: "Diagnostics", options: { mode: "diagnostics" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
    { name: "Permitted runtime", options: { mode: "runtime" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
  ];

  for (const projection of projections) {
    const segments = webModule.visibleCountSegments({ ...counts, ...projection.options });
    assert.deepEqual(segments, projection.expected, projection.name);
    assert.ok(segments.every((segment) => segment.length > 0 && !segment.includes("/")), projection.name);
  }
});

test("browser JavaScript parses cleanly", async () => {
  for (const path of [APP_PATH, WORKBENCH_URL.pathname]) {
    const { stderr } = await execFileAsync(process.execPath, ["--check", path], {
      encoding: "utf8",
    });
    assert.equal(stderr, "", path);
  }
});

test("application data loading keeps branch and orphan failures independent", async () => {
  const [{ graph, analysis }, { plan, analysis: branchAnalysis }, appModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(pathToFileURL(APP_PATH).href) as Promise<{
      loadApplicationData(request: (path: string) => Promise<unknown>): Promise<{
        graph: unknown;
        analysis: unknown;
        branchPlan: unknown;
        branchAnalysis: unknown;
        plannedError: string | null;
        orphanWarning: string | null;
        initialMode: string;
      }>;
    }>,
  ]);
  const payloads: Record<string, unknown> = {
    "/api/graph": graph,
    "/api/orphans": analysis,
    "/api/branch-plan": plan,
    "/api/branch-analysis": branchAnalysis,
  };
  const requestFrom = (failedPath?: string) => async (path: string) => {
    if (path === failedPath) throw new Error(`${path}: unavailable`);
    return payloads[path];
  };

  const healthy = await appModule.loadApplicationData(requestFrom());
  assert.equal(healthy.initialMode, "workbench");
  assert.strictEqual(healthy.branchPlan, plan);
  assert.equal(healthy.plannedError, null);

  const branchFailure = await appModule.loadApplicationData(requestFrom("/api/branch-plan"));
  assert.equal(branchFailure.initialMode, "product");
  assert.equal(branchFailure.branchPlan, null);
  assert.match(branchFailure.plannedError ?? "", /branch-plan.*unavailable/);
  assert.strictEqual(branchFailure.graph, graph);
  assert.strictEqual(branchFailure.analysis, analysis);

  const orphanFailure = await appModule.loadApplicationData(requestFrom("/api/orphans"));
  assert.equal(orphanFailure.initialMode, "workbench");
  assert.strictEqual(orphanFailure.analysis, graph.analysis);
  assert.match(orphanFailure.orphanWarning ?? "", /orphans.*unavailable/);
  assert.strictEqual(orphanFailure.branchPlan, plan);

  await assert.rejects(
    appModule.loadApplicationData(requestFrom("/api/graph")),
    /api\/graph.*unavailable/,
  );
});

test("malformed branch metadata and a one-key canonical digest mutation fall back to Built Product", async () => {
  const [{ graph, analysis }, { plan, analysis: branchAnalysis }, appModule, webModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(pathToFileURL(APP_PATH).href) as Promise<{
      loadApplicationData(request: (path: string) => Promise<unknown>): Promise<{
        branchPlan: unknown;
        plannedError: string | null;
        initialMode: string;
      }>;
    }>,
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
  ]);
  assert.equal(await webModule.verifyBranchPlanDigest(plan, branchAnalysis), branchAnalysis.branchPlanDigest.sha256);

  const load = (branchPlan: unknown, generatedAnalysis: unknown) => appModule.loadApplicationData(async (path) => ({
    "/api/graph": graph,
    "/api/orphans": analysis,
    "/api/branch-plan": branchPlan,
    "/api/branch-analysis": generatedAnalysis,
  } as Record<string, unknown>)[path]);

  const malformedAnalysis = structuredClone(branchAnalysis);
  malformedAnalysis.documentKind = "not-a-branch-analysis";
  const malformed = await load(plan, malformedAnalysis);
  assert.equal(malformed.initialMode, "product");
  assert.equal(malformed.branchPlan, null);
  assert.match(malformed.plannedError ?? "", /absent or malformed/);

  const mutatedPlan = structuredClone(plan);
  mutatedPlan.recipes[0].preferred = true;
  await assert.rejects(
    webModule.verifyBranchPlanDigest(mutatedPlan, branchAnalysis),
    /digest mismatch/,
  );
  const digestFailure = await load(mutatedPlan, branchAnalysis);
  assert.equal(digestFailure.initialMode, "product");
  assert.equal(digestFailure.branchPlan, null);
  assert.match(digestFailure.plannedError ?? "", /digest mismatch/);
});

test("same-count capability graph mutation with stale branch analysis nonfatally disables Planned mode", async () => {
  const [{ graph, analysis }, { plan, analysis: branchAnalysis }, appModule, webModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(pathToFileURL(APP_PATH).href) as Promise<{
      loadApplicationData(request: (path: string) => Promise<unknown>): Promise<{
        graph: unknown;
        analysis: unknown;
        branchPlan: unknown;
        workbench: unknown;
        plannedError: string | null;
        initialMode: string;
      }>;
    }>,
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
  ]);
  assert.equal(
    await webModule.verifyCapabilityGraphDigest(graph, branchAnalysis),
    branchAnalysis.capabilityGraphDigest.sha256,
  );

  const mutatedGraph = structuredClone(graph);
  mutatedGraph.mechanisms[0].title = `${mutatedGraph.mechanisms[0].title} modified`;
  assert.equal(mutatedGraph.mechanisms.length, graph.mechanisms.length);
  assert.equal(mutatedGraph.artifactTypes.length, graph.artifactTypes.length);
  await assert.rejects(
    webModule.verifyCapabilityGraphDigest(mutatedGraph, branchAnalysis),
    /Capability graph digest mismatch/,
  );

  const loaded = await appModule.loadApplicationData(async (path) => ({
    "/api/graph": mutatedGraph,
    "/api/orphans": analysis,
    "/api/branch-plan": plan,
    "/api/branch-analysis": branchAnalysis,
  } as Record<string, unknown>)[path]);
  assert.equal(loaded.initialMode, "product");
  assert.strictEqual(loaded.graph, mutatedGraph);
  assert.strictEqual(loaded.analysis, analysis);
  assert.equal(loaded.branchPlan, null);
  assert.equal(loaded.workbench, null);
  assert.match(loaded.plannedError ?? "", /Capability graph digest mismatch/);
});

test("layer tab movement repeatedly focuses the newly rendered active tab", async () => {
  const appModule = await import(pathToFileURL(APP_PATH).href) as {
    moveLayerTabFocus(options: {
      layerIds: string[];
      currentLayerId: string;
      key: string;
      activate(layerId: string): void;
      resolveRenderedTab(layerId: string): { focus(): void } | undefined;
    }): string | null;
  };
  const focused: string[] = [];
  let currentLayerId = "raster";
  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) {
    const next = appModule.moveLayerTabFocus({
      layerIds: ["raster", "evidence", "field"],
      currentLayerId,
      key,
      activate: (layerId) => { currentLayerId = layerId; },
      resolveRenderedTab: (layerId) => ({ focus: () => focused.push(layerId) }),
    });
    assert.equal(next, currentLayerId);
  }
  assert.deepEqual(focused, ["evidence", "field", "evidence", "raster", "field"]);
  assert.equal(appModule.moveLayerTabFocus({
    layerIds: ["raster"],
    currentLayerId: "raster",
    key: "Home",
    activate: () => assert.fail("non-arrow keys must not activate a tab"),
    resolveRenderedTab: () => undefined,
  }), null);
});

test("dual-role context presentation places the same mechanism in both intended columns", async () => {
  const [webModule, appModule] = await Promise.all([
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
    import(pathToFileURL(APP_PATH).href) as Promise<PlannedPresentationModule>,
  ]);
  const workbench = {
    layers: [{ id: "middle", mechanismIds: ["mechanism.middle"] }],
    mechanismById: new Map([
      ["mechanism.middle", {} as PlannedMechanism],
      ["mechanism.both", {} as PlannedMechanism],
    ]),
    edges: [
      { sourceId: "mechanism.both", targetId: "mechanism.middle" },
      { sourceId: "mechanism.middle", targetId: "mechanism.both" },
    ],
  } as unknown as BranchWorkbench;
  const projection = webModule.buildLayerProjection(workbench, "middle");
  const presentation = appModule.plannedProjectionPresentation(projection);
  assert.deepEqual([...projection.contextIds], ["mechanism.both"]);
  assert.deepEqual([...projection.upstreamContextIds], ["mechanism.both"]);
  assert.deepEqual([...projection.downstreamContextIds], ["mechanism.both"]);
  assert.deepEqual(presentation, {
    dualRoleIds: ["mechanism.both"],
    columns: [
      { role: "upstream context", mechanismIds: ["mechanism.both"] },
      { role: "selected layer", mechanismIds: ["mechanism.middle"] },
      { role: "downstream context", mechanismIds: ["mechanism.both"] },
    ],
  });
  assert.equal(
    appModule.plannedNodePresentation({ origin: "existing", dualRole: true }).statusText,
    "EXISTING / DUAL ROLE",
  );

  const inboundOnlyProjection = webModule.buildLayerProjection({
    ...workbench,
    edges: [workbench.edges[0]],
  }, "middle");
  const inboundOnlyPresentation = appModule.plannedProjectionPresentation(inboundOnlyProjection);
  assert.deepEqual(inboundOnlyPresentation, {
    dualRoleIds: [],
    columns: [
      { role: "upstream context", mechanismIds: ["mechanism.both"] },
      { role: "selected layer", mechanismIds: ["mechanism.middle"] },
      { role: "downstream context", mechanismIds: [] },
    ],
  });
  assert.notDeepEqual(inboundOnlyPresentation, presentation);
});

test("repeated route presentation exposes every exact ordinal in badges and tooltips", async () => {
  const [webModule, appModule] = await Promise.all([
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
    import(pathToFileURL(APP_PATH).href) as Promise<PlannedPresentationModule>,
  ]);
  const occurrences = webModule.indexRouteOccurrences([
    { instanceId: "first", mechanismId: "mechanism.repeat" },
    { instanceId: "middle", mechanismId: "mechanism.other" },
    { instanceId: "second", mechanismId: "mechanism.repeat" },
  ]);
  assert.deepEqual(occurrences.get("mechanism.repeat"), [
    { ordinal: 1, instanceId: "first" },
    { ordinal: 3, instanceId: "second" },
  ]);
  const presentation = appModule.plannedNodePresentation(
    { origin: "existing", dualRole: false },
    occurrences.get("mechanism.repeat"),
  );
  assert.deepEqual(presentation, {
    statusText: "EXISTING",
    routeBadgeText: "1, 3",
    routeTooltipText: "Route: 1. first / 3. second",
  });

  const changedOccurrences = webModule.indexRouteOccurrences([
    { instanceId: "first", mechanismId: "mechanism.repeat" },
    { instanceId: "middle", mechanismId: "mechanism.other" },
    { instanceId: "second", mechanismId: "mechanism.repeat" },
    { instanceId: "third", mechanismId: "mechanism.repeat" },
  ]);
  const changedPresentation = appModule.plannedNodePresentation(
    { origin: "proposed", dualRole: false },
    changedOccurrences.get("mechanism.repeat"),
  );
  assert.deepEqual(changedPresentation, {
    statusText: "MISSING TO BUILD",
    routeBadgeText: "1, 3, 4",
    routeTooltipText: "Route: 1. first / 3. second / 4. third",
  });
  assert.notDeepEqual(changedPresentation, presentation);
});

test("planned workbench inventory and progressive layers exactly follow generated branch data", async () => {
  const [{ graph }, { plan, analysis }, webModule, appModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
    import(pathToFileURL(APP_PATH).href) as Promise<{
      workbenchStatusText(branchAnalysis: BranchAnalysisFixture): string;
    }>,
  ]);
  assert.doesNotThrow(() => webModule.assertBranchPayloadIntegrity(graph, plan, analysis));
  const workbench = webModule.buildBranchWorkbench(graph, plan, analysis);
  const graphBytes = await readFile(new URL("../data/capability-graph.json", import.meta.url));
  assert.deepEqual(analysis.capabilityGraphDigest, {
    algorithm: "sha256",
    basis: "canonical-json-utf8",
    sha256: createHash("sha256").update(graphBytes).digest("hex"),
  });
  assert.equal(
    await webModule.verifyCapabilityGraphDigest(graph, analysis),
    analysis.capabilityGraphDigest.sha256,
  );

  assert.deepEqual(analysis.inventoryCounts, {
    currentCondemned: 9,
    currentDemoted: 3,
    currentRetained: 71,
    existingSidecars: 66,
    fullPlannedRegistry: 211,
    proposedMechanisms: 62,
    proposedProductArtifacts: 61,
    proposedSidecarArtifacts: 4,
    totalSidecarInspectors: 69,
  });
  assert.deepEqual(analysis.recipeCounts, { declared: 88, executionReady: 0, successful: 88 });
  assert.equal(
    appModule.workbenchStatusText(analysis),
    "71 retained / 62 missing to build / 9 condemned / 69 sidecar-inspectors / 133 essential source-to-v3 witnesses / 88 optional type-closed recipes / 10 interchangeability slots / 0 execution-ready. Progress only once a mechanism's outputs are validated; planned routes are not implementation proof.",
  );
  assert.deepEqual(analysis.builtMetrics, {
    currentMechanisms: 149,
    goalReachablePrimaryMechanisms: 0,
    materializers: 0,
    primaryIncidences: 279,
    primaryMechanisms: 83,
    primaryProductArtifacts: 191,
    sourceReachablePrimaryMechanisms: 14,
  });

  const expectedActiveIds = [
    ...analysis.plannedConnected.currentMechanismIds,
    ...analysis.plannedConnected.proposedMechanismIds,
  ].sort();
  assert.equal(expectedActiveIds.length, 133);
  assert.deepEqual(workbench.mechanisms.map(({ id }) => id).sort(), expectedActiveIds);
  assert.ok(workbench.mechanisms.every((mechanism) => mechanism.witnessRecipeIds.length > 0));
  assert.deepEqual(
    workbench.mechanisms.filter(({ origin }) => origin === "existing").map(({ id }) => id).sort(),
    [...analysis.plannedConnected.currentMechanismIds].sort(),
  );
  assert.deepEqual(
    workbench.mechanisms.filter(({ origin }) => origin === "proposed").map(({ id }) => id).sort(),
    [...analysis.plannedConnected.proposedMechanismIds].sort(),
  );
  assert.deepEqual(
    workbench.layers.flatMap(({ mechanismIds }) => mechanismIds).sort(),
    expectedActiveIds,
  );
  assert.equal(analysis.workbenchMechanisms.length, 133);
  assert.deepEqual(
    workbench.mechanisms.map(({ id, layer, origin }) => ({
      mechanismId: id,
      origin: origin === "existing" ? "current" : "proposed",
      workbenchLayer: layer,
    })),
    analysis.workbenchMechanisms,
  );
  assert.deepEqual(
    workbench.layers.map((layer) => ({
      workbenchLayer: layer.id,
      mechanismIds: layer.mechanismIds,
      currentCount: layer.existingCount,
      proposedCount: layer.proposedCount,
    })),
    analysis.workbenchLayers.map((layer) => ({
      workbenchLayer: layer.workbenchLayer,
      mechanismIds: [...layer.currentMechanismIds, ...layer.proposedMechanismIds],
      currentCount: layer.currentMechanismIds.length,
      proposedCount: layer.proposedMechanismIds.length,
    })),
  );
  assert.equal(workbench.defaultLayerId, "raster");
  assert.equal(workbench.layers[0].label, "Artwork file & raster foundations");
});

test("planned workbench follows a generated layer metadata move without client changes", async () => {
  const [{ graph }, { plan, analysis }, webModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
  ]);
  const mutatedAnalysis = structuredClone(analysis);
  const sourceLayer = mutatedAnalysis.workbenchLayers.find(({ workbenchLayer }) => workbenchLayer === "color");
  const targetLayer = mutatedAnalysis.workbenchLayers.find(({ workbenchLayer }) => workbenchLayer === "literature");
  assert.ok(sourceLayer);
  assert.ok(targetLayer);
  const movedMechanismId = sourceLayer.currentMechanismIds[0];
  assert.ok(movedMechanismId);
  sourceLayer.currentMechanismIds = sourceLayer.currentMechanismIds.filter((id) => id !== movedMechanismId);
  targetLayer.currentMechanismIds = [...targetLayer.currentMechanismIds, movedMechanismId].sort();
  const generatedMechanism = mutatedAnalysis.workbenchMechanisms
    .find(({ mechanismId }) => mechanismId === movedMechanismId);
  assert.ok(generatedMechanism);
  generatedMechanism.workbenchLayer = targetLayer.workbenchLayer;

  const workbench = webModule.buildBranchWorkbench(graph, plan, mutatedAnalysis);
  assert.equal(workbench.mechanismById.get(movedMechanismId)?.layer, "literature");
  assert.ok(!workbench.layers.find(({ id }) => id === "color")?.mechanismIds.includes(movedMechanismId));
  assert.ok(workbench.layers.find(({ id }) => id === "literature")?.mechanismIds.includes(movedMechanismId));
  assert.equal(workbench.layers.find(({ id }) => id === "color")?.existingCount, 0);
  assert.equal(workbench.layers.find(({ id }) => id === "literature")?.existingCount, 7);
});

test("planned product lines and layer context exactly follow successful generated recipe bindings", async () => {
  const [{ graph }, { plan, analysis }, webModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
  ]);
  const workbench = webModule.buildBranchWorkbench(graph, plan, analysis);
  const lineKey = (edge: Omit<PlannedEdge, "id" | "recipeIds">) => [
    edge.sourceId,
    edge.producerPortId,
    edge.artifactTypeId,
    edge.targetId,
    edge.consumerPortId,
  ].join("\u0000");
  const expectedRecipeIdsByLine = new Map<string, Set<string>>();
  const declaredRecipeById = new Map(plan.recipes.map((recipe) => [recipe.id, recipe]));
  const addExpectedLine = (key: string, recipeId: string) => {
    if (!expectedRecipeIdsByLine.has(key)) expectedRecipeIdsByLine.set(key, new Set());
    expectedRecipeIdsByLine.get(key)?.add(recipeId);
  };

  for (const recipe of analysis.recipes.filter(({ successful }) => successful)) {
    const declared = declaredRecipeById.get(recipe.recipeId);
    assert.ok(declared, recipe.recipeId);
    const stepByInstance = new Map(recipe.expandedSteps.map((step) => [step.instanceId, step]));
    for (const consumer of recipe.expandedSteps) {
      const contract = workbench.mechanismById.get(consumer.mechanismId)?.contract;
      assert.ok(contract, consumer.mechanismId);
      const inputPorts = contract.productInputs.flatMap(({ ports }) => ports);
      for (const binding of consumer.productBindings) {
        const port = inputPorts.find(({ id }) => id === binding.consumerPortId);
        assert.ok(port, `${recipe.recipeId}:${consumer.mechanismId}:${binding.consumerPortId}`);
        if (webModule.isForbiddenPlannedLineArtifact(port.artifactTypeId)) continue;
        addExpectedLine(lineKey({
          sourceId: stepByInstance.get(binding.producerInstanceId)?.mechanismId ?? "$source",
          targetId: consumer.mechanismId,
          producerPortId: binding.producerPortId,
          consumerPortId: binding.consumerPortId,
          artifactTypeId: port.artifactTypeId,
        }), recipe.recipeId);
      }
    }
    const goalStep = stepByInstance.get(declared.goalBinding.producerInstanceId);
    assert.ok(goalStep, recipe.recipeId);
    const goalPort = workbench.mechanismById.get(goalStep.mechanismId)?.contract.outputBranches
      .flatMap(({ ports }) => ports)
      .find(({ id }) => id === declared.goalBinding.producerPortId);
    assert.ok(goalPort, recipe.recipeId);
    if (!webModule.isForbiddenPlannedLineArtifact(goalPort.artifactTypeId)) {
      addExpectedLine(lineKey({
        sourceId: goalStep.mechanismId,
        targetId: "$goal",
        producerPortId: goalPort.id,
        consumerPortId: "$goal",
        artifactTypeId: goalPort.artifactTypeId,
      }), recipe.recipeId);
    }
  }

  const serializeLines = (entries: Iterable<[string, Set<string>]>) => [...entries]
    .map(([key, recipeIds]) => [key, [...recipeIds].sort()] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(
    serializeLines(workbench.edges.map((edge) => [lineKey(edge), edge.recipeIds])),
    serializeLines(expectedRecipeIdsByLine),
  );
  assert.ok(workbench.edges.every((edge) => !webModule.isForbiddenPlannedLineArtifact(edge.artifactTypeId)));
  assert.equal(workbench.recipeById.size, 88);
  assert.ok([...workbench.recipeById.values()].every(({ preferred }) => preferred === false));
  assert.ok(plan.recipes.every(({ preferred }) => preferred === false));
  const expectedFamilyIds = analysis.recipes.reduce((families, { family, recipeId }) => {
    const recipeIds = families.get(family) ?? [];
    recipeIds.push(recipeId);
    families.set(family, recipeIds);
    return families;
  }, new Map<string, string[]>());
  assert.deepEqual(
    [...workbench.recipeFamilies].map(([family, recipeIds]) => [family, [...recipeIds].sort()]),
    [...expectedFamilyIds].map(([family, recipeIds]) => [family, recipeIds.sort()]),
  );
  assert.equal([...workbench.recipeFamilies.values()].flat().length, 88);
  assert.equal(workbench.interchangeabilitySlots.length, 10);
  assert.deepEqual(
    workbench.interchangeabilitySlots.map(({ slotId, mechanismIds }) => [slotId, mechanismIds]),
    analysis.interchangeabilitySlots.map(({ slotId, mechanismIds }) => [slotId, mechanismIds]),
  );
  assert.ok(workbench.interchangeabilitySlots.every(({ cleanWitnesses, comparisons }) =>
    cleanWitnesses.length >= 2 && comparisons.length > 0));
  assert.deepEqual(
    workbench.missingHandoffs.map(({ mechanismId }) => mechanismId).sort(),
    plan.proposedMechanisms.map(({ id }) => id).sort(),
  );

  for (const layer of workbench.layers) {
    const projection = webModule.buildLayerProjection(workbench, layer.id);
    const selectedIds = new Set(layer.mechanismIds);
    const expectedContextIds = new Set<string>();
    const expectedEdges = workbench.edges.filter((edge) => {
      const incident = selectedIds.has(edge.sourceId) || selectedIds.has(edge.targetId);
      if (!incident) return false;
      if (workbench.mechanismById.has(edge.sourceId) && !selectedIds.has(edge.sourceId)) expectedContextIds.add(edge.sourceId);
      if (workbench.mechanismById.has(edge.targetId) && !selectedIds.has(edge.targetId)) expectedContextIds.add(edge.targetId);
      return true;
    });
    assert.deepEqual([...projection.selectedIds].sort(), [...selectedIds].sort(), layer.id);
    assert.deepEqual([...projection.contextIds].sort(), [...expectedContextIds].sort(), layer.id);
    assert.deepEqual(projection.edges.map(({ id }) => id), expectedEdges.map(({ id }) => id), layer.id);
    assert.ok(projection.edges.every((edge) => selectedIds.has(edge.sourceId) || selectedIds.has(edge.targetId)), layer.id);
  }
});

test("planned inspectors, search, and condemned isolation preserve generated contracts", async () => {
  const [{ graph }, { plan, analysis }, webModule] = await Promise.all([
    loadFixtures(),
    loadBranchFixtures(),
    import(WORKBENCH_URL.href) as Promise<WorkbenchModule>,
  ]);
  const workbench = webModule.buildBranchWorkbench(graph, plan, analysis);
  const proposedArtifactKindById = new Map(plan.proposedArtifacts.map((artifact) => [artifact.id, artifact.kind]));
  const filterGroups = (groups: PlannedPortGroup[]) => groups
    .map((group) => ({
      ...group,
      ports: group.ports.filter((port) =>
        proposedArtifactKindById.get(port.artifactTypeId) !== "sidecar"
        && !webModule.isForbiddenPlannedLineArtifact(port.artifactTypeId)),
    }))
    .filter(({ ports }) => ports.length);

  for (const proposed of plan.proposedMechanisms) {
    const detail = webModule.plannedInspectorData(workbench, proposed.id);
    assert.equal(detail?.kind, "planned", proposed.id);
    assert.equal(detail?.mechanism.operation, proposed.operation, proposed.id);
    assert.equal(detail?.mechanism.sourceRef, proposed.sourceRef, proposed.id);
    assert.deepEqual(detail?.inputs, filterGroups(proposed.productInputs), proposed.id);
    assert.deepEqual(detail?.outputs, filterGroups(proposed.productOutputs), proposed.id);
    assert.deepEqual(detail?.upstream, workbench.edges.filter((edge) => edge.targetId === proposed.id), proposed.id);
    assert.deepEqual(detail?.downstream, workbench.edges.filter((edge) => edge.sourceId === proposed.id), proposed.id);
    assert.deepEqual(detail?.sidecars, [
      { kind: "Known-good fixture", id: proposed.sidecars.fixtureId, available: false },
      { kind: "Visualization", id: proposed.sidecars.visualizationId, available: false },
      { kind: "Human score", id: proposed.sidecars.humanScoreId, available: false },
    ], proposed.id);
    assert.ok(webModule.searchBranchWorkbench(workbench, proposed.id).some(({ id }) => id === proposed.id), proposed.id);
    assert.ok(webModule.searchBranchWorkbench(workbench, proposed.operation).some(({ id }) => id === proposed.id), proposed.id);
  }

  const expectedCondemnedIds = plan.currentMechanisms
    .filter(({ disposition }) => disposition === "condemned")
    .map(({ mechanismId }) => mechanismId)
    .sort();
  assert.deepEqual(workbench.condemned.map(({ id }) => id).sort(), expectedCondemnedIds);
  assert.ok(expectedCondemnedIds.every((id) => !workbench.mechanismById.has(id)));
  assert.deepEqual(
    webModule.searchBranchWorkbench(workbench, "condemned formulation").map(({ id }) => id).sort(),
    expectedCondemnedIds,
  );
  for (const condemned of workbench.condemned) {
    const disposition = analysis.effectiveDispositions.find(({ mechanismId }) => mechanismId === condemned.id);
    const declared = plan.currentMechanisms.find(({ mechanismId }) => mechanismId === condemned.id);
    const detail = webModule.plannedInspectorData(workbench, condemned.id);
    assert.equal(detail?.kind, "condemned", condemned.id);
    assert.equal(condemned.reason, disposition?.reason, condemned.id);
    assert.deepEqual(condemned.evidenceRefs, declared?.evidenceRefs, condemned.id);
    assert.ok(webModule.searchBranchWorkbench(workbench, condemned.id).some(({ id }) => id === condemned.id), condemned.id);
  }
});

test("web consumer rejects equal-count payloads from different valid generation digests", async () => {
  const { graph, analysis } = await loadFixtures();
  const webModule = await import(pathToFileURL(APP_PATH).href) as {
    assertConsumerPayloadIntegrity(graphPayload: unknown, analysisPayload: unknown): void;
  };
  assert.equal(graph.schemaVersion, "1.3.0");
  assert.equal(analysis.generator.version, "1.5.0");
  assert.doesNotThrow(() => webModule.assertConsumerPayloadIntegrity(graph, analysis));
  const legacyConsumerAnalysis = structuredClone(analysis) as unknown as {
    productFocus: Record<string, unknown>;
  };
  for (const name of [
    "materializerGaps",
    "openInputContracts",
    "openAlternativeContracts",
    "openOutputContracts",
  ]) delete legacyConsumerAnalysis.productFocus[name];
  legacyConsumerAnalysis.productFocus.gaps = {};
  assert.throws(
    () => webModule.assertConsumerPayloadIntegrity(graph, legacyConsumerAnalysis),
    /Generated product-focus metadata is absent or malformed/,
  );

  const mismatchedAnalysis = structuredClone(analysis);
  mismatchedAnalysis.generationDigest = `${graph.generationDigest.startsWith("0") ? "1" : "0"}${graph.generationDigest.slice(1)}`;
  assert.equal(mismatchedAnalysis.counts.artifactTypes, graph.artifactTypes.length);
  assert.equal(mismatchedAnalysis.counts.mechanisms, graph.mechanisms.length);
  assert.equal(
    mismatchedAnalysis.counts.inputPorts,
    graph.mechanisms.reduce((count, mechanism) => count + mechanism.inputPorts.length, 0),
  );
  assert.equal(
    mismatchedAnalysis.counts.outputPorts,
    graph.mechanisms.reduce((count, mechanism) => count + mechanism.outputPorts.length, 0),
  );
  assert.throws(
    () => webModule.assertConsumerPayloadIntegrity(graph, mismatchedAnalysis),
    /Generation digest mismatch: graph and standalone orphan analysis come from different generations; refusing to render\./,
  );
});

test("Product map membership and incidences exactly consume generated focus metadata", async () => {
  const { graph, analysis } = await loadFixtures();
  const webModule = await import(pathToFileURL(APP_PATH).href) as {
    buildProductProjection(
      graphPayload: typeof graph,
      analysisPayload: typeof analysis,
      includeOverlay?: boolean,
    ): {
      mechanismIds: Set<string>;
      artifactIds: Set<string>;
      incidenceIds: Set<string>;
      overlayMechanismIds: Set<string>;
      overlayArtifactIds: Set<string>;
      overlayIncidenceIds: Set<string>;
    };
    buildCompactProductProjection(
      graphPayload: typeof graph,
      analysisPayload: typeof analysis,
    ): {
      mechanismIds: Set<string>;
      artifactIds: Set<string>;
      incidenceIds: Set<string>;
      sharedArtifactIds: Set<string>;
      boundaryArtifactIds: Set<string>;
      materializerArtifactIds: Set<string>;
    };
    productLabelsVisibleAtScale(scale: number): boolean;
  };
  const referenceKey = (reference: { mechanismId: string; direction: string; portId: string }) =>
    `${reference.mechanismId}:${reference.direction}:${reference.portId}`;
  const focus = analysis.productFocus;
  const primary = webModule.buildProductProjection(graph, analysis);

  assert.deepEqual([...primary.mechanismIds].sort(), [...focus.primaryMechanismIds].sort());
  assert.deepEqual([...primary.artifactIds].sort(), [...focus.primaryArtifactIds].sort());
  assert.deepEqual(
    [...primary.incidenceIds].sort(),
    focus.primaryIncidences.map(referenceKey).sort(),
  );
  assert.deepEqual(
    {
      mechanisms: primary.mechanismIds.size,
      artifacts: primary.artifactIds.size,
      incidences: primary.incidenceIds.size,
    },
    { mechanisms: 83, artifacts: 191, incidences: 279 },
  );

  const artifactIdByReference = new Map<string, string>();
  for (const mechanism of graph.mechanisms) {
    for (const [direction, ports] of [
      ["input", mechanism.inputPorts],
      ["output", mechanism.outputPorts],
    ] as const) {
      for (const port of ports) {
        artifactIdByReference.set(
          referenceKey({ mechanismId: mechanism.id, direction, portId: port.id }),
          port.artifactTypeId,
        );
      }
    }
  }
  const directionsByArtifactId = new Map<string, Set<string>>();
  for (const reference of focus.primaryIncidences) {
    const artifactId = artifactIdByReference.get(referenceKey(reference));
    assert.ok(artifactId);
    if (!directionsByArtifactId.has(artifactId)) directionsByArtifactId.set(artifactId, new Set());
    directionsByArtifactId.get(artifactId)?.add(reference.direction);
  }
  const primaryArtifactIds = new Set(focus.primaryArtifactIds);
  const expectedSharedArtifactIds = new Set(focus.primaryArtifactIds.filter((id) => {
    const directions = directionsByArtifactId.get(id);
    return directions?.has("input") && directions.has("output");
  }));
  const expectedBoundaryArtifactIds = new Set(graph.artifactTypes
    .filter((artifact) =>
      primaryArtifactIds.has(artifact.id)
      && artifact.boundaryClassification === "expected-external")
    .map((artifact) => artifact.id));
  const expectedMaterializerArtifactIds = new Set(
    focus.materializerGaps.map((observation) => observation.artifactTypeId),
  );
  const expectedCompactArtifactIds = new Set([
    ...expectedSharedArtifactIds,
    ...expectedBoundaryArtifactIds,
    ...expectedMaterializerArtifactIds,
  ]);
  const expectedCompactIncidenceIds = new Set(focus.primaryIncidences
    .filter((reference) => expectedCompactArtifactIds.has(
      artifactIdByReference.get(referenceKey(reference)) ?? "",
    ))
    .map(referenceKey));
  const compact = webModule.buildCompactProductProjection(graph, analysis);
  assert.deepEqual([...compact.mechanismIds].sort(), [...focus.primaryMechanismIds].sort());
  assert.deepEqual([...compact.artifactIds].sort(), [...expectedCompactArtifactIds].sort());
  assert.deepEqual([...compact.incidenceIds].sort(), [...expectedCompactIncidenceIds].sort());
  assert.deepEqual([...compact.sharedArtifactIds].sort(), [...expectedSharedArtifactIds].sort());
  assert.deepEqual([...compact.boundaryArtifactIds].sort(), [...expectedBoundaryArtifactIds].sort());
  assert.deepEqual([...compact.materializerArtifactIds], ["artifact.product.ui-palette.v3"]);
  assert.equal(compact.mechanismIds.size, 83);
  assert.deepEqual(
    {
      mechanisms: compact.mechanismIds.size,
      artifacts: compact.artifactIds.size,
      incidences: compact.incidenceIds.size,
    },
    { mechanisms: 83, artifacts: 28, incidences: 87 },
  );
  assert.ok(compact.artifactIds.size < primary.artifactIds.size);
  assert.equal(webModule.productLabelsVisibleAtScale(0.58), true);
  assert.equal(webModule.productLabelsVisibleAtScale(0.339), false);

  const inspectorReferences = new Set(focus.inspectorInputPorts.map(referenceKey));
  assert.ok(inspectorReferences.size > 0);
  assert.ok([...inspectorReferences].every((id) => !primary.incidenceIds.has(id)));

  const overlay = webModule.buildProductProjection(graph, analysis, true);
  assert.deepEqual(
    [...overlay.overlayMechanismIds].sort(),
    [...focus.secondaryOverlayMechanismIds].sort(),
  );
  assert.deepEqual(
    [...overlay.overlayArtifactIds].sort(),
    [...focus.secondaryOverlayArtifactIds].sort(),
  );
  assert.deepEqual(
    {
      mechanisms: overlay.overlayMechanismIds.size,
      attachedArtifacts: overlay.overlayArtifactIds.size,
      incidences: overlay.overlayIncidenceIds.size,
    },
    { mechanisms: 36, attachedArtifacts: 34, incidences: 61 },
  );
  assert.deepEqual(
    {
      mechanisms: overlay.mechanismIds.size,
      artifacts: overlay.artifactIds.size,
      incidences: overlay.incidenceIds.size,
    },
    { mechanisms: 119, artifacts: 225, incidences: 340 },
  );
  assert.deepEqual(focus.fullRegistryCounts, {
    mechanisms: 149,
    artifacts: 589,
    incidences: 771,
  });
});

test("context ports remain inspectable while open contracts exclude non-product context", async () => {
  const { graph, analysis } = await loadFixtures();
  const webModule = await import(pathToFileURL(APP_PATH).href) as {
    groupMechanismInputPorts(
      mechanism: (typeof graph.mechanisms)[number],
      artifactById: Map<string, (typeof graph.artifactTypes)[number]>,
    ): {
      productInputs: Array<{ id: string }>;
      configurationAndControls: Array<{ id: string }>;
      evaluationAndCustody: Array<{ id: string }>;
    };
    buildOpenContractGroups(
      graphPayload: typeof graph,
      analysisPayload: typeof analysis,
    ): Array<{ id: string; rows: Array<{ targetKey: string }> }>;
  };
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const inspectorReferences = new Set(
    analysis.productFocus.inspectorInputPorts.map((reference) =>
      `${reference.mechanismId}:${reference.portId}`),
  );
  const groupedInspectorReferences = new Set<string>();
  for (const mechanism of graph.mechanisms) {
    const groups = webModule.groupMechanismInputPorts(mechanism, artifactById);
    assert.equal(
      groups.productInputs.length
        + groups.configurationAndControls.length
        + groups.evaluationAndCustody.length,
      mechanism.inputPorts.length,
      mechanism.id,
    );
    for (const port of [...groups.configurationAndControls, ...groups.evaluationAndCustody]) {
      groupedInspectorReferences.add(`${mechanism.id}:${port.id}`);
    }
  }
  assert.ok([...inspectorReferences].every((id) => groupedInspectorReferences.has(id)));

  assert.deepEqual(analysis.productFocus.connectivityCounts, {
    materializerGaps: 1,
    openInputContracts: 80,
    openAlternativeContracts: 5,
    openOutputContracts: 86,
  });
  assert.deepEqual(analysis.productFocus.materializerGaps, [{
    artifactTypeId: "artifact.product.ui-palette.v3",
    kind: "missing-product-materializer",
    status: "confirmed-structural-gap",
  }]);
  const openContractGroups = webModule.buildOpenContractGroups(graph, analysis);
  assert.deepEqual(openContractGroups.map(({ id, rows }) => [id, rows.length]), [
    ["input", 80],
    ["alternative", 5],
    ["output", 86],
  ]);
  assert.equal(openContractGroups.reduce((count, group) => count + group.rows.length, 0), 171);
  const excludedCategories = new Set([
    "configuration",
    "control",
    "model",
    "review",
    "custody",
    "diagnostic",
    "provenance",
    "report",
  ]);
  const openContractArtifactIds = new Set([
    ...analysis.productFocus.openInputContracts.map((contract) => contract.artifactTypeId),
    ...analysis.productFocus.openAlternativeContracts.flatMap(
      (contract) => contract.artifactTypeIds,
    ),
    ...analysis.productFocus.openOutputContracts.map(
      (contract) => contract.artifactTypeId,
    ),
  ]);
  assert.ok([...openContractArtifactIds].every((id) => {
    const artifact = artifactById.get(id);
    return artifact
      && artifact.boundaryClassification !== "expected-external"
      && !excludedCategories.has(artifact.category);
  }));
});
