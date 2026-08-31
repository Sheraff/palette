const LEFT_ANCHOR_ID = "artifact.raster.native-srgb8-opaque.v1";
const RIGHT_ANCHOR_ID = "artifact.product.ui-palette.v3";
const NODE_SIZE = {
  artifact: { width: 166, height: 30 },
  mechanism: { width: 178, height: 36 },
};
const NODE_LABEL_MIN_SCALE = 0.34;
const PRODUCT_INITIAL_SCALE = 0.58;
const PLANE_COLORS = {
  runtime: "#63d6cd",
  development: "#aa90dc",
  governance: "#e9aa57",
};
const ORPHAN_COLORS = {
  "required-gap": "#e9aa57",
  "configuration-gap": "#efcc71",
  "unavailable-alternative-group": "#d891cf",
  "optional-absence": "#b8a576",
  "unused-alternative": "#7498cf",
  "expected-external-root": "#aa90dc",
  "unresolved-external-root": "#d98b62",
  "product-goal-gap": "#e16b65",
  "internal-unused": "#d48668",
  "intentional-terminal": "#8fc77b",
  "expected-external-handoff": "#72bbdb",
  "unresolved-terminal": "#d98b62",
  "product-goal-terminal": "#e16b65",
};
const ORPHAN_LABELS = {
  "required-gap": "Required input unavailable",
  "configuration-gap": "Configuration input unavailable",
  "unavailable-alternative-group": "Unavailable alternative group",
  "optional-absence": "Optional absent input",
  "unused-alternative": "Unused alternative",
  "expected-external-root": "Expected external root",
  "unresolved-external-root": "Unresolved external root",
  "product-goal-gap": "Product goal gap",
  "internal-unused": "Internal unused output",
  "intentional-terminal": "Intentional terminal",
  "expected-external-handoff": "Expected external handoff",
  "unresolved-terminal": "Unresolved terminal",
  "product-goal-terminal": "Product goal terminal",
};
const MODE_NOTES = {
  product: "Generated product-focus classifications only. This view does not select or authorize a product pipeline.",
  full: "Every canonical artifact, census mechanism, and typed port incidence in the generated registry.",
  frontiers: "Declaration-level candidate closure from the native raster and eligible expected-external runtime/governance roots. This is not executable or source-validated reachability.",
  orphans: "Generated never-provided and never-used artifact types with their incident mechanisms.",
  diagnostics: "Development values and diagnostic, model, external, review, and evidence-custody lanes.",
  runtime: "Mechanisms with a permitted runtime variant. Every typed port remains visible; non-runtime context is marked, and mixed permitted/prohibited status is retained.",
};
const PRODUCT_LANE_DEFINITIONS = [
  {
    id: "product.source-color",
    label: "Source & color",
    registryLaneIds: ["lane.image-and-color"],
  },
  {
    id: "product.structure-field",
    label: "Structure & field",
    registryLaneIds: ["lane.structure-and-field"],
  },
  {
    id: "product.roles-treatment",
    label: "Roles & treatment",
    registryLaneIds: ["lane.role-and-treatment"],
  },
  {
    id: "product.contract-render",
    label: "Contract & render checks",
    registryLaneIds: [
      "lane.validation-and-rendering",
      "lane.development-diagnostics",
      "lane.models-and-external",
      "lane.review-and-evidence",
      "lane.configuration-and-governance",
    ],
  },
];
const OVERLAY_LANE_DEFINITIONS = [
  { id: "overlay.evaluation", label: "Evaluation", overlay: true },
  { id: "overlay.research-custody", label: "Governance & research custody", overlay: true },
];

const browserEnvironment = typeof window !== "undefined" && typeof document !== "undefined";
const elements = browserEnvironment ? Object.fromEntries([
  "canvasWrap",
  "allProductContractsControl",
  "capabilityFilter",
  "categoryFilter",
  "clearFilters",
  "fitButton",
  "generatedCounts",
  "graphCanvas",
  "instrument",
  "inspector",
  "liveStatus",
  "loading",
  "minimap",
  "modeControls",
  "modeNote",
  "materializerContract",
  "navigatorCount",
  "openAlternativeCount",
  "openContractCount",
  "openContractGroups",
  "openContracts",
  "openInputCount",
  "openOutputCount",
  "orphanFilter",
  "overlayControl",
  "planeFilters",
  "productConnectivity",
  "productOverlay",
  "resetButton",
  "searchContext",
  "searchCount",
  "searchForm",
  "searchInput",
  "secondaryControls",
  "showAllProductContracts",
  "snapshot",
  "tooltip",
  "visibleNodeNavigator",
  "visibleCount",
  "zoomInButton",
  "zoomOutButton",
  "zoomReadout",
].map((id) => [id, document.getElementById(id)])) : {};

const context = browserEnvironment ? elements.graphCanvas.getContext("2d") : null;
const minimapContext = browserEnvironment ? elements.minimap.getContext("2d") : null;
if (browserEnvironment && (!context || !minimapContext)) throw new Error("Canvas 2D is unavailable.");

