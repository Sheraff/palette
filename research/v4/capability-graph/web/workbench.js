const FORBIDDEN_PRODUCT_LINE_KINDS = new Set([
  "configuration",
  "control",
  "custody",
  "diagnostic",
  "model",
  "provenance",
  "report",
  "review",
  "sidecar",
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, child]) => [key, canonicalize(child)]));
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function digestHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function branchPort(port) {
  return {
    id: port.id,
    artifactTypeId: port.artifactTypeId,
    cardinality: port.cardinality,
    constraints: (port.valueConstraints ?? []).map(({ notes: _, ...constraint }) => constraint),
    identityPaths: [],
  };
}

function allInputPorts(contract) {
  return contract.productInputs.flatMap((group) => group.ports);
}

function allOutputPorts(contract) {
  return contract.outputBranches.flatMap((branch) => branch.ports);
}

export function isForbiddenPlannedLineArtifact(artifactTypeId) {
  const kind = artifactTypeId.split(".")[1] ?? "";
  return FORBIDDEN_PRODUCT_LINE_KINDS.has(kind);
}

async function verifyCanonicalDigest(value, digest, { basis, label }, cryptoProvider) {
  if (
    digest?.algorithm !== "sha256"
    || digest.basis !== basis
    || !/^[0-9a-f]{64}$/u.test(digest.sha256)
  ) {
    throw new Error(`Branch analysis ${label} digest is absent or malformed.`);
  }
  if (!cryptoProvider?.subtle) throw new Error(`Web Crypto is unavailable for ${label} verification.`);
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const actual = digestHex(await cryptoProvider.subtle.digest("SHA-256", bytes));
  if (actual !== digest.sha256) {
    throw new Error(`${label} digest mismatch: expected ${digest.sha256}, received ${actual}.`);
  }
  return actual;
}

export function verifyBranchPlanDigest(branchPlan, branchAnalysis, cryptoProvider = globalThis.crypto) {
  return verifyCanonicalDigest(
    branchPlan,
    branchAnalysis?.branchPlanDigest,
    { basis: "canonical-json", label: "Branch plan" },
    cryptoProvider,
  );
}

export function verifyCapabilityGraphDigest(graph, branchAnalysis, cryptoProvider = globalThis.crypto) {
  return verifyCanonicalDigest(
    graph,
    branchAnalysis?.capabilityGraphDigest,
    { basis: "canonical-json-utf8", label: "Capability graph" },
    cryptoProvider,
  );
}

