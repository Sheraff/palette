import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
let port = 0;

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
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
    ["/api/graph", "application/json; charset=utf-8"],
    ["/api/orphans", "application/json; charset=utf-8"],
    ["/MECHANISMS.md", "text/markdown; charset=utf-8"],
    ["/MECHANISMS.html", "text/html; charset=utf-8"],
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

  for (const mode of ["product", "full", "frontiers", "orphans", "diagnostics", "runtime"]) {
    assert.match(
      html,
      new RegExp(`data-mode="${mode}"[^>]*aria-pressed="(?:true|false)"`),
    );
  }
  assert.match(html, /<title>Palette Product Capability Map<\/title>/);
  const primaryModeBlock = /<div class="mode-grid primary-mode-grid">([\s\S]*?)<\/div>/.exec(html)?.[1];
  assert.ok(primaryModeBlock);
  assert.match(primaryModeBlock, /data-mode="product"[^>]*aria-pressed="true"[^>]*>Product map<\/button>/);
  assert.doesNotMatch(primaryModeBlock, /data-mode="full"|productOverlay/);
  assert.match(
    html,
    /<details class="secondary-controls" id="secondaryControls">[\s\S]*?<summary>Research details<\/summary>/,
  );
  assert.doesNotMatch(html, /<details class="secondary-controls" id="secondaryControls"[^>]*\sopen/);
  const researchStart = html.indexOf('<details class="secondary-controls" id="secondaryControls">');
  assert.ok(researchStart > 0);
  assert.ok(html.indexOf('data-mode="full"', researchStart) > researchStart);
  assert.ok(html.indexOf('id="showAllProductContracts"', researchStart) > researchStart);
  assert.ok(html.indexOf('id="productOverlay"', researchStart) > researchStart);
  assert.match(html, /Evaluation, governance &amp; research custody overlay/);
  assert.match(html, /id="productConnectivity"[^>]*aria-labelledby="productConnectivityHeading"/);
  assert.match(html, /<span>Confirmed structural gap<\/span>/);
  assert.match(html, /<details class="open-contracts" id="openContracts">[\s\S]*?<span>Open contracts<\/span>/);
  assert.doesNotMatch(html, /<details class="open-contracts" id="openContracts"[^>]*\sopen/);
  const openContractsBlock = /<details class="open-contracts" id="openContracts">([\s\S]*?)<\/details>/.exec(html)?.[1];
  assert.ok(openContractsBlock);
  assert.doesNotMatch(openContractsBlock, /gaps?|blockers?|required work|priority/i);
  assert.doesNotMatch(html, /Product gaps|Natural input gap|Unconsumed product evidence/);
  assert.match(html, /Classification, not sequence/);
  assert.match(html, /Runtime\/focus classification does not mean selected, integrated, product-ready, source-validated, or proven compatible/);
  assert.match(
    html,
    /id="visibleNodeNavigator"[^>]*role="listbox"[^>]*aria-label="Currently visible artifacts and mechanisms"/,
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
  assert.match(html, /id="inspector"[^>]*aria-live="polite"[^>]*aria-label="Selected contract inspector"/);
});

test("disclosure, navigator, live status, and zoom interactions remain wired", async () => {
  const { javascript, css } = await loadWebFiles();
  assert.match(javascript, /secondaryControls\.open = false/);
  assert.match(javascript, /openContracts\.open = false/);
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
  assert.match(javascript, /declared closure conditions remain unresolved/);
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
    { name: "Candidate closure", options: { mode: "frontiers" }, expected: ["12 artifacts", "34 mechanisms", "56 incidences"] },
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
  const { stderr } = await execFileAsync(process.execPath, ["--check", APP_PATH], {
    encoding: "utf8",
  });
  assert.equal(stderr, "");
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