const state = {
  graph: null,
  analysis: null,
  model: null,
  layout: null,
  visibleKeys: new Set(),
  visibleEdgeIds: new Set(),
  searchMatches: [],
  searchCursor: -1,
  mode: "product",
  productOverlay: false,
  showAllProductContracts: false,
  planes: new Set(["runtime", "development", "governance"]),
  capability: "",
  category: "",
  orphanClass: "",
  selectedKey: null,
  hoveredKey: null,
  view: { x: 0, y: 0, scale: 1 },
  renderPending: false,
  initialized: false,
  pointers: new Map(),
  gesture: null,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function nodeKey(kind, id) {
  return `${kind}:${id}`;
}

function setIntersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function referenceKey(reference) {
  return `${reference.mechanismId}:${reference.direction}:${reference.portId}`;
}

export function productLabelsVisibleAtScale(scale) {
  return scale >= NODE_LABEL_MIN_SCALE;
}

export function visibleCountSegments({
  mode,
  productOverlay = false,
  showAllProductContracts = false,
  visibleArtifacts,
  visibleMechanisms,
  visibleIncidences,
  totalProductContracts,
}) {
  if (mode === "product" && productOverlay) {
    return ["Overlay", `${visibleArtifacts} contracts`, `${visibleMechanisms} mechanisms`, `${visibleIncidences} incidences`];
  }
  if (mode === "product" && showAllProductContracts) {
    return ["All product", `${visibleArtifacts} contracts`, `${visibleMechanisms} mechanisms`, `${visibleIncidences} incidences`];
  }
  if (mode === "product") {
    return [
      `${visibleMechanisms} mechanisms`,
      `${visibleArtifacts} visible contracts`,
      `${visibleIncidences} incidences`,
      `${totalProductContracts} total contracts`,
    ];
  }
  return [`${visibleArtifacts} artifacts`, `${visibleMechanisms} mechanisms`, `${visibleIncidences} incidences`];
}

function inputDetailClasses(entry, detail) {
  const classes = new Set();
  if (entry.disposition === "expected-external-root") classes.add("expected-external-root");
  if (entry.disposition === "unresolved-external-root") classes.add("unresolved-external-root");
  if (entry.disposition === "product-goal-gap") classes.add("product-goal-gap");
  if (detail.obligationClassification === "collective-alternative-group-obligation") {
    classes.add("unavailable-alternative-group");
  } else if (detail.obligationClassification === "optional-absence") {
    classes.add("optional-absence");
  } else if (detail.obligationClassification === "unused-alternative") {
    classes.add("unused-alternative");
  } else {
    if (detail.requirement === "configuration") classes.add("configuration-gap");
    if (detail.requirement === "required") classes.add("required-gap");
  }
  return classes;
}

function announce(message) {
  elements.liveStatus.textContent = "";
  requestAnimationFrame(() => {
    elements.liveStatus.textContent = message;
  });
}

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function requestJson(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const GENERATION_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function assertConsumerPayloadIntegrity(graph, analysis) {
  const graphDigest = graph?.generationDigest;
  const analysisDigest = analysis?.generationDigest;
  if (typeof graphDigest !== "string" || !GENERATION_DIGEST_PATTERN.test(graphDigest)) {
    throw new Error("Graph generation digest is absent or malformed; refusing to render.");
  }
  if (typeof analysisDigest !== "string" || !GENERATION_DIGEST_PATTERN.test(analysisDigest)) {
    throw new Error("Standalone orphan-analysis generation digest is absent or malformed; refusing to render.");
  }
  if (graphDigest !== analysisDigest) {
    throw new Error("Generation digest mismatch: graph and standalone orphan analysis come from different generations; refusing to render.");
  }

  if (graph?.documentKind !== "typed-capability-compatibility-hypergraph") {
    throw new Error("Unexpected graph document kind.");
  }
  if (!Array.isArray(graph.artifactTypes) || !Array.isArray(graph.mechanisms)) {
    throw new Error("Graph artifact and mechanism collections are malformed.");
  }
  if (!analysis?.counts || typeof analysis.counts !== "object") {
    throw new Error("Standalone orphan-analysis counts are absent or malformed.");
  }
  if (graph.analysis?.generationDigest !== graphDigest) {
    throw new Error("Embedded graph-analysis generation identity disagrees with the graph digest.");
  }
  if (
    graph.analysis?.generator?.name !== analysis.generator?.name
    || graph.analysis?.generator?.version !== analysis.generator?.version
    || graph.analysis?.generatedAt !== analysis.generatedAt
  ) {
    throw new Error("Embedded and standalone orphan-analysis identities disagree.");
  }
  if (graph.schemaVersion !== "1.3.0" || analysis.generator?.version !== "1.5.0") {
    throw new Error("The web consumer requires capability graph schema 1.3.0 and generator 1.5.0.");
  }

  const expectedCounts = {
    artifactTypes: graph.artifactTypes.length,
    mechanisms: graph.mechanisms.length,
    inputPorts: graph.mechanisms.reduce((count, mechanism) => count + mechanism.inputPorts.length, 0),
    outputPorts: graph.mechanisms.reduce((count, mechanism) => count + mechanism.outputPorts.length, 0),
  };
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (analysis.counts[name] !== expected || graph.analysis?.counts?.[name] !== expected) {
      throw new Error(`Generated graph and orphan-analysis ${name} counts disagree.`);
    }
  }
  const focus = analysis.productFocus;
  const focusLists = [
    "primaryMechanismIds",
    "primaryArtifactIds",
    "primaryIncidences",
    "inspectorInputPorts",
    "secondaryOverlayMechanismIds",
    "secondaryOverlayArtifactIds",
    "materializerGaps",
    "openInputContracts",
    "openAlternativeContracts",
    "openOutputContracts",
  ];
  if (
    !focus
    || focusLists.some((name) => !Array.isArray(focus[name]))
    || !focus.connectivityCounts
    || focus.openContractSemantics?.semantics !== "candidate-connectivity-observation"
  ) {
    throw new Error("Generated product-focus metadata is absent or malformed.");
  }
}

function graphIncidences(graph) {
  const incidences = new Map();
  for (const mechanism of graph.mechanisms) {
    for (const [direction, ports] of [["input", mechanism.inputPorts], ["output", mechanism.outputPorts]]) {
      for (const port of ports) {
        const reference = { mechanismId: mechanism.id, direction, portId: port.id };
        incidences.set(referenceKey(reference), {
          id: referenceKey(reference),
          mechanismId: mechanism.id,
          artifactId: port.artifactTypeId,
          direction,
          portId: port.id,
        });
      }
    }
  }
  return incidences;
}

export function buildProductProjection(graph, analysis, includeOverlay = false) {
  const focus = analysis.productFocus;
  const allIncidences = graphIncidences(graph);
  const primaryMechanismIds = new Set(focus.primaryMechanismIds);
  const primaryArtifactIds = new Set(focus.primaryArtifactIds);
  const primaryIncidenceIds = new Set(focus.primaryIncidences.map(referenceKey));

  for (const id of primaryIncidenceIds) {
    const incidence = allIncidences.get(id);
    if (
      !incidence
      || !primaryMechanismIds.has(incidence.mechanismId)
      || !primaryArtifactIds.has(incidence.artifactId)
    ) {
      throw new Error(`Generated primary product incidence does not resolve inside its declared focus sets: ${id}`);
    }
  }

  const mechanismIds = new Set(primaryMechanismIds);
  const artifactIds = new Set(primaryArtifactIds);
  const incidenceIds = new Set(primaryIncidenceIds);
  const overlayMechanismIds = new Set();
  const overlayArtifactIds = new Set();
  const overlayIncidenceIds = new Set();
  if (includeOverlay) {
    for (const id of focus.secondaryOverlayMechanismIds) {
      mechanismIds.add(id);
      overlayMechanismIds.add(id);
    }
    for (const id of focus.secondaryOverlayArtifactIds) {
      artifactIds.add(id);
      overlayArtifactIds.add(id);
    }
    for (const incidence of allIncidences.values()) {
      const oneHopFromOverlayMechanism = overlayMechanismIds.has(incidence.mechanismId)
        && artifactIds.has(incidence.artifactId);
      const oneHopFromOverlayArtifact = overlayArtifactIds.has(incidence.artifactId)
        && mechanismIds.has(incidence.mechanismId);
      if (!oneHopFromOverlayMechanism && !oneHopFromOverlayArtifact) continue;
      incidenceIds.add(incidence.id);
      overlayIncidenceIds.add(incidence.id);
    }
  }

  return {
    mechanismIds,
    artifactIds,
    incidenceIds,
    primaryIncidenceIds,
    overlayMechanismIds,
    overlayArtifactIds,
    overlayIncidenceIds,
  };
}

export function buildCompactProductProjection(graph, analysis) {
  const fullProjection = buildProductProjection(graph, analysis);
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const incidenceById = graphIncidences(graph);
  const directionsByArtifactId = new Map();
  for (const id of fullProjection.primaryIncidenceIds) {
    const incidence = incidenceById.get(id);
    if (!incidence) continue;
    if (!directionsByArtifactId.has(incidence.artifactId)) {
      directionsByArtifactId.set(incidence.artifactId, new Set());
    }
    directionsByArtifactId.get(incidence.artifactId).add(incidence.direction);
  }

  const sharedArtifactIds = new Set([...fullProjection.artifactIds].filter((id) => {
    const directions = directionsByArtifactId.get(id);
    return directions?.has("input") && directions.has("output");
  }));
  const boundaryArtifactIds = new Set([...fullProjection.artifactIds].filter((id) =>
    artifactById.get(id)?.boundaryClassification === "expected-external"));
  const materializerArtifactIds = new Set(analysis.productFocus.materializerGaps
    .map((observation) => observation.artifactTypeId)
    .filter((id) => fullProjection.artifactIds.has(id)));
  const artifactIds = new Set([
    ...sharedArtifactIds,
    ...boundaryArtifactIds,
    ...materializerArtifactIds,
  ]);
  const incidenceIds = new Set([...fullProjection.primaryIncidenceIds].filter((id) =>
    artifactIds.has(incidenceById.get(id)?.artifactId)));

  return {
    ...fullProjection,
    artifactIds,
    incidenceIds,
    sharedArtifactIds,
    boundaryArtifactIds,
    materializerArtifactIds,
  };
}

export function groupMechanismInputPorts(mechanism, artifactById) {
  const groups = {
    productInputs: [],
    configurationAndControls: [],
    evaluationAndCustody: [],
  };
  for (const port of mechanism.inputPorts) {
    if (port.inputClass === "configuration" || port.inputClass === "control") {
      groups.configurationAndControls.push(port);
    } else if (artifactById.get(port.artifactTypeId)?.productFocus === "product-flow") {
      groups.productInputs.push(port);
    } else {
      groups.evaluationAndCustody.push(port);
    }
  }
  return groups;
}

export function buildOpenContractGroups(graph, analysis) {
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const mechanismById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const focus = analysis.productFocus;
  const inputRow = (contract) => ({
    targetKey: nodeKey("artifact", contract.artifactTypeId),
    label: artifactById.get(contract.artifactTypeId)?.label ?? contract.artifactTypeId,
    detail: `${contract.consumerPort.mechanismId}:${contract.consumerPort.portId}`,
  });
  const alternativeRow = (contract) => ({
    targetKey: nodeKey("mechanism", contract.mechanismId),
    label: `${mechanismById.get(contract.mechanismId)?.title ?? contract.mechanismId}: ${contract.alternativeGroupId}`,
    detail: contract.artifactTypeIds
      .map((id) => artifactById.get(id)?.label ?? id)
      .join(" / "),
  });
  const outputRow = (contract) => ({
    targetKey: nodeKey("artifact", contract.artifactTypeId),
    label: artifactById.get(contract.artifactTypeId)?.label ?? contract.artifactTypeId,
    detail: contract.producerPorts.map((port) => `${port.mechanismId}:${port.portId}`).join(", "),
  });
  return [
    {
      id: "input",
      label: "Open input contracts",
      rows: focus.openInputContracts.map(inputRow),
    },
    {
      id: "alternative",
      label: "Open alternative contracts",
      rows: focus.openAlternativeContracts.map(alternativeRow),
    },
    {
      id: "output",
      label: "Open output contracts",
      rows: focus.openOutputContracts.map(outputRow),
    },
  ];
}

function buildModel(graph, analysis) {
  const groups = graph.capabilityGroups;
  const axes = [...groups.axis.positions].sort((left, right) => left.order - right.order);
  const lanes = groups.lanes;
  const axisIndexById = new Map(axes.map((axis, index) => [axis.id, index]));
  const laneIndexById = new Map(lanes.map((lane, index) => [lane.id, index]));
  const capabilityById = new Map(groups.capabilities.map((capability) => [capability.id, capability]));
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const mechanismById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const neverProvidedById = new Map(
    analysis.orphans.neverProvidedInputTypes.map((entry) => [entry.artifactTypeId, entry]),
  );
  const neverUsedById = new Map(
    analysis.orphans.neverUsedOutputTypes.map((entry) => [entry.artifactTypeId, entry]),
  );
  const inputDetailByReference = new Map();
  const outputDetailByReference = new Map();
  for (const entry of analysis.orphans.neverProvidedInputTypes) {
    for (const detail of entry.consumerPortDetails) {
      inputDetailByReference.set(referenceKey(detail.port), {
        entry,
        detail,
        classes: inputDetailClasses(entry, detail),
      });
    }
  }
  for (const entry of analysis.orphans.neverUsedOutputTypes) {
    for (const detail of entry.producerPortDetails) {
      outputDetailByReference.set(referenceKey(detail.port), {
        entry,
        detail,
        classes: new Set([detail.disposition]),
      });
    }
  }
  const portByReference = new Map();
  const nodes = [];
  const nodeByKey = new Map();
  const artifactNodeById = new Map();
  const mechanismNodeById = new Map();

  for (const artifact of graph.artifactTypes) {
    const size = NODE_SIZE.artifact;
    const node = {
      key: nodeKey("artifact", artifact.id),
      id: artifact.id,
      kind: "artifact",
      label: artifact.label,
      description: artifact.description,
      plane: artifact.plane,
      axisIndex: axisIndexById.get(artifact.axisPositionId) ?? 0,
      laneIndex: laneIndexById.get(artifact.laneId) ?? 0,
      width: size.width,
      height: size.height,
      record: artifact,
      incidentEdges: [],
      orphanClasses: new Set(),
      searchText: `${artifact.id} ${artifact.label} ${artifact.description}`.toLowerCase(),
      x: 0,
      y: 0,
    };
    nodes.push(node);
    nodeByKey.set(node.key, node);
    artifactNodeById.set(artifact.id, node);
  }

  for (const mechanism of graph.mechanisms) {
    const primaryCapability = capabilityById.get(mechanism.primaryCapabilityId);
    if (!primaryCapability) {
      throw new Error(`${mechanism.id}: unknown primaryCapabilityId ${mechanism.primaryCapabilityId}`);
    }
    const size = NODE_SIZE.mechanism;
    const node = {
      key: nodeKey("mechanism", mechanism.id),
      id: mechanism.id,
      kind: "mechanism",
      label: mechanism.title,
      description: mechanism.censusStatus.statusText,
      plane: null,
      axisIndex: axisIndexById.get(primaryCapability.axisPositionId) ?? 0,
      laneIndex: laneIndexById.get(primaryCapability.laneId) ?? 0,
      width: size.width,
      height: size.height,
      record: mechanism,
      incidentEdges: [],
      orphanClasses: new Set(),
      searchText: `${mechanism.id} ${mechanism.title} ${mechanism.censusStatus.statusText}`.toLowerCase(),
      x: 0,
      y: 0,
    };
    nodes.push(node);
    nodeByKey.set(node.key, node);
    mechanismNodeById.set(mechanism.id, node);
  }

  const edges = [];
  for (const mechanism of graph.mechanisms) {
    const mechanismNode = mechanismNodeById.get(mechanism.id);
    for (const [direction, ports] of [["input", mechanism.inputPorts], ["output", mechanism.outputPorts]]) {
      for (const port of ports) {
        const artifactNode = artifactNodeById.get(port.artifactTypeId);
        if (!artifactNode || !mechanismNode) continue;
        const id = `${mechanism.id}:${direction}:${port.id}`;
        const generatedDetail = direction === "input"
          ? inputDetailByReference.get(id)
          : outputDetailByReference.get(id);
        const source = direction === "input" ? artifactNode : mechanismNode;
        const target = direction === "input" ? mechanismNode : artifactNode;
        const edge = {
          id,
          direction,
          mechanismId: mechanism.id,
          artifactId: port.artifactTypeId,
          portId: port.id,
          port,
          generatedDetail,
          missingClasses: generatedDetail?.classes ?? new Set(),
          source,
          target,
          points: [],
          bounds: null,
          backward: false,
        };
        edges.push(edge);
        artifactNode.incidentEdges.push(edge);
        mechanismNode.incidentEdges.push(edge);
        portByReference.set(`${mechanism.id}:${direction}:${port.id}`, port);
      }
    }
  }

  for (const node of nodes) {
    node.incidentEdges.sort((left, right) => left.id.localeCompare(right.id));
  }

  for (const [artifactId, entry] of neverProvidedById) {
    const node = artifactNodeById.get(artifactId);
    if (!node) continue;
    for (const detail of entry.consumerPortDetails) {
      const generated = inputDetailByReference.get(referenceKey(detail.port));
      for (const classification of generated?.classes ?? []) node.orphanClasses.add(classification);
    }
  }

  for (const [artifactId, entry] of neverUsedById) {
    const node = artifactNodeById.get(artifactId);
    if (!node) continue;
    for (const detail of entry.producerPortDetails) node.orphanClasses.add(detail.disposition);
  }

  const adjacency = new Map(nodes.map((node) => [node.key, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source.key).add(edge.target.key);
    adjacency.get(edge.target.key).add(edge.source.key);
  }

  const rightNode = artifactNodeById.get(RIGHT_ANCHOR_ID);
  const goalProducerCount = rightNode?.incidentEdges.filter((edge) => edge.direction === "output").length ?? 0;
  const goalConsumerCount = rightNode?.incidentEdges.filter((edge) => edge.direction === "input").length ?? 0;
  const productProjection = buildProductProjection(graph, analysis, false);
  const compactProductProjection = buildCompactProductProjection(graph, analysis);
  const productOverlayProjection = buildProductProjection(graph, analysis, true);
  const productConnectivity = analysis.productFocus;
  const materializerGapArtifactIds = new Set(
    productConnectivity.materializerGaps.map((observation) => observation.artifactTypeId),
  );
  const openContractArtifactIds = new Set([
    ...productConnectivity.openInputContracts.map((contract) => contract.artifactTypeId),
    ...productConnectivity.openAlternativeContracts.flatMap((contract) => contract.artifactTypeIds),
    ...productConnectivity.openOutputContracts.map((contract) => contract.artifactTypeId),
  ]);
  const openContractEdgeIds = new Set([
    ...productConnectivity.openInputContracts.map((contract) => referenceKey(contract.consumerPort)),
    ...productConnectivity.openAlternativeContracts.flatMap((contract) => contract.memberPorts.map(referenceKey)),
    ...productConnectivity.openOutputContracts.flatMap((contract) => contract.producerPorts.map(referenceKey)),
  ]);
  const openContractTypeByReference = new Map();
  for (const contract of productConnectivity.openInputContracts) {
    openContractTypeByReference.set(referenceKey(contract.consumerPort), "input");
  }
  for (const contract of productConnectivity.openAlternativeContracts) {
    for (const port of contract.memberPorts) openContractTypeByReference.set(referenceKey(port), "alternative");
  }
  for (const contract of productConnectivity.openOutputContracts) {
    for (const port of contract.producerPorts) openContractTypeByReference.set(referenceKey(port), "output");
  }
  const candidateClosure = declarationCandidateClosure({
    artifacts: graph.artifactTypes,
    mechanisms: graph.mechanisms,
    neverProvidedById,
    mechanismNodeById,
  });

  return {
    axes,
    lanes,
    capabilityById,
    artifactById,
    mechanismById,
    neverProvidedById,
    neverUsedById,
    inputDetailByReference,
    outputDetailByReference,
    portByReference,
    nodes,
    edges,
    nodeByKey,
    artifactNodeById,
    mechanismNodeById,
    adjacency,
    candidateClosure,
    productProjection,
    compactProductProjection,
    productOverlayProjection,
    materializerGapArtifactIds,
    openContractArtifactIds,
    openContractEdgeIds,
    openContractTypeByReference,
    goalProducerCount,
    goalConsumerCount,
  };
}

function missingClosureObligations(mechanism, availableArtifactIds) {
  const directPorts = mechanism.inputPorts.filter((port) =>
    !port.alternativeGroupId
    && (port.requirement === "required" || port.requirement === "configuration")
    && !availableArtifactIds.has(port.artifactTypeId));
  const alternativeGroups = mechanism.alternativeGroups.map((group) => {
    const memberPorts = mechanism.inputPorts.filter((port) => port.alternativeGroupId === group.id);
    return memberPorts.some((port) => availableArtifactIds.has(port.artifactTypeId))
      ? null
      : { group, memberPorts };
  }).filter(Boolean);
  return { directPorts, alternativeGroups };
}

function declarationCandidateClosure({
  artifacts,
  mechanisms,
  neverProvidedById,
  mechanismNodeById,
}) {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const rootArtifactIds = new Set([LEFT_ANCHOR_ID]);
  for (const [artifactId, entry] of neverProvidedById) {
    const artifact = artifactById.get(artifactId);
    if (
      entry.disposition === "expected-external-root"
      && artifact?.boundaryClassification === "expected-external"
      && (artifact?.plane === "runtime" || artifact?.plane === "governance")
    ) rootArtifactIds.add(artifactId);
  }

  const permittedMechanisms = mechanisms.filter((mechanism) =>
    mechanism.censusStatus.runtimeAdmissibilities.includes("permitted"));
  const availableArtifactIds = new Set(rootArtifactIds);
  const reachedMechanismIds = new Set();
  let rounds = 0;
  for (;;) {
    const newlyReached = permittedMechanisms.filter((mechanism) => {
      if (reachedMechanismIds.has(mechanism.id)) return false;
      const missing = missingClosureObligations(mechanism, availableArtifactIds);
      return missing.directPorts.length === 0 && missing.alternativeGroups.length === 0;
    });
    if (!newlyReached.length) break;
    rounds += 1;
    for (const mechanism of newlyReached) {
      reachedMechanismIds.add(mechanism.id);
      for (const port of mechanism.outputPorts) availableArtifactIds.add(port.artifactTypeId);
    }
  }

  if (availableArtifactIds.has(RIGHT_ANCHOR_ID)) {
    throw new Error("The producerless product goal must remain outside candidate closure.");
  }

  const frontierDetailsByMechanismId = new Map();
  for (const mechanism of permittedMechanisms) {
    if (reachedMechanismIds.has(mechanism.id)) continue;
    const availableNaturalPorts = mechanism.inputPorts.filter((port) =>
      port.inputClass === "natural" && availableArtifactIds.has(port.artifactTypeId));
    const missing = missingClosureObligations(mechanism, availableArtifactIds);
    if (
      availableNaturalPorts.length
      && (missing.directPorts.length || missing.alternativeGroups.length)
    ) {
      frontierDetailsByMechanismId.set(mechanism.id, { availableNaturalPorts, ...missing });
    }
  }

  const reachedMechanismKeys = new Set([...reachedMechanismIds]
    .map((id) => nodeKey("mechanism", id)));
  const frontierMechanismKeys = new Set([...frontierDetailsByMechanismId.keys()]
    .map((id) => nodeKey("mechanism", id)));
  const reachedEdgeIds = new Set();
  const frontierEdgeIds = new Set();
  const frontierAvailableEdgeIds = new Set();
  const frontierMissingEdgeIds = new Set();
  const visibleKeys = new Set([...rootArtifactIds].map((id) => nodeKey("artifact", id)));

  for (const mechanismId of reachedMechanismIds) {
    const mechanismNode = mechanismNodeById.get(mechanismId);
    visibleKeys.add(mechanismNode.key);
    for (const edge of mechanismNode.incidentEdges) {
      reachedEdgeIds.add(edge.id);
      visibleKeys.add(edge.source.key);
      visibleKeys.add(edge.target.key);
    }
  }

  for (const [mechanismId, details] of frontierDetailsByMechanismId) {
    const mechanismNode = mechanismNodeById.get(mechanismId);
    visibleKeys.add(mechanismNode.key);
    const availablePortIds = new Set(details.availableNaturalPorts.map((port) => port.id));
    const missingPortIds = new Set([
      ...details.directPorts.map((port) => port.id),
      ...details.alternativeGroups.flatMap(({ memberPorts }) => memberPorts.map((port) => port.id)),
    ]);
    for (const edge of mechanismNode.incidentEdges) {
      if (edge.direction !== "input") continue;
      if (availablePortIds.has(edge.portId)) frontierAvailableEdgeIds.add(edge.id);
      else if (missingPortIds.has(edge.portId)) frontierMissingEdgeIds.add(edge.id);
      else continue;
      frontierEdgeIds.add(edge.id);
      visibleKeys.add(edge.source.key);
      visibleKeys.add(edge.target.key);
    }
  }

  visibleKeys.add(nodeKey("artifact", RIGHT_ANCHOR_ID));
  const edgeIds = new Set([...reachedEdgeIds, ...frontierEdgeIds]);
  const conditionalMechanismKeys = new Set(permittedMechanisms
    .filter((mechanism) => mechanism.censusStatus.runtimeAdmissibilities.length > 1)
    .map((mechanism) => nodeKey("mechanism", mechanism.id)));
  return {
    rootArtifactIds,
    availableArtifactIds,
    reachedMechanismIds,
    reachedMechanismKeys,
    frontierMechanismKeys,
    frontierDetailsByMechanismId,
    reachedEdgeIds,
    frontierEdgeIds,
    frontierAvailableEdgeIds,
    frontierMissingEdgeIds,
    conditionalMechanismKeys,
    visibleKeys,
    edgeIds,
    rounds,
  };
}

function layoutGraph(model) {
  const rowsPerLane = 13;
  const rowGap = 43;
  const columnGap = 205;
  const laneHeight = 660;
  const laneTop = 96;
  const buckets = Array.from({ length: model.axes.length }, () =>
    Array.from({ length: model.lanes.length }, () => []));

  for (const node of model.nodes) {
    if (node.id === LEFT_ANCHOR_ID || node.id === RIGHT_ANCHOR_ID) continue;
    buckets[node.axisIndex][node.laneIndex].push(node);
  }
  for (const rank of buckets) {
    for (const bucket of rank) {
      bucket.sort((left, right) => {
        const kindDifference = left.kind.localeCompare(right.kind);
        return kindDifference || left.id.localeCompare(right.id);
      });
    }
  }

  const ranks = [];
  let cursorX = 34;
  for (let axisIndex = 0; axisIndex < model.axes.length; axisIndex += 1) {
    const maxColumns = Math.max(
      1,
      ...buckets[axisIndex].map((bucket) => Math.ceil(bucket.length / rowsPerLane)),
    );
    const width = Math.max(520, maxColumns * columnGap + 215);
    ranks.push({ start: cursorX, end: cursorX + width, width });
    cursorX += width;
  }

  for (let axisIndex = 0; axisIndex < model.axes.length; axisIndex += 1) {
    for (let laneIndex = 0; laneIndex < model.lanes.length; laneIndex += 1) {
      const bucket = buckets[axisIndex][laneIndex];
      bucket.forEach((node, index) => {
        const column = Math.floor(index / rowsPerLane);
        const row = index % rowsPerLane;
        node.x = ranks[axisIndex].start + 145 + column * columnGap;
        node.y = laneTop + laneIndex * laneHeight + 80 + row * rowGap;
      });
    }
  }

  const width = cursorX + 36;
  const height = laneTop + model.lanes.length * laneHeight + 34;
  const leftAnchor = model.artifactNodeById.get(LEFT_ANCHOR_ID);
  const rightAnchor = model.artifactNodeById.get(RIGHT_ANCHOR_ID);
  if (leftAnchor) {
    leftAnchor.x = 96;
    leftAnchor.y = laneTop + leftAnchor.laneIndex * laneHeight + 32;
  }
  if (rightAnchor) {
    rightAnchor.x = width - 96;
    rightAnchor.y = laneTop + rightAnchor.laneIndex * laneHeight + 32;
  }

  for (const edge of model.edges) {
    edge.points = edgeRoute(edge);
    edge.backward = edge.target.x < edge.source.x;
    const xs = edge.points.map((point) => point.x);
    const ys = edge.points.map((point) => point.y);
    edge.bounds = {
      left: Math.min(...xs) - 6,
      right: Math.max(...xs) + 6,
      top: Math.min(...ys) - 6,
      bottom: Math.max(...ys) + 6,
    };
  }

  const laneBands = model.lanes.map((lane, index) => ({
    ...lane,
    top: laneTop + index * laneHeight,
    height: laneHeight,
  }));
  return { width, height, ranks, laneTop, laneHeight, laneBands, rowsPerLane };
}

function productLaneIndex(model, node, projection) {
  if (projection.overlayMechanismIds.has(node.id)) {
    return node.record.focusClass === "evaluation-probe" ? 4 : 5;
  }
  if (projection.overlayArtifactIds.has(node.id)) {
    return node.record.laneId === "lane.review-and-evidence"
      || node.record.laneId === "lane.configuration-and-governance"
      ? 5
      : 4;
  }
  const registryLaneId = node.kind === "artifact"
    ? node.record.laneId
    : model.lanes[node.laneIndex]?.id;
  const index = PRODUCT_LANE_DEFINITIONS.findIndex((lane) =>
    lane.registryLaneIds.includes(registryLaneId));
  if (index < 0) throw new Error(`${node.id}: generated lane ${registryLaneId} is not mapped into the product canvas.`);
  return index;
}

function layoutProductGraph(model, visibleKeys, visibleEdgeIds, includeOverlay) {
  const projection = includeOverlay ? model.productOverlayProjection : model.productProjection;
  const lanes = includeOverlay
    ? [...PRODUCT_LANE_DEFINITIONS, ...OVERLAY_LANE_DEFINITIONS]
    : PRODUCT_LANE_DEFINITIONS;
  const rowsByLane = lanes.map((lane) => lane.overlay ? 5 : 12);
  const laneBands = [];
  let laneCursor = 78;
  for (const lane of lanes) {
    const height = lane.overlay ? 238 : 520;
    laneBands.push({ ...lane, top: laneCursor, height });
    laneCursor += height;
  }

  const buckets = Array.from({ length: model.axes.length }, () =>
    Array.from({ length: lanes.length }, () => []));
  const capacityBuckets = Array.from({ length: model.axes.length }, () =>
    Array.from({ length: PRODUCT_LANE_DEFINITIONS.length + OVERLAY_LANE_DEFINITIONS.length }, () => 0));
  const capacityProjection = model.productOverlayProjection;
  for (const id of capacityProjection.artifactIds) {
    const node = model.artifactNodeById.get(id);
    const laneIndex = productLaneIndex(model, node, capacityProjection);
    capacityBuckets[node.axisIndex][laneIndex] += 1;
  }
  for (const id of capacityProjection.mechanismIds) {
    const node = model.mechanismNodeById.get(id);
    const laneIndex = productLaneIndex(model, node, capacityProjection);
    capacityBuckets[node.axisIndex][laneIndex] += 1;
  }

  for (const key of visibleKeys) {
    const node = model.nodeByKey.get(key);
    if (!node || node.id === LEFT_ANCHOR_ID || node.id === RIGHT_ANCHOR_ID) continue;
    const laneIndex = productLaneIndex(model, node, projection);
    node.displayLaneIndex = laneIndex;
    buckets[node.axisIndex][laneIndex].push(node);
  }
  for (const rank of buckets) {
    for (const bucket of rank) {
      bucket.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
    }
  }

  const ranks = [];
  let cursorX = 26;
  for (let axisIndex = 0; axisIndex < model.axes.length; axisIndex += 1) {
    const maxColumns = Math.max(
      1,
      ...capacityBuckets[axisIndex].map((count, laneIndex) =>
        Math.ceil(count / (rowsByLane[laneIndex] ?? 5))),
    );
    const width = Math.max(430, maxColumns * 190 + 210);
    ranks.push({ start: cursorX, end: cursorX + width, width });
    cursorX += width;
  }

  for (let axisIndex = 0; axisIndex < model.axes.length; axisIndex += 1) {
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      const rows = rowsByLane[laneIndex];
      buckets[axisIndex][laneIndex].forEach((node, index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        node.x = ranks[axisIndex].start + 120 + column * 190;
        node.y = laneBands[laneIndex].top + 48 + row * (lanes[laneIndex].overlay ? 36 : 39);
      });
    }
  }

  const width = cursorX + 28;
  const height = laneCursor + 24;
  const leftAnchor = model.artifactNodeById.get(LEFT_ANCHOR_ID);
  const rightAnchor = model.artifactNodeById.get(RIGHT_ANCHOR_ID);
  if (leftAnchor) {
    leftAnchor.displayLaneIndex = 0;
    leftAnchor.x = 92;
    leftAnchor.y = laneBands[0].top + 28;
  }
  if (rightAnchor) {
    rightAnchor.displayLaneIndex = 2;
    rightAnchor.x = width - 92;
    rightAnchor.y = laneBands[2].top + 28;
  }

  for (const edge of model.edges) {
    if (!visibleEdgeIds.has(edge.id)) continue;
    edge.points = edgeRoute(edge);
    edge.backward = edge.target.x < edge.source.x;
    const xs = edge.points.map((point) => point.x);
    const ys = edge.points.map((point) => point.y);
    edge.bounds = {
      left: Math.min(...xs) - 6,
      right: Math.max(...xs) + 6,
      top: Math.min(...ys) - 6,
      bottom: Math.max(...ys) + 6,
    };
  }
  return {
    width,
    height,
    ranks,
    laneTop: laneBands[0].top,
    laneHeight: 0,
    laneBands,
    rowsPerLane: 12,
  };
}

function edgeRoute(edge) {
  const source = edge.source;
  const target = edge.target;
  const sourceIndex = source.incidentEdges.indexOf(edge);
  const targetIndex = target.incidentEdges.indexOf(edge);
  const sourcePortY = source.y - source.height / 2
    + ((sourceIndex + 1) * source.height) / (source.incidentEdges.length + 1);
  const targetPortY = target.y - target.height / 2
    + ((targetIndex + 1) * target.height) / (target.incidentEdges.length + 1);
  const goesRight = target.x >= source.x;
  const sourceX = source.x + (goesRight ? source.width / 2 : -source.width / 2);
  const targetX = target.x + (goesRight ? -target.width / 2 : target.width / 2);
  const spread = (stableHash(edge.id) % 9) - 4;
  let railX = (sourceX + targetX) / 2 + spread * 3;
  if (Math.abs(targetX - sourceX) < 42) {
    railX = Math.min(sourceX, targetX) - 30 - (stableHash(edge.id) % 5) * 8;
  }
  return [
    { x: sourceX, y: sourcePortY },
    { x: railX, y: sourcePortY },
    { x: railX, y: targetPortY },
    { x: targetX, y: targetPortY },
  ];
}

function populateControls(model) {
  for (const capability of [...model.capabilityById.values()].sort((left, right) => left.label.localeCompare(right.label))) {
    const option = document.createElement("option");
    option.value = capability.id;
    option.textContent = capability.label;
    elements.capabilityFilter.append(option);
  }

  const categories = [...new Set(state.graph.artifactTypes.map((artifact) => artifact.category))].sort();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.append(option);
  }

  for (const plane of ["runtime", "development", "governance"]) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${plane}" checked><span>${plane}</span>`;
    elements.planeFilters.append(label);
  }
}