function humanizeLayer(layer) {
  if (layer === "raster") return "Artwork file & raster foundations";
  if (layer === "evidence") return "Image evidence";
  if (layer === "publication") return "Admission & publication";
  return layer
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function assertBranchPayloadIntegrity(graph, branchPlan, branchAnalysis) {
  if (branchPlan?.documentKind !== "capability-branch-plan" || branchPlan.schemaVersion !== "1.0.0") {
    throw new Error("Branch plan is absent or malformed; refusing to render the planned workbench.");
  }
  if (branchAnalysis?.documentKind !== "capability-branch-analysis" || branchAnalysis.schemaVersion !== "1.0.0") {
    throw new Error("Branch analysis is absent or malformed; refusing to render the planned workbench.");
  }
  const retained = branchPlan.currentMechanisms.filter((entry) => entry.disposition === "retained").length;
  const condemned = branchPlan.currentMechanisms.filter((entry) => entry.disposition === "condemned").length;
  const sidecars = branchPlan.currentMechanisms.filter((entry) => entry.disposition === "sidecar").length;
  const successful = branchAnalysis.recipes.filter((recipe) => recipe.successful).length;
  const comparisons = [
    [retained, branchAnalysis.inventoryCounts.currentRetained, "retained mechanism count"],
    [condemned, branchAnalysis.inventoryCounts.currentCondemned, "condemned mechanism count"],
    [sidecars, branchAnalysis.inventoryCounts.totalSidecarInspectors, "sidecar mechanism count"],
    [branchPlan.proposedMechanisms.length, branchAnalysis.inventoryCounts.proposedMechanisms, "proposed mechanism count"],
    [branchPlan.recipes.length, branchAnalysis.recipeCounts.declared, "declared recipe count"],
    [successful, branchAnalysis.recipeCounts.successful, "type-closed recipe count"],
    [graph.mechanisms.length, branchAnalysis.builtMetrics.currentMechanisms, "built mechanism count"],
  ];
  for (const [actual, expected, label] of comparisons) {
    if (actual !== expected) throw new Error(`Branch ${label} does not match its generated analysis.`);
  }
  if (branchPlan.recipes.some((recipe) => recipe.preferred !== false)) {
    throw new Error("A planned recipe is marked preferred; refusing to present it as an interchangeable option.");
  }
  const connectedIds = new Set([
    ...branchAnalysis.plannedConnected.currentMechanismIds,
    ...branchAnalysis.plannedConnected.proposedMechanismIds,
  ]);
  const essentialIds = branchAnalysis.essentialWitnesses.map((entry) => entry.mechanismId);
  if (
    essentialIds.length !== connectedIds.size
    || new Set(essentialIds).size !== connectedIds.size
    || essentialIds.some((id) => !connectedIds.has(id))
  ) {
    throw new Error("Branch essential-witness coverage does not match the active planned mechanism set.");
  }
  const workbenchCurrentIds = new Set(branchPlan.currentMechanisms
    .filter((entry) => entry.disposition === "retained")
    .map((entry) => entry.mechanismId));
  const workbenchProposedIds = new Set(branchPlan.proposedMechanisms.map((entry) => entry.id));
  const workbenchIds = new Set([...workbenchCurrentIds, ...workbenchProposedIds]);
  if (!Array.isArray(branchAnalysis.workbenchMechanisms) || !Array.isArray(branchAnalysis.workbenchLayers)) {
    throw new Error("Generated workbench mechanism or layer metadata is absent or malformed.");
  }
  const workbenchMechanismById = new Map();
  for (const entry of branchAnalysis.workbenchMechanisms) {
    const expectedOrigin = workbenchCurrentIds.has(entry.mechanismId)
      ? "current"
      : workbenchProposedIds.has(entry.mechanismId)
        ? "proposed"
        : null;
    if (
      typeof entry.mechanismId !== "string"
      || typeof entry.workbenchLayer !== "string"
      || !entry.workbenchLayer
      || entry.origin !== expectedOrigin
      || workbenchMechanismById.has(entry.mechanismId)
    ) {
      throw new Error("Generated workbench mechanism metadata is absent, duplicated, or inconsistent.");
    }
    workbenchMechanismById.set(entry.mechanismId, entry);
  }
  if (workbenchMechanismById.size !== workbenchIds.size) {
    throw new Error("Generated workbench mechanism metadata does not exactly cover the planned workbench mechanism set.");
  }
  const layerIds = new Set();
  const layerByMechanismId = new Map();
  for (const layer of branchAnalysis.workbenchLayers) {
    if (
      typeof layer.workbenchLayer !== "string"
      || !layer.workbenchLayer
      || layerIds.has(layer.workbenchLayer)
      || !Array.isArray(layer.currentMechanismIds)
      || !Array.isArray(layer.proposedMechanismIds)
    ) {
      throw new Error("Generated workbench layer metadata is absent, duplicated, or malformed.");
    }
    layerIds.add(layer.workbenchLayer);
    for (const [origin, mechanismIds] of [
      ["current", layer.currentMechanismIds],
      ["proposed", layer.proposedMechanismIds],
    ]) {
      for (const mechanismId of mechanismIds) {
        const metadata = workbenchMechanismById.get(mechanismId);
        if (
          layerByMechanismId.has(mechanismId)
          || metadata?.origin !== origin
          || metadata.workbenchLayer !== layer.workbenchLayer
        ) {
          throw new Error(`${mechanismId}: generated workbench layer membership is duplicated or inconsistent.`);
        }
        layerByMechanismId.set(mechanismId, layer.workbenchLayer);
      }
    }
  }
  if (layerByMechanismId.size !== workbenchIds.size) {
    throw new Error("Generated workbench layers do not assign every planned workbench mechanism exactly once.");
  }
  const successfulRecipeById = new Map(branchAnalysis.recipes
    .filter((recipe) => recipe.successful)
    .map((recipe) => [recipe.recipeId, recipe]));
  for (const witness of branchAnalysis.essentialWitnesses) {
    if (!witness.recipeIds.length || witness.recipeIds.some((recipeId) =>
      !successfulRecipeById.get(recipeId)?.essentialMechanismIds.includes(witness.mechanismId))) {
      throw new Error(`${witness.mechanismId}: generated essential witnesses are not successful removal-test witnesses.`);
    }
  }
  const slotIds = new Set();
  for (const slot of branchAnalysis.interchangeabilitySlots) {
    const witnessByMechanismId = new Map(slot.cleanWitnesses.map((witness) => [witness.mechanismId, witness]));
    if (
      !slot.slotId
      || slotIds.has(slot.slotId)
      || slot.mechanismIds.length < 2
      || new Set(slot.mechanismIds).size !== slot.mechanismIds.length
      || slot.cleanWitnesses.length !== slot.mechanismIds.length
      || slot.mechanismIds.some((mechanismId) => !witnessByMechanismId.has(mechanismId))
      || !slot.comparisons.length
    ) {
      throw new Error("Branch interchangeability slot metadata is absent or malformed.");
    }
    slotIds.add(slot.slotId);
    for (const witness of slot.cleanWitnesses) {
      if (!witness.recipeIds.length || witness.recipeIds.some((recipeId) =>
        !successfulRecipeById.get(recipeId)?.essentialMechanismIds.includes(witness.mechanismId))) {
        throw new Error(`${slot.slotId}: clean witness metadata is not backed by successful essential recipes.`);
      }
    }
    for (const comparison of slot.comparisons) {
      const leftRecipes = witnessByMechanismId.get(comparison.leftMechanismId)?.recipeIds ?? [];
      const rightRecipes = witnessByMechanismId.get(comparison.rightMechanismId)?.recipeIds ?? [];
      if (
        !leftRecipes.includes(comparison.leftRecipeId)
        || !rightRecipes.includes(comparison.rightRecipeId)
        || !/^[0-9a-f]{64}$/u.test(comparison.normalizedSurroundingSha256)
      ) {
        throw new Error(`${slot.slotId}: clean substitution comparison is absent or malformed.`);
      }
    }
  }
}

function currentContract(mechanism, entry, artifactById, demotions) {
  const excluded = new Set(entry.excludedProductPorts ?? []);
  const productInput = (port) =>
    port.inputClass === "natural"
    && artifactById.get(port.artifactTypeId)?.productFocus === "product-flow"
    && !demotions.has(port.artifactTypeId)
    && !isForbiddenPlannedLineArtifact(port.artifactTypeId);
  const productInputs = mechanism.inputPorts
    .filter((port) => productInput(port) && port.requirement === "required" && !excluded.has(`input:${port.id}`))
    .map((port) => ({ id: `required-${port.id}`, mode: "all", ports: [branchPort(port)] }));
  for (const group of mechanism.alternativeGroups) {
    const ports = mechanism.inputPorts
      .filter((port) => port.alternativeGroupId === group.id && productInput(port) && !excluded.has(`input:${port.id}`))
      .map(branchPort);
    if (ports.length) productInputs.push({ id: group.id, mode: group.selectionCardinality, ports });
  }
  const outputs = mechanism.outputPorts
    .filter((port) =>
      artifactById.get(port.artifactTypeId)?.productFocus === "product-flow"
      && !demotions.has(port.artifactTypeId)
      && !excluded.has(`output:${port.id}`)
      && !isForbiddenPlannedLineArtifact(port.artifactTypeId))
    .map((port) => ({
      ...branchPort(port),
      cardinality: entry.outputCardinalityOverrides?.[port.id] ?? port.cardinality,
    }));
  return {
    id: mechanism.id,
    origin: "existing",
    title: mechanism.title,
    operation: entry.replacementContract?.reason ?? mechanism.title,
    productInputs: entry.replacementContract?.productInputs ?? productInputs,
    outputBranches: entry.replacementContract?.productOutputs ?? [{ id: "success", ports: outputs }],
    fixedConfigRefs: mechanism.inputPorts
      .filter((port) => port.requirement === "configuration")
      .map((port) => `${mechanism.id}:${port.id}:${port.artifactTypeId}`)
      .sort(compareText),
    requiredNonProductInputs: mechanism.inputPorts
      .filter((port) => port.requirement === "required" && !productInput(port))
      .map(branchPort)
      .sort((left, right) => compareText(left.id, right.id)),
    implementationAvailable: mechanism.censusStatus.implementationStates.includes("live"),
    implementationStatus: `Existing repository state: ${mechanism.censusStatus.implementationStates.join(", ") || "unspecified"}`,
  };
}

function proposedContract(mechanism, proposedArtifactById) {
  const productPort = (port) =>
    proposedArtifactById.get(port.artifactTypeId)?.kind !== "sidecar"
    && !isForbiddenPlannedLineArtifact(port.artifactTypeId);
  return {
    id: mechanism.id,
    origin: "proposed",
    title: mechanism.title,
    operation: mechanism.operation,
    productInputs: mechanism.productInputs
      .map((group) => ({ ...group, ports: group.ports.filter(productPort) }))
      .filter((group) => group.ports.length),
    outputBranches: mechanism.productOutputs
      .map((branch) => ({ ...branch, ports: branch.ports.filter(productPort) }))
      .filter((branch) => branch.ports.length),
    fixedConfigRefs: mechanism.readiness.fixedConfigRefs,
    requiredNonProductInputs: mechanism.readiness.requiredNonProductInputs,
    implementationAvailable: mechanism.readiness.implementationAvailable,
    implementationStatus: mechanism.readiness.implementationAvailable
      ? "Proposed implementation registered"
      : "Missing mechanism to build; implementation unavailable",
  };
}

function edgeKey(edge) {
  return [
    edge.sourceId,
    edge.producerPortId,
    edge.artifactTypeId,
    edge.targetId,
    edge.consumerPortId,
  ].join("\u0000");
}

export function indexRouteOccurrences(steps) {
  const occurrences = new Map();
  steps.forEach((step, index) => {
    if (!occurrences.has(step.mechanismId)) occurrences.set(step.mechanismId, []);
    occurrences.get(step.mechanismId).push({ ordinal: index + 1, instanceId: step.instanceId });
  });
  return occurrences;
}

export function buildBranchWorkbench(graph, branchPlan, branchAnalysis) {
  assertBranchPayloadIntegrity(graph, branchPlan, branchAnalysis);
  const currentById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const proposedById = new Map(branchPlan.proposedMechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const proposedArtifactById = new Map(branchPlan.proposedArtifacts.map((artifact) => [artifact.id, artifact]));
  const currentEntryById = new Map(branchPlan.currentMechanisms.map((entry) => [entry.mechanismId, entry]));
  const dispositionById = new Map(branchAnalysis.effectiveDispositions.map((entry) => [entry.mechanismId, entry]));
  const demotions = new Set(branchPlan.productArtifactDemotions);
  const contractById = new Map();
  const mechanismById = new Map();

  for (const workbenchMetadata of branchAnalysis.workbenchMechanisms) {
    const id = workbenchMetadata.mechanismId;
    const proposed = proposedById.get(id);
    const current = currentById.get(id);
    const disposition = dispositionById.get(id);
    if (!disposition || (!proposed && !current)) throw new Error(`${id}: connected mechanism payload is missing.`);
    const contract = proposed
      ? proposedContract(proposed, proposedArtifactById)
      : currentContract(current, currentEntryById.get(id), artifactById, demotions);
    const layer = workbenchMetadata.workbenchLayer;
    contractById.set(id, contract);
    mechanismById.set(id, {
      id,
      key: `planned:${id}`,
      title: contract.title,
      label: contract.title,
      operation: contract.operation,
      origin: proposed ? "proposed" : "existing",
      layer,
      contract,
      sourceRef: proposed?.sourceRef ?? `${current.source.path}:${current.source.headingLine}`,
      sourceLine: current?.source.headingLine,
      witnessRecipeIds: disposition.witnessRecipeIds,
      sidecars: disposition.sidecars,
      readiness: {
        implementationAvailable: contract.implementationAvailable,
        implementationStatus: contract.implementationStatus,
        fixedConfigRefs: contract.fixedConfigRefs,
        requiredNonProductInputs: contract.requiredNonProductInputs,
        fixtureAvailable: proposed?.readiness.fixtureAvailable ?? false,
        visualizationAvailable: proposed?.readiness.visualizationAvailable ?? false,
        humanScoreAvailable: proposed?.readiness.humanScoreAvailable ?? false,
      },
    });
  }

  const recipePlanById = new Map(branchPlan.recipes.map((recipe) => [recipe.id, recipe]));
  const recipeById = new Map();
  const edgeByKey = new Map();
  for (const analysisRecipe of branchAnalysis.recipes.filter((recipe) => recipe.successful)) {
    const declared = recipePlanById.get(analysisRecipe.recipeId);
    if (!declared) throw new Error(`${analysisRecipe.recipeId}: successful recipe declaration is missing.`);
    const routeOccurrences = indexRouteOccurrences(analysisRecipe.expandedSteps);
    recipeById.set(analysisRecipe.recipeId, {
      ...analysisRecipe,
      description: declared?.description ?? "",
      preferred: declared?.preferred ?? false,
      routeOccurrences,
    });
    const stepByInstance = new Map(analysisRecipe.expandedSteps.map((step) => [step.instanceId, step]));
    for (const consumerStep of analysisRecipe.expandedSteps) {
      const consumerContract = contractById.get(consumerStep.mechanismId);
      if (!consumerContract) continue;
      for (const binding of consumerStep.productBindings) {
        const port = allInputPorts(consumerContract).find((candidate) => candidate.id === binding.consumerPortId);
        if (!port || isForbiddenPlannedLineArtifact(port.artifactTypeId)) continue;
        const producerStep = stepByInstance.get(binding.producerInstanceId);
        const edge = {
          sourceId: producerStep?.mechanismId ?? "$source",
          targetId: consumerStep.mechanismId,
          producerPortId: binding.producerPortId,
          consumerPortId: binding.consumerPortId,
          artifactTypeId: port.artifactTypeId,
          recipeIds: new Set([analysisRecipe.recipeId]),
        };
        const key = edgeKey(edge);
        const existing = edgeByKey.get(key);
        if (existing) existing.recipeIds.add(analysisRecipe.recipeId);
        else edgeByKey.set(key, { ...edge, id: `planned-edge:${edgeByKey.size}` });
      }
    }
    const goalStep = stepByInstance.get(declared.goalBinding.producerInstanceId);
    const goalContract = goalStep ? contractById.get(goalStep.mechanismId) : undefined;
    const goalPort = goalContract
      ? allOutputPorts(goalContract).find((port) => port.id === declared.goalBinding.producerPortId)
      : undefined;
    if (goalStep && goalPort && !isForbiddenPlannedLineArtifact(goalPort.artifactTypeId)) {
      const edge = {
        sourceId: goalStep.mechanismId,
        targetId: "$goal",
        producerPortId: goalPort.id,
        consumerPortId: "$goal",
        artifactTypeId: goalPort.artifactTypeId,
        recipeIds: new Set([analysisRecipe.recipeId]),
      };
      const key = edgeKey(edge);
      const existing = edgeByKey.get(key);
      if (existing) existing.recipeIds.add(analysisRecipe.recipeId);
      else edgeByKey.set(key, { ...edge, id: `planned-edge:${edgeByKey.size}` });
    }
  }

  const edges = [...edgeByKey.values()].sort((left, right) => compareText(edgeKey(left), edgeKey(right)));
  const edgesByMechanismId = new Map([...mechanismById.keys()].map((id) => [id, []]));
  for (const edge of edges) {
    if (edgesByMechanismId.has(edge.sourceId)) edgesByMechanismId.get(edge.sourceId).push(edge);
    if (edgesByMechanismId.has(edge.targetId)) edgesByMechanismId.get(edge.targetId).push(edge);
  }

  const layers = branchAnalysis.workbenchLayers.map((generatedLayer) => {
    const id = generatedLayer.workbenchLayer;
    const mechanismIds = [
      ...generatedLayer.currentMechanismIds,
      ...generatedLayer.proposedMechanismIds,
    ];
    return {
      id,
      label: humanizeLayer(id),
      mechanismIds,
      existingCount: generatedLayer.currentMechanismIds.length,
      proposedCount: generatedLayer.proposedMechanismIds.length,
    };
  });

  const condemned = branchAnalysis.effectiveDispositions
    .filter((entry) => entry.effectiveDisposition === "condemned")
    .map((entry) => {
      const mechanism = currentById.get(entry.mechanismId);
      const disposition = currentEntryById.get(entry.mechanismId);
      return {
        id: entry.mechanismId,
        key: `condemned:${entry.mechanismId}`,
        title: mechanism.title,
        label: mechanism.title,
        status: "condemned",
        reason: entry.reason,
        sourceRef: `${mechanism.source.path}:${mechanism.source.headingLine}`,
        sourceLine: mechanism.source.headingLine,
        evidenceRefs: disposition.evidenceRefs ?? [`${mechanism.source.path}:${mechanism.source.headingLine}`],
        inputs: mechanism.inputPorts.map((port) => ({
          id: port.id,
          artifactTypeId: port.artifactTypeId,
          cardinality: port.cardinality,
          requirement: port.requirement,
        })),
        outputs: mechanism.outputPorts.map((port) => ({
          id: port.id,
          artifactTypeId: port.artifactTypeId,
          cardinality: port.cardinality,
        })),
        sidecars: entry.sidecars,
      };
    }).sort((left, right) => compareText(left.id, right.id));
  const condemnedById = new Map(condemned.map((entry) => [entry.id, entry]));

  const recipeFamilies = [...recipeById.values()]
    .reduce((families, recipe) => {
      if (!families.has(recipe.family)) families.set(recipe.family, []);
      families.get(recipe.family).push(recipe.recipeId);
      return families;
    }, new Map());
  for (const recipeIds of recipeFamilies.values()) recipeIds.sort(compareText);
  const interchangeabilitySlots = branchAnalysis.interchangeabilitySlots.map((slot) => ({
    ...slot,
    cleanWitnesses: slot.cleanWitnesses.map((witness) => ({
      ...witness,
      recipeIds: [...witness.recipeIds].sort(compareText),
    })),
    comparisons: [...slot.comparisons].sort((left, right) =>
      compareText(left.leftMechanismId, right.leftMechanismId)
      || compareText(left.rightMechanismId, right.rightMechanismId)),
  }));

  const missingHandoffs = branchPlan.proposedMechanisms.map((mechanism) => ({
    mechanismId: mechanism.id,
    operation: mechanism.operation,
    upstream: edges.filter((edge) => edge.targetId === mechanism.id),
    downstream: edges.filter((edge) => edge.sourceId === mechanism.id),
  }));

  const searchRecords = [
    ...[...mechanismById.values()].map((mechanism) => ({
      id: mechanism.id,
      key: mechanism.key,
      title: mechanism.title,
      status: mechanism.origin === "existing" ? "Existing" : "Missing mechanism to build",
      layer: mechanism.layer,
      text: [
        mechanism.id,
        mechanism.title,
        mechanism.operation,
        mechanism.origin,
        mechanism.origin === "proposed" ? "missing mechanism to build" : "existing retained",
        mechanism.sourceRef,
        ...allInputPorts(mechanism.contract).flatMap((port) => [port.id, port.artifactTypeId]),
        ...allOutputPorts(mechanism.contract).flatMap((port) => [port.id, port.artifactTypeId]),
      ].join(" ").toLowerCase(),
    })),
    ...condemned.map((mechanism) => ({
      id: mechanism.id,
      key: mechanism.key,
      title: mechanism.title,
      status: "Condemned formulation",
      layer: "research",
      text: [
        mechanism.id,
        mechanism.title,
        mechanism.reason,
        "condemned formulation",
        ...mechanism.evidenceRefs,
        ...mechanism.inputs.flatMap((port) => [port.id, port.artifactTypeId]),
        ...mechanism.outputs.flatMap((port) => [port.id, port.artifactTypeId]),
      ].join(" ").toLowerCase(),
    })),
  ];

  return {
    graph,
    branchPlan,
    branchAnalysis,
    mechanismById,
    condemnedById,
    contractById,
    recipeById,
    recipeFamilies,
    interchangeabilitySlots,
    edgesByMechanismId,
    mechanisms: [...mechanismById.values()],
    condemned,
    edges,
    layers,
    defaultLayerId: layers[0]?.id,
    missingHandoffs,
    searchRecords,
  };
}

export function buildLayerProjection(workbench, layerId) {
  const layer = workbench.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Unknown planned layer: ${layerId}`);
  const selectedIds = new Set(layer.mechanismIds);
  const contextIds = new Set();
  const upstreamContextIds = new Set();
  const downstreamContextIds = new Set();
  const edges = workbench.edges.filter((edge) => {
    const incident = selectedIds.has(edge.sourceId) || selectedIds.has(edge.targetId);
    if (!incident) return false;
    if (workbench.mechanismById.has(edge.sourceId) && !selectedIds.has(edge.sourceId)) {
      contextIds.add(edge.sourceId);
      upstreamContextIds.add(edge.sourceId);
    }
    if (workbench.mechanismById.has(edge.targetId) && !selectedIds.has(edge.targetId)) {
      contextIds.add(edge.targetId);
      downstreamContextIds.add(edge.targetId);
    }
    return true;
  });
  return {
    layer,
    selectedIds,
    contextIds,
    upstreamContextIds,
    downstreamContextIds,
    mechanismIds: new Set([...selectedIds, ...contextIds]),
    edges,
  };
}

export function searchBranchWorkbench(workbench, query) {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return workbench.searchRecords
    .filter((record) => terms.every((term) => record.text.includes(term)))
    .sort((left, right) => compareText(left.status, right.status) || compareText(left.id, right.id));
}

export function plannedInspectorData(workbench, mechanismId) {
  const condemned = workbench.condemnedById.get(mechanismId);
  if (condemned) return { kind: "condemned", mechanism: condemned };
  const mechanism = workbench.mechanismById.get(mechanismId);
  if (!mechanism) return undefined;
  return {
    kind: "planned",
    mechanism,
    inputs: mechanism.contract.productInputs,
    outputs: mechanism.contract.outputBranches,
    upstream: workbench.edges.filter((edge) => edge.targetId === mechanismId),
    downstream: workbench.edges.filter((edge) => edge.sourceId === mechanismId),
    witnessRecipes: mechanism.witnessRecipeIds.map((id) => workbench.recipeById.get(id)).filter(Boolean),
    sidecars: [
      { kind: "Known-good fixture", id: mechanism.sidecars.fixtureId, available: mechanism.readiness.fixtureAvailable },
      { kind: "Visualization", id: mechanism.sidecars.visualizationId, available: mechanism.readiness.visualizationAvailable },
      { kind: "Human score", id: mechanism.sidecars.humanScoreId, available: mechanism.readiness.humanScoreAvailable },
    ],
  };
}