function modeKeys(model) {
  const keys = new Set();
  if (state.mode === "full") return new Set(model.nodes.map((node) => node.key));

  if (state.mode === "orphans") {
    for (const artifactId of [...model.neverProvidedById.keys(), ...model.neverUsedById.keys()]) {
      const node = model.artifactNodeById.get(artifactId);
      if (!node) continue;
      keys.add(node.key);
      for (const neighbor of model.adjacency.get(node.key) ?? []) keys.add(neighbor);
    }
    return keys;
  }

  if (state.mode === "diagnostics") {
    const diagnosticLanes = new Set([
      "lane.development-diagnostics",
      "lane.models-and-external",
      "lane.review-and-evidence",
    ]);
    for (const node of model.nodes) {
      if (node.kind === "artifact") {
        if (node.record.plane === "development" || diagnosticLanes.has(node.record.laneId)) keys.add(node.key);
      } else {
        const capabilityMatch = node.record.capabilityIds.some((id) =>
          diagnosticLanes.has(model.capabilityById.get(id)?.laneId));
        const statusMatch = node.record.censusStatus.authorizationTokens.some((token) =>
          token === "diagnostic-only" || token === "prohibited");
        if (capabilityMatch || statusMatch) keys.add(node.key);
      }
    }
    for (const key of [...keys]) {
      const node = model.nodeByKey.get(key);
      if (node?.kind === "mechanism") {
        for (const neighbor of model.adjacency.get(key) ?? []) keys.add(neighbor);
      }
    }
    return keys;
  }

  for (const node of model.nodes) {
    if (node.kind !== "mechanism" || !node.record.censusStatus.runtimeAdmissibilities.includes("permitted")) continue;
    keys.add(node.key);
    for (const neighbor of model.adjacency.get(node.key) ?? []) keys.add(neighbor);
  }
  return keys;
}

function artifactPassesCoordinateFilters(artifactNode) {
  return state.planes.has(artifactNode.record.plane)
    && (!state.category || artifactNode.record.category === state.category);
}

function candidateClosureProjection(model, query) {
  const closure = model.candidateClosure;
  let mechanismKeys = new Set([
    ...closure.reachedMechanismKeys,
    ...closure.frontierMechanismKeys,
  ]);
  const displayEdges = (key) => model.nodeByKey.get(key).incidentEdges
    .filter((edge) => closure.edgeIds.has(edge.id));

  if (state.capability) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) =>
      model.nodeByKey.get(key).record.capabilityIds.includes(state.capability)));
  }

  const allPlanes = state.planes.size === 3;
  if (!allPlanes || state.category) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) =>
      displayEdges(key).some((edge) =>
        artifactPassesCoordinateFilters(model.artifactNodeById.get(edge.artifactId)))));
  }

  if (state.orphanClass) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) =>
      displayEdges(key).some((edge) => edge.missingClasses.has(state.orphanClass))));
  }

  if (query) {
    const matches = new Set(state.searchMatches);
    mechanismKeys = new Set([...mechanismKeys].filter((key) => {
      if (matches.has(key)) return true;
      if (!elements.searchContext.checked) return false;
      return displayEdges(key).some((edge) => matches.has(nodeKey("artifact", edge.artifactId)));
    }));
  }

  const edgeIds = new Set();
  const keys = new Set([
    nodeKey("artifact", LEFT_ANCHOR_ID),
    nodeKey("artifact", RIGHT_ANCHOR_ID),
  ]);
  const filtered = Boolean(state.capability || state.category || state.orphanClass || query || state.planes.size !== 3);
  if (!filtered) {
    for (const artifactId of closure.rootArtifactIds) keys.add(nodeKey("artifact", artifactId));
  }
  for (const key of mechanismKeys) {
    keys.add(key);
    for (const edge of displayEdges(key)) {
      edgeIds.add(edge.id);
      keys.add(edge.source.key);
      keys.add(edge.target.key);
    }
  }

  if (query) {
    for (const key of state.searchMatches) {
      const node = model.nodeByKey.get(key);
      if (node?.kind !== "artifact" || !closure.visibleKeys.has(key)) continue;
      if (!artifactPassesCoordinateFilters(node)) continue;
      if (state.orphanClass && !node.orphanClasses.has(state.orphanClass)) continue;
      keys.add(key);
    }
  }
  return { keys, edgeIds };
}

function runtimeBundleKeys(model, query) {
  let mechanismKeys = new Set(model.nodes
    .filter((node) => node.kind === "mechanism" && node.record.censusStatus.runtimeAdmissibilities.includes("permitted"))
    .map((node) => node.key));

  if (state.capability) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) =>
      model.nodeByKey.get(key).record.capabilityIds.includes(state.capability)));
  }

  const allPlanes = state.planes.size === 3;
  if (!allPlanes || state.category) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) => {
      const mechanism = model.nodeByKey.get(key);
      return mechanism.incidentEdges.some((edge) => {
        const artifact = model.artifactNodeById.get(edge.artifactId);
        return state.planes.has(artifact.record.plane)
          && (!state.category || artifact.record.category === state.category);
      });
    }));
  }

  if (state.orphanClass) {
    mechanismKeys = new Set([...mechanismKeys].filter((key) =>
      model.nodeByKey.get(key).incidentEdges.some((edge) => edge.missingClasses.has(state.orphanClass))));
  }

  const eligibleMechanismKeys = new Set(mechanismKeys);
  if (query) {
    const matches = new Set(state.searchMatches);
    mechanismKeys = new Set([...mechanismKeys].filter((key) => {
      if (matches.has(key)) return true;
      if (!elements.searchContext.checked) return false;
      return model.nodeByKey.get(key).incidentEdges.some((edge) =>
        matches.has(nodeKey("artifact", edge.artifactId)));
    }));
  }

  const keys = new Set(mechanismKeys);
  for (const key of mechanismKeys) {
    for (const neighbor of model.adjacency.get(key) ?? []) keys.add(neighbor);
  }
  if (query && !elements.searchContext.checked) {
    for (const key of state.searchMatches) {
      const node = model.nodeByKey.get(key);
      if (node?.kind === "artifact" && [...model.adjacency.get(key)].some((neighbor) => eligibleMechanismKeys.has(neighbor))) {
        keys.add(key);
      }
    }
  }
  return keys;
}

function currentProductProjection(model) {
  if (state.productOverlay) return model.productOverlayProjection;
  if (state.showAllProductContracts) return model.productProjection;
  return model.compactProductProjection;
}

function updateProjection({ fit = true } = {}) {
  const model = state.model;
  const productMode = state.mode === "product";
  const query = productMode ? "" : elements.searchInput.value.trim().toLowerCase();
  state.searchMatches = query
    ? model.nodes.filter((node) => node.searchText.includes(query)).map((node) => node.key)
    : [];
  state.searchCursor = Math.min(state.searchCursor, state.searchMatches.length - 1);

  let constrainedEdgeIds = null;
  let keys;
  if (productMode) {
    const projection = currentProductProjection(model);
    keys = new Set([
      ...projection.artifactIds].map((id) => nodeKey("artifact", id)),
    );
    for (const id of projection.mechanismIds) keys.add(nodeKey("mechanism", id));
    constrainedEdgeIds = projection.incidenceIds;
  } else if (state.mode === "runtime") {
    keys = runtimeBundleKeys(model, query);
  } else if (state.mode === "frontiers") {
    const projection = candidateClosureProjection(model, query);
    keys = projection.keys;
    constrainedEdgeIds = projection.edgeIds;
  } else {
    keys = modeKeys(model);
  }
  const bundleMode = productMode || state.mode === "runtime" || state.mode === "frontiers";

  if (!bundleMode && state.capability) {
    const capabilityContext = new Set();
    for (const node of model.nodes) {
      if (node.kind !== "mechanism" || !node.record.capabilityIds.includes(state.capability)) continue;
      capabilityContext.add(node.key);
      for (const neighbor of model.adjacency.get(node.key) ?? []) capabilityContext.add(neighbor);
    }
    keys = setIntersection(keys, capabilityContext);
  }

  if (!bundleMode) {
    for (const key of [...keys]) {
      const node = model.nodeByKey.get(key);
      if (node.kind !== "artifact") continue;
      if (!state.planes.has(node.record.plane) || (state.category && node.record.category !== state.category)) {
        keys.delete(key);
      }
    }
  }

  let orphanEdgeIds = null;
  if (!bundleMode && state.orphanClass) {
    const matchingEdges = model.edges.filter((edge) => edge.missingClasses.has(state.orphanClass));
    orphanEdgeIds = new Set(matchingEdges.map((edge) => edge.id));
    const orphanContext = new Set();
    for (const edge of matchingEdges) {
      orphanContext.add(edge.source.key);
      orphanContext.add(edge.target.key);
    }
    keys = setIntersection(keys, orphanContext);
  }

  if (!bundleMode && query) {
    const searchContext = new Set(state.searchMatches);
    if (elements.searchContext.checked) {
      for (const key of state.searchMatches) {
        for (const neighbor of model.adjacency.get(key) ?? []) searchContext.add(neighbor);
      }
    }
    keys = setIntersection(keys, searchContext);
  }

  let edgeIds = new Set(model.edges
    .filter((edge) =>
      keys.has(edge.source.key)
      && keys.has(edge.target.key)
      && (!constrainedEdgeIds || constrainedEdgeIds.has(edge.id))
      && (!orphanEdgeIds || orphanEdgeIds.has(edge.id)))
    .map((edge) => edge.id));

  if (!productMode) {
    // A mechanism without a visible typed incidence carries no information in a filtered registry projection.
    for (const key of [...keys]) {
      const node = model.nodeByKey.get(key);
      const directSearchMatch = query && !elements.searchContext.checked && state.searchMatches.includes(key);
      if (node.kind === "mechanism" && !directSearchMatch && !node.incidentEdges.some((edge) => edgeIds.has(edge.id))) {
        keys.delete(key);
      }
    }
  }
  edgeIds = new Set(model.edges
    .filter((edge) =>
      keys.has(edge.source.key)
      && keys.has(edge.target.key)
      && (!constrainedEdgeIds || constrainedEdgeIds.has(edge.id))
      && (!orphanEdgeIds || orphanEdgeIds.has(edge.id)))
    .map((edge) => edge.id));

  state.visibleKeys = keys;
  state.visibleEdgeIds = edgeIds;
  state.layout = productMode
    ? layoutProductGraph(model, keys, edgeIds, state.productOverlay)
    : layoutGraph(model);
  if (state.selectedKey && !keys.has(state.selectedKey)) selectNode(null);

  const visibleMechanisms = [...keys].filter((key) => model.nodeByKey.get(key).kind === "mechanism").length;
  const visibleArtifacts = keys.size - visibleMechanisms;
  const countSegments = visibleCountSegments({
    mode: state.mode,
    productOverlay: state.productOverlay,
    showAllProductContracts: state.showAllProductContracts,
    visibleArtifacts,
    visibleMechanisms,
    visibleIncidences: edgeIds.size,
    totalProductContracts: state.analysis.productFocus.primaryArtifactIds.length,
  });
  elements.visibleCount.innerHTML = countSegments
    .map((segment) => `<span>${escapeHtml(segment)}</span>`)
    .join(" ");
  const visibleMatches = state.searchMatches.filter((key) => keys.has(key)).length;
  elements.searchCount.textContent = query
    ? `${state.searchMatches.length} matches${visibleMatches === state.searchMatches.length ? "" : ` / ${visibleMatches} visible`}`
    : "0 matches";
  const permittedMechanisms = model.nodes.filter((node) =>
    node.kind === "mechanism" && node.record.censusStatus.runtimeAdmissibilities.includes("permitted"));
  const mixedPermitted = permittedMechanisms.filter((node) => node.record.censusStatus.runtimeAdmissibilities.length > 1);
  const closure = model.candidateClosure;
  const frontierDetails = [...closure.frontierDetailsByMechanismId.values()];
  const missingDirectCount = frontierDetails.reduce((count, detail) => count + detail.directPorts.length, 0);
  const missingGroupCount = frontierDetails.reduce((count, detail) => count + detail.alternativeGroups.length, 0);
  const missingGroupPortCount = frontierDetails.reduce((count, detail) =>
    count + detail.alternativeGroups.reduce((subtotal, group) => subtotal + group.memberPorts.length, 0), 0);
  const conditionalClosureCount = [...closure.conditionalMechanismKeys].filter((key) =>
    closure.reachedMechanismKeys.has(key) || closure.frontierMechanismKeys.has(key)).length;
  const focus = state.analysis.productFocus;
  elements.modeNote.textContent = productMode
    ? state.productOverlay
      ? `${MODE_NOTES.product} Primary ${focus.primaryMechanismIds.length} mechanisms, ${focus.primaryArtifactIds.length} artifacts, and ${focus.primaryIncidences.length} incidences; overlay adds ${focus.secondaryOverlayMechanismIds.length} mechanisms, ${focus.secondaryOverlayArtifactIds.length} artifacts, and ${model.productOverlayProjection.overlayIncidenceIds.size} declared one-hop incidences.`
      : state.showAllProductContracts
        ? `${MODE_NOTES.product} Showing all ${focus.primaryArtifactIds.length} product contracts, ${focus.primaryMechanismIds.length} mechanisms, and ${focus.primaryIncidences.length} typed candidate incidences.`
        : `${MODE_NOTES.product} Compact canvas shows ${visibleArtifacts} shared, expected-external boundary, or goal contracts and all ${focus.primaryMechanismIds.length} mechanisms. All ${focus.primaryArtifactIds.length} product contracts and ${focus.primaryIncidences.length} incidences remain available under Research details.`
    : state.mode === "frontiers"
    ? `${MODE_NOTES.frontiers} ${closure.rootArtifactIds.size} seed roots yield ${closure.availableArtifactIds.size} candidate-available artifacts after ${closure.rounds} fixpoint round. ${closure.reachedMechanismKeys.size} permitted mechanisms are candidate-reached with complete bundles (${closure.reachedEdgeIds.size} incidences). Frontier: ${closure.frontierMechanismKeys.size} unreached permitted mechanisms across ${closure.frontierEdgeIds.size} displayed input incidences, with ${missingDirectCount} unresolved direct conditions and ${missingGroupCount} unresolved alternative-group conditions (${missingGroupPortCount} member ports). ${conditionalClosureCount} displayed mixed variant is labeled conditional. UI goal: ${model.goalProducerCount} producers and candidate-unreachable. Conditional value constraints and branches are disclosed but not evaluated.`
    : state.mode === "runtime"
      ? `${MODE_NOTES.runtime} Generated status contains ${permittedMechanisms.length} mechanisms with permitted and ${mixedPermitted.length} with mixed admissibility.`
      : MODE_NOTES[state.mode];
  elements.overlayControl.hidden = !productMode;
  elements.allProductContractsControl.hidden = !productMode;
  elements.productConnectivity.hidden = !productMode;
  updateModeButtons();
  updateVisibleNavigator();
  if (state.selectedKey && keys.has(state.selectedKey)) renderInspector(model.nodeByKey.get(state.selectedKey));
  announce(`${elements.modeControls.querySelector(`[data-mode="${state.mode}"]`)?.textContent ?? state.mode} projection. ${elements.visibleCount.textContent}`);
  if (fit) fitVisible();
  else requestRender();
}

function updateModeButtons() {
  for (const button of elements.modeControls.querySelectorAll("[data-mode]")) {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
}

function updateVisibleNavigator() {
  const selected = state.selectedKey;
  const visibleNodes = [...state.visibleKeys]
    .map((key) => state.model.nodeByKey.get(key))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  const fragment = document.createDocumentFragment();
  for (const node of visibleNodes) {
    const option = document.createElement("option");
    option.value = node.key;
    let kind = node.kind;
    if (state.mode === "product") {
      kind = node.kind === "mechanism"
        ? node.record.focusClass
        : node.record.productFocus;
    } else if (state.mode === "frontiers" && node.kind === "mechanism") {
      const conditional = state.model.candidateClosure.conditionalMechanismKeys.has(node.key) ? " conditional" : "";
      kind = state.model.candidateClosure.reachedMechanismKeys.has(node.key)
        ? `${conditional} candidate-reached`
        : `${conditional} frontier-unreached`;
    } else if (state.mode === "frontiers" && node.id === RIGHT_ANCHOR_ID) {
      kind = "confirmed product materializer gap";
    } else if (state.mode === "frontiers" && state.model.candidateClosure.rootArtifactIds.has(node.id)) {
      kind = "seed artifact";
    }
    option.textContent = `[${kind.trim()}] ${node.label} - ${node.id}`;
    option.selected = node.key === selected;
    fragment.append(option);
  }
  elements.visibleNodeNavigator.replaceChildren(fragment);
  elements.visibleNodeNavigator.disabled = visibleNodes.length === 0;
  if (!selected) elements.visibleNodeNavigator.selectedIndex = -1;
  elements.navigatorCount.textContent = String(visibleNodes.length);
}

function boundsForKeys(keys) {
  const nodes = [...keys].map((key) => state.model.nodeByKey.get(key)).filter(Boolean);
  if (!nodes.length) return { left: 0, top: 0, right: state.layout.width, bottom: state.layout.height };
  return {
    left: Math.min(...nodes.map((node) => node.x - node.width / 2)) - 80,
    right: Math.max(...nodes.map((node) => node.x + node.width / 2)) + 80,
    top: Math.min(...nodes.map((node) => node.y - node.height / 2)) - 80,
    bottom: Math.max(...nodes.map((node) => node.y + node.height / 2)) + 80,
  };
}

function fitBounds(bounds) {
  const rect = elements.graphCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.max(0.025, Math.min(1.45, Math.min((rect.width - 28) / width, (rect.height - 28) / height)));
  state.view.scale = scale;
  state.view.x = rect.width / 2 - ((bounds.left + bounds.right) / 2) * scale;
  state.view.y = rect.height / 2 - ((bounds.top + bounds.bottom) / 2) * scale;
  requestRender();
}

function fitVisible() {
  fitBounds(boundsForKeys(state.visibleKeys));
}

function frameReadableProductView() {
  const rect = elements.graphCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const bounds = boundsForKeys(state.visibleKeys);
  const scale = window.matchMedia("(max-width: 520px)").matches
    ? 0.5
    : PRODUCT_INITIAL_SCALE;
  state.view.scale = Math.max(NODE_LABEL_MIN_SCALE, scale);
  state.view.x = 24 - bounds.left * state.view.scale;
  state.view.y = 38 - bounds.top * state.view.scale;
  requestRender();
}

function resetMap() {
  fitBounds({ left: 0, top: 0, right: state.layout.width, bottom: state.layout.height });
}

function zoomAt(factor, screenX, screenY) {
  const worldX = (screenX - state.view.x) / state.view.scale;
  const worldY = (screenY - state.view.y) / state.view.scale;
  const nextScale = Math.max(0.025, Math.min(2.6, state.view.scale * factor));
  state.view.x = screenX - worldX * nextScale;
  state.view.y = screenY - worldY * nextScale;
  state.view.scale = nextScale;
  requestRender();
}

function zoomFromCenter(factor) {
  const rect = elements.graphCanvas.getBoundingClientRect();
  zoomAt(factor, rect.width / 2, rect.height / 2);
}

function centerNode(key, select = true) {
  const node = state.model.nodeByKey.get(key);
  if (!node) return;
  if (select) selectNode(key);
  const rect = elements.graphCanvas.getBoundingClientRect();
  state.view.scale = Math.max(state.view.scale, 0.72);
  state.view.x = rect.width / 2 - node.x * state.view.scale;
  state.view.y = rect.height / 2 - node.y * state.view.scale;
  requestRender();
}

function resizeCanvas(canvas, canvasContext) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height, dpr };
}

function requestRender() {
  if (state.renderPending || !state.initialized) return;
  state.renderPending = true;
  requestAnimationFrame(() => {
    state.renderPending = false;
    draw();
  });
}

function worldViewport(screenWidth, screenHeight) {
  return {
    left: -state.view.x / state.view.scale,
    top: -state.view.y / state.view.scale,
    right: (screenWidth - state.view.x) / state.view.scale,
    bottom: (screenHeight - state.view.y) / state.view.scale,
  };
}

function intersects(left, right) {
  return left.left <= right.right && left.right >= right.left
    && left.top <= right.bottom && left.bottom >= right.top;
}

function draw() {
  const screen = resizeCanvas(elements.graphCanvas, context);
  context.clearRect(0, 0, screen.width, screen.height);
  context.fillStyle = "#050d0c";
  context.fillRect(0, 0, screen.width, screen.height);
  const viewport = worldViewport(screen.width, screen.height);

  context.save();
  context.translate(state.view.x, state.view.y);
  context.scale(state.view.scale, state.view.scale);
  drawMapGround(viewport);

  const selectedEdges = highlightedEdgeIds(state.selectedKey);
  for (const edge of state.model.edges) {
    if (!state.visibleEdgeIds.has(edge.id) || selectedEdges.has(edge.id) || !intersects(edge.bounds, viewport)) continue;
    drawEdge(edge, false);
  }
  for (const edge of state.model.edges) {
    if (!state.visibleEdgeIds.has(edge.id) || !selectedEdges.has(edge.id) || !intersects(edge.bounds, viewport)) continue;
    drawEdge(edge, true);
  }

  let visibleMechanismLabels = 0;
  for (const node of state.model.nodes) {
    if (!state.visibleKeys.has(node.key)) continue;
    const bounds = {
      left: node.x - node.width / 2,
      right: node.x + node.width / 2,
      top: node.y - node.height / 2,
      bottom: node.y + node.height / 2,
    };
    if (intersects(bounds, viewport)) {
      drawNode(node);
      if (node.kind === "mechanism" && productLabelsVisibleAtScale(state.view.scale)) {
        visibleMechanismLabels += 1;
      }
    }
  }
  elements.graphCanvas.dataset.mechanismLabels = productLabelsVisibleAtScale(state.view.scale) ? "visible" : "hidden";
  elements.graphCanvas.dataset.visibleMechanismLabels = String(visibleMechanismLabels);
  context.restore();

  elements.zoomReadout.textContent = `${Math.round(state.view.scale * 100)}%`;
  drawMinimap(viewport);
}

function drawMapGround(viewport) {
  const scale = state.view.scale;
  context.fillStyle = "#071110";
  context.fillRect(0, 0, state.layout.width, state.layout.height);

  for (let laneIndex = 0; laneIndex < state.layout.laneBands.length; laneIndex += 1) {
    const lane = state.layout.laneBands[laneIndex];
    const top = lane.top;
    context.fillStyle = laneIndex % 2 ? "rgba(16, 35, 32, 0.23)" : "rgba(10, 25, 23, 0.16)";
    context.fillRect(0, top, state.layout.width, lane.height);
    context.strokeStyle = lane.overlay
      ? "rgba(170, 144, 220, 0.42)"
      : "rgba(57, 80, 76, 0.42)";
    context.lineWidth = Math.min(1 / scale, 8);
    context.beginPath();
    context.moveTo(0, top);
    context.lineTo(state.layout.width, top);
    context.stroke();

    if (scale > 0.075) {
      const labelX = Math.max(10, viewport.left + 10 / scale);
      const labelY = top + 19 / scale;
      context.fillStyle = lane.overlay
        ? "rgba(170, 144, 220, 0.8)"
        : "rgba(130, 145, 143, 0.8)";
      context.font = `700 ${Math.min(10 / scale, 42)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
      context.textBaseline = "middle";
      context.fillText(lane.label.toUpperCase(), labelX, labelY);
    }
  }

  for (let index = 0; index < state.layout.ranks.length; index += 1) {
    const rank = state.layout.ranks[index];
    if (index % 2) {
      context.fillStyle = "rgba(99, 214, 205, 0.015)";
      context.fillRect(rank.start, 0, rank.width, state.layout.height);
    }
    context.strokeStyle = "rgba(57, 80, 76, 0.36)";
    context.lineWidth = Math.min(1 / scale, 8);
    context.setLineDash([Math.min(4 / scale, 28), Math.min(8 / scale, 50)]);
    context.beginPath();
    context.moveTo(rank.start, 0);
    context.lineTo(rank.start, state.layout.height);
    context.stroke();
    context.setLineDash([]);

    if (scale > 0.06 && rank.end >= viewport.left && rank.start <= viewport.right) {
      const labelY = Math.max(26, viewport.top + 25 / scale);
      context.fillStyle = "rgba(99, 214, 205, 0.72)";
      context.font = `600 ${Math.min(11 / scale, 46)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(state.model.axes[index].label.toUpperCase(), (rank.start + rank.end) / 2, labelY);
      context.textAlign = "left";
    }
  }
}

function highlightedEdgeIds(key) {
  if (!key) return new Set();
  const node = state.model.nodeByKey.get(key);
  if (!node) return new Set();
  return new Set(node.incidentEdges.map((edge) => edge.id));
}

function drawEdge(edge, highlighted) {
  const scale = state.view.scale;
  const productMode = state.mode === "product";
  const productProjection = currentProductProjection(state.model);
  const overlay = productMode && productProjection.overlayIncidenceIds.has(edge.id);
  const openContract = productMode && state.model.openContractEdgeIds.has(edge.id);
  const missingClass = productMode
    ? undefined
    : Object.keys(ORPHAN_COLORS).find((name) => edge.missingClasses.has(name));
  const artifact = state.model.artifactNodeById.get(edge.artifactId);
  const nonRuntimeContext = state.mode === "runtime" && artifact.record.plane !== "runtime";
  const frontierMissing = state.mode === "frontiers"
    && state.model.candidateClosure.frontierMissingEdgeIds.has(edge.id);
  const frontierAvailable = state.mode === "frontiers"
    && state.model.candidateClosure.frontierAvailableEdgeIds.has(edge.id);
  context.beginPath();
  context.moveTo(edge.points[0].x, edge.points[0].y);
  for (const point of edge.points.slice(1)) context.lineTo(point.x, point.y);
  if (overlay) {
    context.strokeStyle = highlighted ? "rgba(195, 176, 235, 0.9)" : "rgba(170, 144, 220, 0.34)";
    context.lineWidth = Math.min((highlighted ? 1.8 : 0.9) / scale, highlighted ? 15 : 8);
    context.setLineDash([Math.min(5 / scale, 20), Math.min(5 / scale, 20)]);
  } else if (highlighted) {
    context.strokeStyle = edge.direction === "input" ? "#e9aa57" : "#63d6cd";
    context.lineWidth = Math.min(2.2 / scale, 18);
  } else if (openContract) {
    context.strokeStyle = "rgba(130, 145, 143, 0.52)";
    context.lineWidth = Math.min(1.1 / scale, 10);
    context.setLineDash([Math.min(4 / scale, 18), Math.min(3 / scale, 14)]);
  } else if (frontierMissing) {
    context.strokeStyle = "#e16b65";
    context.lineWidth = Math.min(1.6 / scale, 12);
    context.setLineDash([Math.min(3 / scale, 16), Math.min(3 / scale, 16)]);
  } else if (frontierAvailable) {
    context.strokeStyle = "rgba(233, 170, 87, 0.82)";
    context.lineWidth = Math.min(1.3 / scale, 11);
    context.setLineDash([Math.min(7 / scale, 24), Math.min(3 / scale, 14)]);
  } else if (missingClass) {
    context.strokeStyle = ORPHAN_COLORS[missingClass];
    context.lineWidth = Math.min(1.2 / scale, 10);
    context.setLineDash([Math.min(4 / scale, 18), Math.min(3 / scale, 14)]);
  } else if (nonRuntimeContext) {
    context.strokeStyle = "rgba(170, 144, 220, 0.72)";
    context.lineWidth = Math.min(1.1 / scale, 10);
    context.setLineDash([Math.min(6 / scale, 22), Math.min(3 / scale, 12)]);
  } else if (edge.backward) {
    context.strokeStyle = "rgba(233, 170, 87, 0.3)";
    context.lineWidth = Math.min(0.9 / scale, 9);
  } else {
    context.strokeStyle = edge.direction === "input"
      ? "rgba(130, 145, 143, 0.24)"
      : "rgba(45, 119, 114, 0.38)";
    context.lineWidth = Math.min(0.85 / scale, 8);
  }
  context.lineJoin = "round";
  context.stroke();
  context.setLineDash([]);

  const target = edge.points.at(-1);
  const previous = edge.points.at(-2);
  const direction = Math.sign(target.x - previous.x) || 1;
  const size = Math.min(highlighted ? 7 / scale : 4.5 / scale, highlighted ? 22 : 16);
  context.fillStyle = highlighted
    ? (overlay ? "#aa90dc" : edge.direction === "input" ? "#e9aa57" : "#63d6cd")
    : overlay
      ? "rgba(170, 144, 220, 0.64)"
      : openContract
        ? "rgba(130, 145, 143, 0.72)"
    : frontierMissing
      ? "#e16b65"
      : frontierAvailable
        ? "#e9aa57"
    : missingClass
      ? ORPHAN_COLORS[missingClass]
      : nonRuntimeContext
        ? "#aa90dc"
        : (edge.direction === "input" ? "rgba(160, 172, 169, 0.62)" : "rgba(99, 214, 205, 0.64)");
  context.beginPath();
  context.moveTo(target.x, target.y);
  context.lineTo(target.x - direction * size, target.y - size * 0.58);
  context.lineTo(target.x - direction * size, target.y + size * 0.58);
  context.closePath();
  context.fill();
}

function roundedRectPath(x, y, width, height, radius) {
  const left = x - width / 2;
  const top = y - height / 2;
  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(left + width - radius, top);
  context.quadraticCurveTo(left + width, top, left + width, top + radius);
  context.lineTo(left + width, top + height - radius);
  context.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
  context.lineTo(left + radius, top + height);
  context.quadraticCurveTo(left, top + height, left, top + height - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
}

function mechanismPath(node) {
  const left = node.x - node.width / 2;
  const right = node.x + node.width / 2;
  const top = node.y - node.height / 2;
  const bottom = node.y + node.height / 2;
  const notch = 10;
  context.beginPath();
  context.moveTo(left + notch, top);
  context.lineTo(right - notch, top);
  context.lineTo(right, node.y);
  context.lineTo(right - notch, bottom);
  context.lineTo(left + notch, bottom);
  context.lineTo(left, node.y);
  context.closePath();
}

function orphanStroke(node) {
  if (state.mode === "product") {
    if (state.model.materializerGapArtifactIds.has(node.id)) return "#e16b65";
    if (state.model.openContractArtifactIds.has(node.id)) return "#7d8c89";
    const projection = currentProductProjection(state.model);
    if (projection.overlayArtifactIds.has(node.id)) return "rgba(170, 144, 220, 0.76)";
    return PLANE_COLORS[node.record.plane];
  }
  if (node.orphanClasses.has("product-goal-gap")) return ORPHAN_COLORS["product-goal-gap"];
  for (const classification of Object.keys(ORPHAN_COLORS)) {
    if (node.orphanClasses.has(classification)) return ORPHAN_COLORS[classification];
  }
  if (state.model.neverProvidedById.has(node.id) || state.model.neverUsedById.has(node.id)) return "#7d7161";
  return PLANE_COLORS[node.record.plane];
}

function drawNode(node) {
  const scale = state.view.scale;
  const selected = node.key === state.selectedKey;
  const hovered = node.key === state.hoveredKey;
  const matched = state.searchMatches.includes(node.key);
  const anchor = node.id === LEFT_ANCHOR_ID || node.id === RIGHT_ANCHOR_ID;
  const productMode = state.mode === "product";
  const productProjection = currentProductProjection(state.model);
  const overlay = productMode && (
    productProjection.overlayArtifactIds.has(node.id)
    || productProjection.overlayMechanismIds.has(node.id)
  );
  const productMaterializerGap = productMode && state.model.materializerGapArtifactIds.has(node.id);
  const openContract = productMode && state.model.openContractArtifactIds.has(node.id);
  const closureReached = state.mode === "frontiers"
    && state.model.candidateClosure.reachedMechanismKeys.has(node.key);
  const closureFrontier = state.mode === "frontiers"
    && state.model.candidateClosure.frontierMechanismKeys.has(node.key);
  const path = () => node.kind === "artifact"
    ? roundedRectPath(node.x, node.y, node.width, node.height, 6)
    : mechanismPath(node);

  path();
  context.fillStyle = overlay
    ? (node.kind === "artifact" ? "#181728" : "#211d2d")
    : node.kind === "artifact"
    ? (node.record.plane === "development" ? "#18182a" : node.record.plane === "governance" ? "#282015" : "#112421")
    : closureReached
      ? "#12312d"
      : closureFrontier
        ? "#302417"
        : "#172d2a";
  context.fill();
  const nonRuntimeContext = state.mode === "runtime" && node.kind === "artifact" && node.record.plane !== "runtime";
  if (nonRuntimeContext) {
    context.save();
    path();
    context.clip();
    context.strokeStyle = "rgba(170, 144, 220, 0.58)";
    context.lineWidth = Math.min(1 / scale, 7);
    const step = 12;
    for (let offset = -node.width; offset < node.width; offset += step) {
      context.beginPath();
      context.moveTo(node.x - node.width / 2 + offset, node.y + node.height / 2);
      context.lineTo(node.x - node.width / 2 + offset + node.height, node.y - node.height / 2);
      context.stroke();
    }
    context.restore();
  }
  const mixedPermitted = (state.mode === "runtime" || state.mode === "frontiers")
    && node.kind === "mechanism"
    && node.record.censusStatus.runtimeAdmissibilities.includes("permitted")
    && node.record.censusStatus.runtimeAdmissibilities.length > 1;
  context.strokeStyle = node.kind === "artifact"
    ? orphanStroke(node)
    : overlay
      ? "rgba(170, 144, 220, 0.76)"
      : closureFrontier || mixedPermitted
      ? "#e9aa57"
      : closureReached
        ? "#63d6cd"
        : "#4b6f69";
  context.lineWidth = Math.min((selected || hovered ? 2.2 : 1) / scale, selected ? 17 : 9);
  if (overlay || openContract) {
    context.setLineDash([Math.min(4 / scale, 18), Math.min(3 / scale, 14)]);
  } else if (!productMode && node.kind === "artifact" && (state.model.neverProvidedById.has(node.id) || state.model.neverUsedById.has(node.id))) {
    context.setLineDash([Math.min(4 / scale, 18), Math.min(3 / scale, 14)]);
  } else if (closureFrontier) {
    context.setLineDash([Math.min(5 / scale, 20), Math.min(4 / scale, 16)]);
  }
  context.stroke();
  context.setLineDash([]);

  if (!productMode && node.kind === "artifact" && node.orphanClasses.size) {
    const classifications = Object.keys(ORPHAN_COLORS).filter((name) => node.orphanClasses.has(name));
    const markerRadius = Math.min(2.7 / scale, 5);
    const totalWidth = (classifications.length - 1) * markerRadius * 2.5;
    classifications.forEach((classification, index) => {
      context.fillStyle = ORPHAN_COLORS[classification];
      context.beginPath();
      context.arc(
        node.x - totalWidth / 2 + index * markerRadius * 2.5,
        node.y + node.height / 2,
        markerRadius,
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  }

  if (anchor || selected || matched) {
    path();
    context.strokeStyle = selected
      ? "#f2fbf8"
      : productMaterializerGap
        ? "#e16b65"
        : anchor
          ? "#63d6cd"
          : "rgba(99, 214, 205, 0.72)";
    context.lineWidth = Math.min((selected ? 3.4 : productMaterializerGap ? 3 : 2) / scale, selected ? 22 : 18);
    context.stroke();
  }

  if (state.model.materializerGapArtifactIds.has(node.id) && (scale >= 0.13 || selected || hovered)) {
    context.fillStyle = "#e16b65";
    context.font = `700 ${Math.min(9 / scale, 18)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText("NO DECLARED PRODUCER", node.x, node.y - node.height / 2 - Math.min(4 / scale, 8));
    context.textAlign = "left";
  }

  if (node.kind === "mechanism" && (closureReached || closureFrontier || mixedPermitted) && (scale >= 0.16 || selected || hovered)) {
    const labels = [];
    if (closureReached) labels.push("CANDIDATE-REACHED");
    if (closureFrontier) labels.push("FRONTIER / UNREACHED");
    if (mixedPermitted) labels.push("CONDITIONAL");
    context.fillStyle = closureFrontier || mixedPermitted ? "#e9aa57" : "#63d6cd";
    context.font = `700 ${Math.min(8 / scale, 16)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(labels.join(" / "), node.x, node.y - node.height / 2 - Math.min(4 / scale, 8));
    context.textAlign = "left";
  }

  const showLabel = productLabelsVisibleAtScale(scale) || anchor || selected || hovered || matched;
  if (!showLabel) return;
  const fontSize = Math.min(11 / scale, 18);
  context.save();
  path();
  context.clip();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = selected || hovered ? "#f2fbf8" : "#d9e2df";
  context.font = `600 ${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue("--sans")}`;
  const label = fitText(node.label, node.width - 18, fontSize);
  context.fillText(label, node.x, node.y - (scale >= 0.7 ? 5 : 0));
  if (scale >= 0.7) {
    context.fillStyle = node.kind === "artifact" ? PLANE_COLORS[node.record.plane] : "#82918f";
    context.font = `500 ${Math.min(8 / scale, 11)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
    context.fillText(fitText(node.id, node.width - 20, Math.min(8 / scale, 11)), node.x, node.y + 8);
  }
  context.restore();
}

function fitText(text, maxWidth, fontSize) {
  if (context.measureText(text).width <= maxWidth) return text;
  const averageWidth = fontSize * 0.56;
  const maximum = Math.max(4, Math.floor(maxWidth / averageWidth) - 2);
  return `${text.slice(0, maximum)}...`;
}

function drawMinimap(viewport) {
  if (!elements.minimap.getClientRects().length) return;
  const screen = resizeCanvas(elements.minimap, minimapContext);
  minimapContext.clearRect(0, 0, screen.width, screen.height);
  minimapContext.fillStyle = "rgba(5, 13, 12, 0.96)";
  minimapContext.fillRect(0, 0, screen.width, screen.height);
  const padding = 7;
  const scale = Math.min(
    (screen.width - padding * 2) / state.layout.width,
    (screen.height - padding * 2) / state.layout.height,
  );
  const offsetX = (screen.width - state.layout.width * scale) / 2;
  const offsetY = (screen.height - state.layout.height * scale) / 2;

  for (const lane of state.layout.laneBands) {
    const y = offsetY + lane.top * scale;
    minimapContext.strokeStyle = "rgba(57, 80, 76, 0.34)";
    minimapContext.beginPath();
    minimapContext.moveTo(offsetX, y);
    minimapContext.lineTo(offsetX + state.layout.width * scale, y);
    minimapContext.stroke();
  }
  for (const rank of state.layout.ranks) {
    const x = offsetX + rank.start * scale;
    minimapContext.strokeStyle = "rgba(45, 119, 114, 0.28)";
    minimapContext.beginPath();
    minimapContext.moveTo(x, offsetY);
    minimapContext.lineTo(x, offsetY + state.layout.height * scale);
    minimapContext.stroke();
  }

  for (const node of state.model.nodes) {
    const visible = state.visibleKeys.has(node.key);
    const closureReached = state.mode === "frontiers"
      && state.model.candidateClosure.reachedMechanismKeys.has(node.key);
    const closureFrontier = state.mode === "frontiers"
      && state.model.candidateClosure.frontierMechanismKeys.has(node.key);
    minimapContext.fillStyle = visible
      ? (closureFrontier ? "rgba(225, 107, 101, 0.9)" : closureReached ? "rgba(99, 214, 205, 0.9)" : node.kind === "mechanism" ? "rgba(233, 170, 87, 0.8)" : "rgba(99, 214, 205, 0.7)")
      : "rgba(86, 100, 98, 0.18)";
    const size = node.id === LEFT_ANCHOR_ID || node.id === RIGHT_ANCHOR_ID ? 3 : visible ? 1.5 : 1;
    minimapContext.fillRect(offsetX + node.x * scale - size / 2, offsetY + node.y * scale - size / 2, size, size);
  }

  const viewLeft = offsetX + Math.max(0, viewport.left) * scale;
  const viewTop = offsetY + Math.max(0, viewport.top) * scale;
  const viewRight = offsetX + Math.min(state.layout.width, viewport.right) * scale;
  const viewBottom = offsetY + Math.min(state.layout.height, viewport.bottom) * scale;
  minimapContext.strokeStyle = "#e9aa57";
  minimapContext.lineWidth = 1;
  minimapContext.strokeRect(viewLeft, viewTop, Math.max(1, viewRight - viewLeft), Math.max(1, viewBottom - viewTop));
  elements.minimap._mapTransform = { scale, offsetX, offsetY };
}

function screenToWorld(clientX, clientY) {
  const rect = elements.graphCanvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.scale,
    y: (clientY - rect.top - state.view.y) / state.view.scale,
  };
}

function hitNode(clientX, clientY) {
  const point = screenToWorld(clientX, clientY);
  const nodes = state.model.nodes;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!state.visibleKeys.has(node.key)) continue;
    if (
      point.x >= node.x - node.width / 2
      && point.x <= node.x + node.width / 2
      && point.y >= node.y - node.height / 2
      && point.y <= node.y + node.height / 2
    ) return node;
  }
  return null;
}

function showTooltip(node, clientX, clientY) {
  if (!node) {
    elements.tooltip.hidden = true;
    return;
  }
  const wrap = elements.canvasWrap.getBoundingClientRect();
  const orphan = node.kind === "artifact" && state.mode !== "product" ? orphanSummary(node) : "";
  let detail = node.kind === "artifact"
    ? `${escapeHtml(node.record.category)} / ${escapeHtml(node.record.plane)}<br>Focus: ${escapeHtml(node.record.productFocus)}${orphan ? `<br>${escapeHtml(orphan)}` : ""}`
    : `${node.record.inputPorts.length} inputs / ${node.record.outputPorts.length} outputs<br>Focus: ${escapeHtml(node.record.focusClass)}`;
  if (state.mode === "frontiers" && node.kind === "mechanism") {
    const reached = state.model.candidateClosure.reachedMechanismKeys.has(node.key);
    const frontier = state.model.candidateClosure.frontierDetailsByMechanismId.get(node.id);
    const conditional = state.model.candidateClosure.conditionalMechanismKeys.has(node.key);
    detail += reached
      ? "<br>Candidate-reached / complete declared bundle"
      : frontier
        ? `<br>Frontier / unreached / ${frontier.directPorts.length} direct and ${frontier.alternativeGroups.length} group unresolved conditions`
        : "";
    if (conditional) detail += "<br>Conditional permitted/prohibited variants";
  }
  elements.tooltip.innerHTML = `<strong>${escapeHtml(node.label)}</strong><code>${escapeHtml(node.id)}</code>${detail}`;
  elements.tooltip.hidden = false;
  const left = Math.min(wrap.width - 300, Math.max(8, clientX - wrap.left + 14));
  const top = Math.min(wrap.height - 100, Math.max(8, clientY - wrap.top + 14));
  elements.tooltip.style.left = `${left}px`;
  elements.tooltip.style.top = `${top}px`;
}

function orphanSummary(node) {
  return [...node.orphanClasses]
    .sort((left, right) => ORPHAN_LABELS[left].localeCompare(ORPHAN_LABELS[right]))
    .map((classification) => ORPHAN_LABELS[classification])
    .join(" / ");
}

function selectNode(key) {
  state.selectedKey = key;
  if (key) {
    const node = state.model.nodeByKey.get(key);
    elements.instrument.classList.add("inspector-open");
    elements.inspector.classList.add("is-open");
    renderInspector(node);
    elements.visibleNodeNavigator.value = key;
    announce(`Selected ${node.kind} ${node.label}, ${node.id}.`);
  } else {
    renderEmptyInspector();
    elements.visibleNodeNavigator.selectedIndex = -1;
    announce("Selection cleared.");
  }
  requestRender();
}

function renderEmptyInspector() {
  elements.inspector.replaceChildren();
  elements.instrument.classList.remove("inspector-open");
  elements.inspector.classList.remove("is-open");
}

function tagList(values, alert = false) {
  return `<ul class="tag-list">${values.map((value) => `<li${alert ? " class=\"alert\"" : ""}>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function notesList(notes) {
  return `<ul class="note-list">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}

function relationRows(edges, direction) {
  const rows = edges
    .filter((edge) => edge.direction === direction)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!rows.length) return `<p class="status-copy">None in the census graph.</p>`;
  return `<div class="relation-list">${rows.map((edge) => {
    const mechanism = state.model.mechanismById.get(edge.mechanismId);
    const key = nodeKey("mechanism", edge.mechanismId);
    const hidden = !state.visibleKeys.has(key);
    return `<div class="relation-row">
      <button class="node-jump${hidden ? " reveal-link" : ""}" type="button" ${hidden ? "data-reveal-key" : "data-node-key"}="${escapeHtml(key)}">${hidden ? "Reveal in Full registry: " : ""}${escapeHtml(mechanism?.title ?? edge.mechanismId)}</button>
      <small>${escapeHtml(edge.mechanismId)}:${escapeHtml(edge.portId)}</small>
    </div>`;
  }).join("")}</div>`;
}

function renderInputAnalysisDetail(detail) {
  const generated = state.model.inputDetailByReference.get(referenceKey(detail.port));
  const labels = [...(generated?.classes ?? [])].map((classification) => ORPHAN_LABELS[classification]);
  const alternative = detail.alternativeGroup
    ? `<p class="status-copy">Alternative group <strong>${escapeHtml(detail.alternativeGroup.id)}</strong>: ${detail.alternativeGroup.producerBackedMemberPortCount}/${detail.alternativeGroup.memberPortCount} members producer-backed; selection ${escapeHtml(detail.alternativeGroup.selectionCardinality)}.</p>`
    : "";
  return `<article class="port-card">
    <h4>${escapeHtml(detail.port.mechanismId)}:${escapeHtml(detail.port.portId)}</h4>
    ${labels.length ? tagList(labels, true) : ""}
    <p class="port-meta">${escapeHtml(detail.obligationClassification)} / ${escapeHtml(detail.requirement)} / producer ${escapeHtml(detail.producerAvailability)}</p>
    ${alternative}
  </article>`;
}

function renderOutputAnalysisDetail(detail) {
  return `<article class="port-card">
    <h4>${escapeHtml(detail.port.mechanismId)}:${escapeHtml(detail.port.portId)}</h4>
    ${tagList([ORPHAN_LABELS[detail.disposition] ?? detail.disposition], true)}
    <p class="port-meta">Generated output disposition: ${escapeHtml(detail.disposition)}</p>
    ${detail.terminalPurpose ? `<p class="status-copy">${escapeHtml(detail.terminalPurpose)}</p>` : ""}
  </article>`;
}

function renderClosureArtifactStatus(node) {
  if (state.mode !== "frontiers") return "";
  const closure = state.model.candidateClosure;
  let status = "Context artifact in a displayed candidate or frontier bundle; it is not candidate-available at the closure fixpoint.";
  if (node.id === RIGHT_ANCHOR_ID) {
    status = "Pinned confirmed product materializer gap. It is not a seed, no declared mechanism produces it, and it remains candidate-unreachable.";
  } else if (closure.rootArtifactIds.has(node.id)) {
    status = node.id === LEFT_ANCHOR_ID
      ? "Native raster anchor and declaration-level closure seed."
      : "Eligible expected-external runtime/governance root and declaration-level closure seed.";
  } else if (closure.availableArtifactIds.has(node.id)) {
    status = "Candidate-available output added by an obligation-satisfied permitted mechanism.";
  }
  return `<section class="inspector-section closure-status"><h3>Candidate closure status</h3><p class="status-copy">${escapeHtml(status)}</p><p class="status-copy">Availability here is declaration-level only. It is not executable or source-validated reachability.</p></section>`;
}

function renderClosureMechanismStatus(node) {
  if (state.mode !== "frontiers") return "";
  const closure = state.model.candidateClosure;
  const conditional = closure.conditionalMechanismKeys.has(node.key);
  const conditionalText = conditional
    ? `<p class="status-copy"><strong>Conditional:</strong> generated status contains both permitted and prohibited variants.</p>`
    : "";
  if (closure.reachedMechanismKeys.has(node.key)) {
    return `<section class="inspector-section closure-status"><h3>Candidate closure status</h3>${tagList(["Candidate-reached", "Complete declared bundle"])}<p class="status-copy">Every direct required/configuration obligation is candidate-available and every declared alternative group has an available member. Optional inputs are not closure conditions.</p>${conditionalText}<p class="status-copy">Conditional value constraints and branches are displayed below but not evaluated by this closure.</p></section>`;
  }
  const frontier = closure.frontierDetailsByMechanismId.get(node.id);
  if (!frontier) return "";
  const available = frontier.availableNaturalPorts.map((port) => `${port.id}: ${port.artifactTypeId}`);
  const direct = frontier.directPorts.map((port) => `${port.id}: ${port.artifactTypeId}`);
  const groups = frontier.alternativeGroups.map(({ group, memberPorts }) =>
    `${group.id}: none of ${memberPorts.map((port) => `${port.id} (${port.artifactTypeId})`).join(", ")} is available`);
  return `<section class="inspector-section closure-status"><h3>Candidate closure status</h3>${tagList(["Frontier", "Unreached"], true)}<p class="status-copy">At least one natural input is candidate-available, while declared closure conditions remain unresolved. No outputs are admitted or drawn.</p><h4>Available natural inputs</h4>${notesList(available)}${direct.length ? `<h4>Unresolved direct conditions</h4>${notesList(direct)}` : ""}${groups.length ? `<h4>Unresolved alternative-group conditions</h4>${notesList(groups)}` : ""}${conditionalText}<p class="status-copy">Conditional value constraints and branches are displayed below but not evaluated by this closure.</p></section>`;
}

function renderArtifactInspector(node) {
  const artifact = node.record;
  const axis = state.model.axes[node.axisIndex];
  const lane = state.model.lanes[node.laneIndex];
  const neverProvided = state.model.neverProvidedById.get(artifact.id);
  const neverUsed = state.model.neverUsedById.get(artifact.id);
  const orphanTags = [...node.orphanClasses].map((classification) => ORPHAN_LABELS[classification] ?? classification);
  const terminalPorts = node.incidentEdges
    .filter((edge) => edge.direction === "output" && edge.port.terminalPurpose)
    .map((edge) => `${edge.mechanismId}:${edge.portId} - ${edge.port.terminalPurpose}`);

  elements.inspector.innerHTML = `
    <header class="inspector-header">
      <span class="node-kind">Artifact contract</span>
      <button class="inspector-close" type="button" aria-label="Close inspector">Close</button>
      <h2>${escapeHtml(artifact.label)}</h2>
      <div class="node-id">${escapeHtml(artifact.id)}</div>
    </header>
    ${renderClosureArtifactStatus(node)}
    <section class="inspector-section">
      <p class="description">${escapeHtml(artifact.description)}</p>
      <dl class="fact-grid">
        <dt>Category</dt><dd>${escapeHtml(artifact.category)}</dd>
        <dt>Plane</dt><dd>${escapeHtml(artifact.plane)}</dd>
        <dt>Product focus</dt><dd>${escapeHtml(artifact.productFocus)}</dd>
        <dt>Contract</dt><dd>${escapeHtml(artifact.contractMaturity)}</dd>
        <dt>Boundary</dt><dd>${escapeHtml(artifact.boundaryClassification)}</dd>
        <dt>Axis</dt><dd>${escapeHtml(axis.label)}</dd>
        <dt>Lane</dt><dd>${escapeHtml(lane.label)}</dd>
      </dl>
      <p class="status-copy">Product focus is a viewing classification only. It does not indicate selection, integration, product readiness, or proven compatibility.</p>
    </section>
    ${state.mode === "product" ? "" : `<section class="inspector-section">
      <h3>Generated orphan analysis</h3>
      ${orphanTags.length ? tagList(orphanTags, true) : `<p class="status-copy">Typed producers and consumers both exist in the census analysis.</p>`}
      ${neverProvided ? `<p class="status-copy">Never-provided type disposition: <strong>${escapeHtml(neverProvided.disposition)}</strong>.</p>${neverProvided.consumerPortDetails.map(renderInputAnalysisDetail).join("")}` : ""}
      ${neverUsed ? `<p class="status-copy">Never-used type disposition: <strong>${escapeHtml(neverUsed.disposition)}</strong>.</p>${neverUsed.producerPortDetails.map(renderOutputAnalysisDetail).join("")}` : ""}
    </section>`}
    ${state.model.materializerGapArtifactIds.has(artifact.id) ? `<section class="inspector-section"><h3>Confirmed structural gap</h3><p class="status-copy"><strong>No declared primary product materializer emits this exact contract.</strong> A consuming validation port does not materialize the UI Palette.</p></section>` : ""}
    <section class="inspector-section">
      <h3>Direct producers</h3>
      ${relationRows(node.incidentEdges, "output")}
    </section>
    <section class="inspector-section">
      <h3>Direct consumers</h3>
      ${relationRows(node.incidentEdges, "input")}
    </section>
    <section class="inspector-section">
      <h3>Boundary and terminal purpose</h3>
      <p class="status-copy">Boundary classification: <strong>${escapeHtml(artifact.boundaryClassification)}</strong>.</p>
      ${artifact.intentionalTerminalPurpose ? `<p class="status-copy">${escapeHtml(artifact.intentionalTerminalPurpose)}</p>` : ""}
      ${terminalPorts.length ? notesList(terminalPorts) : ""}
    </section>
    <section class="inspector-section">
      <h3>Source authority</h3>
      <a href="/MECHANISMS.html#L1" target="_blank" rel="noreferrer">research/v4/MECHANISMS.md line-numbered source</a>
      ${notesList(artifact.sourceNotes)}
    </section>
    <section class="inspector-section">
      <h3>Provenance notes</h3>
      ${notesList(artifact.provenanceNotes)}
    </section>`;
}

function renderValueConstraints(constraints = []) {
  if (!constraints.length) return "";
  return `<div class="constraint-list">${constraints.map((constraint) => {
    const value = Object.hasOwn(constraint, "value") ? ` ${JSON.stringify(constraint.value)}` : "";
    return `<p><code>${escapeHtml(constraint.valuePath)} ${escapeHtml(constraint.comparator)}${escapeHtml(value)}</code></p>${notesList(constraint.notes)}`;
  }).join("")}</div>`;
}

function renderClosurePortStatus(mechanismId, port, direction) {
  if (state.mode !== "frontiers") return "";
  const closure = state.model.candidateClosure;
  const mechanismKey = nodeKey("mechanism", mechanismId);
  if (direction === "output") {
    return closure.reachedMechanismKeys.has(mechanismKey)
      ? `<p class="closure-port-state">Candidate-available output admitted at the fixpoint.</p>`
      : closure.frontierMechanismKeys.has(mechanismKey)
        ? `<p class="closure-port-state blocked">Declared frontier output; not admitted or drawn.</p>`
        : "";
  }
  if (closure.availableArtifactIds.has(port.artifactTypeId)) {
    return `<p class="closure-port-state">Candidate-available input${closure.rootArtifactIds.has(port.artifactTypeId) ? " seed" : ""}.</p>`;
  }
  const frontier = closure.frontierDetailsByMechanismId.get(mechanismId);
  const blocked = frontier?.directPorts.some((candidate) => candidate.id === port.id)
    || frontier?.alternativeGroups.some(({ memberPorts }) => memberPorts.some((candidate) => candidate.id === port.id));
  return blocked
    ? `<p class="closure-port-state blocked">Unresolved declaration-level closure condition.</p>`
    : `<p class="closure-port-state context">Unavailable optional or unselected bundle context; not a closure condition.</p>`;
}

function renderPort(mechanismId, port, direction) {
  const artifact = state.model.artifactById.get(port.artifactTypeId);
  const artifactKey = nodeKey("artifact", port.artifactTypeId);
  const hidden = !state.visibleKeys.has(artifactKey);
  const reference = `${mechanismId}:${direction}:${port.id}`;
  const generated = direction === "input"
    ? state.model.inputDetailByReference.get(reference)
    : state.model.outputDetailByReference.get(reference);
  const openContractType = state.model.openContractTypeByReference.get(reference);
  const metadata = direction === "input"
    ? `${port.requirement} / ${port.cardinality} / class ${port.inputClass}${port.alternativeGroupId ? ` / alternative ${port.alternativeGroupId}` : ""}`
    : `${port.cardinality}${port.terminalPurpose ? " / terminal purpose declared" : ""}`;
  const stateNotes = direction === "output" ? notesList(port.valueStateNotes) : "";
  const generatedLabels = state.mode === "product"
    ? (openContractType ? [`Open ${openContractType} contract`] : [])
    : [...(generated?.classes ?? [])].map((classification) => ORPHAN_LABELS[classification] ?? classification);
  const generatedDetail = state.mode === "product"
    ? (openContractType
      ? `<p class="status-copy">Generated candidate connectivity observation; not a backlog or trial gate.</p>`
      : "")
    : direction === "input" && generated
      ? `<p class="status-copy">Generated: ${escapeHtml(generated.detail.obligationClassification)}; producer ${escapeHtml(generated.detail.producerAvailability)}.${generated.detail.alternativeGroup ? ` Group ${escapeHtml(generated.detail.alternativeGroup.id)} has ${generated.detail.alternativeGroup.producerBackedMemberPortCount}/${generated.detail.alternativeGroup.memberPortCount} producer-backed members.` : ""}</p>`
      : direction === "output" && generated
        ? `<p class="status-copy">Generated output disposition: ${escapeHtml(generated.detail.disposition)}.</p>`
        : "";
  return `<article class="port-card">
    <h4>${escapeHtml(port.label)} <code>${escapeHtml(port.id)}</code></h4>
    <button class="node-jump${hidden ? " reveal-link" : ""}" type="button" ${hidden ? "data-reveal-key" : "data-node-key"}="${escapeHtml(artifactKey)}">${hidden ? "Reveal in Full registry: " : ""}${escapeHtml(artifact?.label ?? port.artifactTypeId)}</button>
    <code>${escapeHtml(port.artifactTypeId)}</code>
    <p class="port-meta">${escapeHtml(metadata)}</p>
    ${renderClosurePortStatus(mechanismId, port, direction)}
    ${generatedLabels.length ? tagList(generatedLabels, state.mode !== "product") : ""}
    ${generatedDetail}
    ${port.terminalPurpose ? `<p>${escapeHtml(port.terminalPurpose)}</p>` : ""}
    ${stateNotes}
    ${renderValueConstraints(port.valueConstraints)}
    ${notesList(port.notes)}
  </article>`;
}

function renderMechanismInspector(node) {
  const mechanism = node.record;
  const status = mechanism.censusStatus;
  const inputGroups = groupMechanismInputPorts(mechanism, state.model.artifactById);
  const capabilities = mechanism.capabilityIds.map((id) => state.model.capabilityById.get(id));
  const primaryCapability = state.model.capabilityById.get(mechanism.primaryCapabilityId);
  const otherCapabilities = capabilities.filter((capability) => capability?.id !== mechanism.primaryCapabilityId);
  elements.inspector.innerHTML = `
    <header class="inspector-header">
      <span class="node-kind">Mechanism hyperedge</span>
      <button class="inspector-close" type="button" aria-label="Close inspector">Close</button>
      <h2>${escapeHtml(mechanism.title)}</h2>
      <div class="node-id">${escapeHtml(mechanism.id)}</div>
    </header>
    ${renderClosureMechanismStatus(node)}
    <section class="inspector-section">
      <h3>Product focus classification</h3>
      ${tagList([mechanism.focusClass])}
      <p class="status-copy">This is generated viewing and research-priority metadata only. It does not mean selected, integrated, product-ready, source-validated, authorized, or proven compatible.</p>
    </section>
    <section class="inspector-section">
      <h3>Taxonomy / group memberships</h3>
      ${tagList([`Primary visualization placement: ${primaryCapability?.label ?? mechanism.primaryCapabilityId}`])}
      ${otherCapabilities.length ? tagList(otherCapabilities.map((capability) => `Additional membership: ${capability?.label ?? "Unknown group"}`)) : ""}
      <p class="status-copy">The primary membership selects this node's visualization cell only. It grants no semantic priority, capability proof, dependency, or authorization.</p>
      ${notesList(capabilities.map((capability) => capability?.description ?? "Unknown taxonomy definition"))}
    </section>
    <section class="inspector-section">
      <h3>Census status</h3>
      <dl class="fact-grid">
        <dt>Scientific</dt><dd>${escapeHtml(status.scientificInterpretations.join(", "))}</dd>
        <dt>Implementation</dt><dd>${escapeHtml(status.implementationStates.join(", "))}</dd>
        <dt>Evidence scope</dt><dd>${escapeHtml(status.evidenceScopes.join(", "))}</dd>
        <dt>Runtime</dt><dd>${escapeHtml(status.runtimeAdmissibilities.join(", "))}</dd>
        <dt>Authorization</dt><dd>${escapeHtml(status.authorizationTokens.join(", "))}</dd>
      </dl>
      <p class="status-copy">${escapeHtml(status.statusText)}</p>
      <p class="status-copy">${escapeHtml(status.authorizationText)}</p>
    </section>
    ${mechanism.alternativeGroups.length ? `<section class="inspector-section"><h3>Alternative groups</h3>${mechanism.alternativeGroups.map((group) => `<article class="port-card"><h4>${escapeHtml(group.id)}</h4><p class="port-meta">${escapeHtml(group.selectionCardinality)}</p>${notesList(group.notes)}</article>`).join("")}</section>` : ""}
    ${mechanism.outputGroups?.length ? `<section class="inspector-section"><h3>Output groups</h3>${mechanism.outputGroups.map((group) => `<article class="port-card"><h4>${escapeHtml(group.id)}</h4><p class="port-meta">${escapeHtml(group.selectionCardinality)} / ${escapeHtml(group.portIds.join(", "))}</p>${notesList(group.notes)}</article>`).join("")}</section>` : ""}
    ${mechanism.conditionalConstraints?.length ? `<section class="inspector-section"><h3>Conditional constraints</h3>${mechanism.conditionalConstraints.map((constraint) => `<article class="port-card"><h4>${escapeHtml(constraint.id)}</h4><p class="status-copy"><code>if ${escapeHtml(JSON.stringify(constraint.if))}</code></p><p class="status-copy"><code>then ${escapeHtml(JSON.stringify(constraint.then))}</code></p>${notesList(constraint.notes)}</article>`).join("")}</section>` : ""}
    <section class="inspector-section port-group product-port-group">
      <h3>Product inputs</h3>
      ${inputGroups.productInputs.length ? inputGroups.productInputs.map((port) => renderPort(mechanism.id, port, "input")).join("") : `<p class="status-copy">No natural product input is declared.</p>`}
    </section>
    <section class="inspector-section port-group context-port-group">
      <h3>Configuration and controls</h3>
      ${inputGroups.configurationAndControls.length ? inputGroups.configurationAndControls.map((port) => renderPort(mechanism.id, port, "input")).join("") : `<p class="status-copy">No configuration or control input is declared.</p>`}
    </section>
    <section class="inspector-section port-group context-port-group">
      <h3>Evaluation and custody context</h3>
      ${inputGroups.evaluationAndCustody.length ? inputGroups.evaluationAndCustody.map((port) => renderPort(mechanism.id, port, "input")).join("") : `<p class="status-copy">No evaluation or custody-context input is declared.</p>`}
    </section>
    <section class="inspector-section">
      <h3>Typed output ports / mechanism to artifact</h3>
      ${mechanism.outputPorts.map((port) => renderPort(mechanism.id, port, "output")).join("")}
    </section>
    <section class="inspector-section">
      <h3>Source and typing provenance</h3>
      <a href="/MECHANISMS.html#L${mechanism.source.headingLine}" target="_blank" rel="noreferrer">${escapeHtml(mechanism.source.path)}:${mechanism.source.headingLine}</a>
      <span class="source-citation">${escapeHtml(mechanism.source.headingText)}</span>
      <p class="status-copy">Ports shown here are the generated graph typing for this exact census ID. The semantic validator checks declaration consistency; shared artifact IDs do not establish source-backed compatibility.</p>
    </section>`;
}

function renderInspector(node) {
  if (!node) return renderEmptyInspector();
  if (node.kind === "artifact") renderArtifactInspector(node);
  else renderMechanismInspector(node);
}

function renderProductConnectivity() {
  const focus = state.analysis.productFocus;
  const materializers = focus.materializerGaps;
  if (
    materializers.length !== 1
    || materializers[0].artifactTypeId !== RIGHT_ANCHOR_ID
    || materializers[0].status !== "confirmed-structural-gap"
  ) {
    throw new Error("Generated product connectivity must contain the single exact v3 materializer gap.");
  }
  const groups = buildOpenContractGroups(state.graph, state.analysis);
  const total = groups.reduce((count, group) => count + group.rows.length, 0);
  elements.materializerContract.dataset.connectivityNodeKey = nodeKey("artifact", RIGHT_ANCHOR_ID);
  elements.materializerContract.innerHTML = `<span>Confirmed structural gap</span><strong>No materializer for exact <code>${escapeHtml(RIGHT_ANCHOR_ID)}</code>.</strong>`;
  elements.openInputCount.textContent = String(focus.openInputContracts.length);
  elements.openAlternativeCount.textContent = String(focus.openAlternativeContracts.length);
  elements.openOutputCount.textContent = String(focus.openOutputContracts.length);
  elements.openContractCount.textContent = String(total);
  elements.openContractGroups.innerHTML = groups.map((group) => `
    <section class="contract-group">
      <div class="contract-group-heading"><span>${escapeHtml(group.label)}</span><b>${group.rows.length}</b></div>
      <div class="contract-rows">
        ${group.rows.length ? group.rows.map((row) => `
          <button class="contract-row" type="button" data-connectivity-node-key="${escapeHtml(row.targetKey)}">
            <strong>${escapeHtml(row.label)}</strong>
            <small>${escapeHtml(row.detail)}</small>
          </button>`).join("") : `<p class="status-copy">No generated rows.</p>`}
      </div>
    </section>`).join("");
}

function updateGeneratedMetadata() {
  const counts = state.analysis.counts;
  const incidenceCount = counts.inputPorts + counts.outputPorts;
  elements.snapshot.textContent = `schema ${state.graph.schemaVersion} / snapshot ${formatDate(state.analysis.generatedAt)} / commit ${state.graph.sourceSnapshot.gitCommit.slice(0, 12)}`;
  elements.generatedCounts.innerHTML = `
    <span>Artifact contracts</span><b>${counts.artifactTypes}</b>
    <span>Mechanisms</span><b>${counts.mechanisms}</b>
    <span>Typed port incidences</span><b>${incidenceCount}</b>
    <span>Compatibility bridges</span><b>${counts.compatibilityHyperedges}</b>
    <span>Never-provided types</span><b>${counts.neverProvidedInputTypes}</b>
    <span>Never-provided ports</span><b>${counts.neverProvidedInputPorts}</b>
    <span>Never-used types</span><b>${counts.neverUsedOutputTypes}</b>
    <span>Never-used ports</span><b>${counts.neverUsedOutputPorts}</b>
    <span>Alternative-group obligations</span><b>${state.analysis.obligationCounts.collectiveAlternativeGroupObligations}</b>
    <span>Optional absences</span><b>${state.analysis.obligationCounts.optionalAbsences}</b>
    <span>Unused alternatives</span><b>${state.analysis.obligationCounts.unusedAlternatives}</b>
    <span>Layout extent</span><b>${Math.round(state.layout.width)} x ${Math.round(state.layout.height)}</b>`;
  renderProductConnectivity();
}

function centerNextSearchMatch() {
  const visibleMatches = state.searchMatches.filter((key) => state.visibleKeys.has(key));
  if (!visibleMatches.length) return;
  state.searchCursor = (state.searchCursor + 1) % visibleMatches.length;
  centerNode(visibleMatches[state.searchCursor]);
}

function resetRegistryConstraints() {
  state.capability = "";
  state.category = "";
  state.orphanClass = "";
  state.planes = new Set(["runtime", "development", "governance"]);
  elements.capabilityFilter.value = "";
  elements.categoryFilter.value = "";
  elements.orphanFilter.value = "";
  elements.searchInput.value = "";
  elements.searchContext.checked = false;
  for (const input of elements.planeFilters.querySelectorAll("input")) input.checked = true;
}

function revealInFullRegistry(key) {
  resetRegistryConstraints();
  state.mode = "full";
  updateProjection({ fit: false });
  centerNode(key);
  announce(`Revealed ${state.model.nodeByKey.get(key)?.label ?? key} in the Full registry.`);
}

function bindInteractions() {
  elements.modeControls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    if (state.mode === "full") resetRegistryConstraints();
    updateProjection({ fit: state.mode !== "product" });
    if (state.mode === "product") requestAnimationFrame(frameReadableProductView);
  });

  elements.productOverlay.addEventListener("change", () => {
    state.productOverlay = elements.productOverlay.checked;
    updateProjection({ fit: false });
    announce(`${state.productOverlay ? "Added" : "Removed"} the generated evaluation, governance, and research custody overlay without changing the current map view.`);
  });

  elements.showAllProductContracts.addEventListener("change", () => {
    state.showAllProductContracts = elements.showAllProductContracts.checked;
    updateProjection({ fit: false });
    announce(`${state.showAllProductContracts ? "Showing" : "Hiding"} leaf and open product contracts without changing the current map view.`);
  });

  elements.productConnectivity.addEventListener("click", (event) => {
    const button = event.target.closest("[data-connectivity-node-key]");
    if (!button) return;
    const key = button.dataset.connectivityNodeKey;
    if (state.visibleKeys.has(key)) centerNode(key);
    else selectNode(key);
  });

  elements.capabilityFilter.addEventListener("change", () => {
    state.capability = elements.capabilityFilter.value;
    updateProjection();
  });
  elements.categoryFilter.addEventListener("change", () => {
    state.category = elements.categoryFilter.value;
    updateProjection();
  });
  elements.orphanFilter.addEventListener("change", () => {
    state.orphanClass = elements.orphanFilter.value;
    updateProjection();
  });
  elements.planeFilters.addEventListener("change", () => {
    state.planes = new Set([...elements.planeFilters.querySelectorAll("input:checked")].map((input) => input.value));
    updateProjection();
  });
  elements.clearFilters.addEventListener("click", () => {
    resetRegistryConstraints();
    updateProjection();
  });

  elements.searchInput.addEventListener("input", () => updateProjection({ fit: elements.searchContext.checked }));
  elements.searchContext.addEventListener("change", () => updateProjection());
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    centerNextSearchMatch();
  });
  elements.fitButton.addEventListener("click", () => {
    fitVisible();
    announce("Fit all currently visible nodes.");
  });
  elements.resetButton.addEventListener("click", () => {
    resetMap();
    announce("Reset map view to the full layout extent.");
  });
  elements.zoomInButton.addEventListener("click", () => zoomFromCenter(1.25));
  elements.zoomOutButton.addEventListener("click", () => zoomFromCenter(0.8));
  elements.visibleNodeNavigator.addEventListener("change", () => {
    const key = elements.visibleNodeNavigator.value;
    if (key) centerNode(key);
  });

  const startPan = (record, suppressClick = false) => {
    state.gesture = {
      type: "pan",
      id: record.id,
      startX: record.clientX,
      startY: record.clientY,
      viewX: state.view.x,
      viewY: state.view.y,
      suppressClick,
    };
  };

  const startPinch = () => {
    const points = [...state.pointers.values()].sort((left, right) => left.id - right.id).slice(0, 2);
    if (points.length < 2) return;
    const rect = elements.graphCanvas.getBoundingClientRect();
    const centerX = (points[0].clientX + points[1].clientX) / 2 - rect.left;
    const centerY = (points[0].clientY + points[1].clientY) / 2 - rect.top;
    const distance = Math.max(1, Math.hypot(
      points[1].clientX - points[0].clientX,
      points[1].clientY - points[0].clientY,
    ));
    for (const point of points) point.moved = true;
    state.gesture = {
      type: "pinch",
      startDistance: distance,
      startScale: state.view.scale,
      worldX: (centerX - state.view.x) / state.view.scale,
      worldY: (centerY - state.view.y) / state.view.scale,
    };
  };

  elements.graphCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    elements.graphCanvas.focus({ preventScroll: true });
    try {
      elements.graphCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by accessibility tooling may not own capture.
    }
    const record = {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
    };
    state.pointers.set(event.pointerId, record);
    if (state.pointers.size >= 2) startPinch();
    else startPan(record);
    elements.graphCanvas.classList.add("panning");
  });

  elements.graphCanvas.addEventListener("pointermove", (event) => {
    const record = state.pointers.get(event.pointerId);
    if (record) {
      record.clientX = event.clientX;
      record.clientY = event.clientY;
      if (state.pointers.size >= 2) {
        if (state.gesture?.type !== "pinch") startPinch();
        const points = [...state.pointers.values()].sort((left, right) => left.id - right.id).slice(0, 2);
        const rect = elements.graphCanvas.getBoundingClientRect();
        const centerX = (points[0].clientX + points[1].clientX) / 2 - rect.left;
        const centerY = (points[0].clientY + points[1].clientY) / 2 - rect.top;
        const distance = Math.max(1, Math.hypot(
          points[1].clientX - points[0].clientX,
          points[1].clientY - points[0].clientY,
        ));
        const nextScale = Math.max(0.025, Math.min(
          2.6,
          state.gesture.startScale * distance / state.gesture.startDistance,
        ));
        state.view.scale = nextScale;
        state.view.x = centerX - state.gesture.worldX * nextScale;
        state.view.y = centerY - state.gesture.worldY * nextScale;
        for (const point of points) point.moved = true;
      } else if (state.gesture?.type === "pan" && state.gesture.id === event.pointerId) {
        const deltaX = event.clientX - state.gesture.startX;
        const deltaY = event.clientY - state.gesture.startY;
        if (Math.hypot(deltaX, deltaY) > 3) record.moved = true;
        state.view.x = state.gesture.viewX + deltaX;
        state.view.y = state.gesture.viewY + deltaY;
      }
      elements.tooltip.hidden = true;
      requestRender();
      return;
    }
    const node = hitNode(event.clientX, event.clientY);
    const nextKey = node?.key ?? null;
    if (nextKey !== state.hoveredKey) {
      state.hoveredKey = nextKey;
      requestRender();
    }
    showTooltip(node, event.clientX, event.clientY);
  });

  const endPointer = (event) => {
    const record = state.pointers.get(event.pointerId);
    if (!record) return;
    const wasSinglePan = state.pointers.size === 1
      && state.gesture?.type === "pan"
      && state.gesture.id === event.pointerId;
    const click = wasSinglePan && !record.moved && !state.gesture.suppressClick && event.type === "pointerup";
    state.pointers.delete(event.pointerId);
    if (click) {
      const node = hitNode(event.clientX, event.clientY);
      selectNode(node?.key ?? null);
    }
    if (state.pointers.size === 1) {
      startPan([...state.pointers.values()][0], true);
    } else if (state.pointers.size === 0) {
      state.gesture = null;
      elements.graphCanvas.classList.remove("panning");
    } else {
      startPinch();
    }
  };
  elements.graphCanvas.addEventListener("pointerup", endPointer);
  elements.graphCanvas.addEventListener("pointercancel", endPointer);
  elements.graphCanvas.addEventListener("pointerleave", () => {
    if (state.pointers.size === 0) {
      state.hoveredKey = null;
      elements.tooltip.hidden = true;
      requestRender();
    }
  });

  elements.graphCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = elements.graphCanvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(factor, pointerX, pointerY);
  }, { passive: false });

  elements.minimap.addEventListener("pointerdown", (event) => {
    const transform = elements.minimap._mapTransform;
    if (!transform) return;
    const rect = elements.minimap.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - transform.offsetX) / transform.scale;
    const worldY = (event.clientY - rect.top - transform.offsetY) / transform.scale;
    const graphRect = elements.graphCanvas.getBoundingClientRect();
    state.view.x = graphRect.width / 2 - worldX * state.view.scale;
    state.view.y = graphRect.height / 2 - worldY * state.view.scale;
    requestRender();
  });

  elements.inspector.addEventListener("click", (event) => {
    if (event.target.closest(".inspector-close")) {
      selectNode(null);
      elements.graphCanvas.focus();
      return;
    }
    const revealButton = event.target.closest("[data-reveal-key]");
    if (revealButton) {
      revealInFullRegistry(revealButton.dataset.revealKey);
      return;
    }
    const button = event.target.closest("[data-node-key]");
    if (!button) return;
    const key = button.dataset.nodeKey;
    if (!state.visibleKeys.has(key)) return;
    centerNode(key);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selectNode(null);
      elements.graphCanvas.focus();
      event.preventDefault();
      return;
    }
    const editable = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLButtonElement;
    if (editable) return;
    const panAmount = 70;
    if (event.key === "ArrowLeft") state.view.x += panAmount;
    else if (event.key === "ArrowRight") state.view.x -= panAmount;
    else if (event.key === "ArrowUp") state.view.y += panAmount;
    else if (event.key === "ArrowDown") state.view.y -= panAmount;
    else if (event.key === "+" || event.key === "=") zoomFromCenter(1.25);
    else if (event.key === "-" || event.key === "_") zoomFromCenter(0.8);
    else if (event.key === "Home" || event.key.toLowerCase() === "f") fitVisible();
    else if (event.key === "Enter" && state.selectedKey) centerNode(state.selectedKey, false);
    else return;
    event.preventDefault();
    requestRender();
  });
  new ResizeObserver(() => requestRender()).observe(elements.canvasWrap);
}

async function initialize() {
  try {
    const [graph, analysis] = await Promise.all([
      requestJson("/api/graph"),
      requestJson("/api/orphans"),
    ]);
    assertConsumerPayloadIntegrity(graph, analysis);
    state.graph = graph;
    state.analysis = analysis;
    state.model = buildModel(graph, analysis);
    state.layout = layoutGraph(state.model);
    populateControls(state.model);
    elements.secondaryControls.open = false;
    elements.openContracts.open = false;
    bindInteractions();
    state.initialized = true;
    updateProjection({ fit: false });
    updateGeneratedMetadata();
    renderEmptyInspector();
    elements.loading.hidden = true;
    requestAnimationFrame(frameReadableProductView);
  } catch (error) {
    elements.loading.classList.add("error");
    elements.loading.setAttribute("role", "alert");
    elements.loading.setAttribute("aria-live", "assertive");
    elements.loading.setAttribute("aria-atomic", "true");
    elements.loading.textContent = `Fatal data integrity error: ${error instanceof Error ? error.message : String(error)}`;
    elements.visibleCount.textContent = "Fatal data integrity error; graph not rendered.";
    elements.graphCanvas.setAttribute("aria-hidden", "true");
    elements.minimap.setAttribute("aria-hidden", "true");
  }
}

if (browserEnvironment) initialize();
