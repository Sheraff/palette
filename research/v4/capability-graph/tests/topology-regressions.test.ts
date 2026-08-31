import assert from "node:assert/strict";
import test from "node:test";

import type {
  ArtifactType,
  InputPort,
  MechanismRecord,
  OutputPort,
  PortReference,
} from "../src/types.ts";
import {
  RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  type MechanismFocusClass,
} from "../src/types.ts";
import { deriveCompatibilityTopology, deriveProductFocus } from "../src/validate.ts";
import { loadFixtures } from "./helpers.ts";

function referenceKey(reference: PortReference): string {
  return `${reference.mechanismId}\u0000${reference.direction}\u0000${reference.portId}`;
}

function sortedReferenceKeys(references: readonly PortReference[]): string[] {
  return references.map(referenceKey).sort();
}

function aggregateUnusedDisposition(
  artifact: ArtifactType,
  producers: readonly { port: OutputPort }[],
): string {
  if (artifact.boundaryClassification === "product-goal") return "product-goal-terminal";
  if (
    artifact.intentionalTerminalPurpose ||
    producers.some(({ port }) => port.terminalPurpose)
  ) return "intentional-terminal";
  if (artifact.boundaryClassification === "expected-external") {
    return "expected-external-handoff";
  }
  if (artifact.boundaryClassification === "unresolved-external") {
    return "unresolved-terminal";
  }
  return "internal-unused";
}

function portUnusedDisposition(artifact: ArtifactType, port: OutputPort): string {
  if (artifact.boundaryClassification === "product-goal") return "product-goal-terminal";
  if (artifact.intentionalTerminalPurpose || port.terminalPurpose) {
    return "intentional-terminal";
  }
  if (artifact.boundaryClassification === "expected-external") {
    return "expected-external-handoff";
  }
  if (artifact.boundaryClassification === "unresolved-external") {
    return "unresolved-terminal";
  }
  return "internal-unused";
}

test("orphan categories and every port row are independently recomputed without suppression", async () => {
  const { graph, analysis } = await loadFixtures();
  const artifactById = new Map(
    graph.artifactTypes.map((artifact) => [artifact.id, artifact]),
  );
  const producers = new Map<
    string,
    Array<{ reference: PortReference; port: OutputPort; mechanism: MechanismRecord }>
  >();
  const consumers = new Map<
    string,
    Array<{ reference: PortReference; port: InputPort; mechanism: MechanismRecord }>
  >();
  for (const mechanism of graph.mechanisms) {
    for (const port of mechanism.inputPorts) {
      const rows = consumers.get(port.artifactTypeId) ?? [];
      rows.push({
        reference: { mechanismId: mechanism.id, direction: "input", portId: port.id },
        port,
        mechanism,
      });
      consumers.set(port.artifactTypeId, rows);
    }
    for (const port of mechanism.outputPorts) {
      const rows = producers.get(port.artifactTypeId) ?? [];
      rows.push({
        reference: { mechanismId: mechanism.id, direction: "output", portId: port.id },
        port,
        mechanism,
      });
      producers.set(port.artifactTypeId, rows);
    }
  }

  const expectedEdges = [...artifactById.keys()]
    .filter(
      (id) =>
        (producers.get(id)?.length ?? 0) > 0 &&
        (consumers.get(id)?.length ?? 0) > 0,
    )
    .sort();
  const expectedNeverProvided = [...artifactById.keys()]
    .filter(
      (id) =>
        (producers.get(id)?.length ?? 0) === 0 &&
        (consumers.get(id)?.length ?? 0) > 0,
    )
    .sort();
  const expectedNeverUsed = [...artifactById.keys()]
    .filter(
      (id) =>
        (producers.get(id)?.length ?? 0) > 0 &&
        (consumers.get(id)?.length ?? 0) === 0,
    )
    .sort();
  assert.deepEqual(
    analysis.compatibilityHyperedges.map((entry) => entry.artifactTypeId).sort(),
    expectedEdges,
  );
  assert.deepEqual(
    analysis.orphans.neverProvidedInputTypes
      .map((entry) => entry.artifactTypeId)
      .sort(),
    expectedNeverProvided,
  );
  assert.deepEqual(
    analysis.orphans.neverUsedOutputTypes.map((entry) => entry.artifactTypeId).sort(),
    expectedNeverUsed,
  );

  const neverProvidedDisposition = {
    internal: "internal-gap",
    "expected-external": "expected-external-root",
    "unresolved-external": "unresolved-external-root",
    "product-goal": "product-goal-gap",
  } as const;
  for (const entry of analysis.orphans.neverProvidedInputTypes) {
    const artifact = artifactById.get(entry.artifactTypeId);
    const expectedConsumers = consumers.get(entry.artifactTypeId) ?? [];
    assert.ok(artifact);
    assert.equal(entry.disposition, neverProvidedDisposition[artifact.boundaryClassification]);
    assert.deepEqual(
      sortedReferenceKeys(entry.consumerPorts),
      sortedReferenceKeys(expectedConsumers.map(({ reference }) => reference)),
    );
    assert.equal(entry.consumerPortDetails.length, expectedConsumers.length);
    for (const detail of entry.consumerPortDetails) {
      const consumer = expectedConsumers.find(
        ({ reference }) => referenceKey(reference) === referenceKey(detail.port),
      );
      assert.ok(consumer);
      assert.equal(detail.requirement, consumer.port.requirement);
      assert.equal(detail.producerAvailability, "unavailable");
      if (consumer.port.requirement === "optional") {
        assert.equal(detail.obligationClassification, "optional-absence");
      } else if (consumer.port.requirement === "alternative") {
        const members = consumer.mechanism.inputPorts.filter(
          (port) => port.alternativeGroupId === consumer.port.alternativeGroupId,
        );
        const backed = members.filter(
          (port) => (producers.get(port.artifactTypeId)?.length ?? 0) > 0,
        ).length;
        assert.equal(
          detail.obligationClassification,
          backed > 0 ? "unused-alternative" : "collective-alternative-group-obligation",
        );
        assert.equal(detail.alternativeGroup?.memberPortCount, members.length);
        assert.equal(detail.alternativeGroup?.producerBackedMemberPortCount, backed);
      } else {
        assert.equal(detail.obligationClassification, "direct-obligation");
      }
    }
  }

  for (const entry of analysis.orphans.neverUsedOutputTypes) {
    const artifact = artifactById.get(entry.artifactTypeId);
    const expectedProducers = producers.get(entry.artifactTypeId) ?? [];
    assert.ok(artifact);
    assert.equal(entry.disposition, aggregateUnusedDisposition(artifact, expectedProducers));
    assert.deepEqual(
      sortedReferenceKeys(entry.producerPorts),
      sortedReferenceKeys(expectedProducers.map(({ reference }) => reference)),
    );
    assert.equal(entry.producerPortDetails.length, expectedProducers.length);
    for (const detail of entry.producerPortDetails) {
      const producer = expectedProducers.find(
        ({ reference }) => referenceKey(reference) === referenceKey(detail.port),
      );
      assert.ok(producer);
      assert.equal(detail.disposition, portUnusedDisposition(artifact, producer.port));
      assert.equal(
        detail.terminalPurpose,
        producer.port.terminalPurpose ?? artifact.intentionalTerminalPurpose,
      );
    }
  }

  const inputDetails = analysis.orphans.neverProvidedInputTypes.flatMap(
    (entry) => entry.consumerPortDetails,
  );
  const collectiveGroups = new Set(
    inputDetails
      .filter(
        (detail) =>
          detail.obligationClassification === "collective-alternative-group-obligation",
      )
      .map((detail) => `${detail.port.mechanismId}\u0000${detail.alternativeGroup?.id}`),
  );
  assert.deepEqual(analysis.counts, {
    artifactTypes: graph.artifactTypes.length,
    mechanisms: graph.mechanisms.length,
    inputPorts: graph.mechanisms.reduce(
      (count, mechanism) => count + mechanism.inputPorts.length,
      0,
    ),
    outputPorts: graph.mechanisms.reduce(
      (count, mechanism) => count + mechanism.outputPorts.length,
      0,
    ),
    compatibilityHyperedges: expectedEdges.length,
    neverProvidedInputTypes: expectedNeverProvided.length,
    neverProvidedInputPorts: inputDetails.length,
    neverUsedOutputTypes: expectedNeverUsed.length,
    neverUsedOutputPorts: analysis.orphans.neverUsedOutputTypes.reduce(
      (count, entry) => count + entry.producerPortDetails.length,
      0,
    ),
  });
  assert.deepEqual(analysis.obligationCounts, {
    directObligations: inputDetails.filter(
      (detail) => detail.obligationClassification === "direct-obligation",
    ).length,
    collectiveAlternativeGroupObligations: collectiveGroups.size,
    optionalAbsences: inputDetails.filter(
      (detail) => detail.obligationClassification === "optional-absence",
    ).length,
    unusedAlternatives: inputDetails.filter(
      (detail) => detail.obligationClassification === "unused-alternative",
    ).length,
  });
});

test("the checked-in topology is exactly the canonical derivation", async () => {
  const { graph, analysis } = await loadFixtures();
  const derived = deriveCompatibilityTopology(graph.artifactTypes, graph.mechanisms);
  assert.deepEqual(analysis.compatibilityHyperedges, derived.compatibilityHyperedges);
  assert.deepEqual(
    analysis.orphans.neverProvidedInputTypes,
    derived.neverProvidedInputTypes,
  );
  assert.deepEqual(
    analysis.orphans.neverUsedOutputTypes,
    derived.neverUsedOutputTypes,
  );
});

test("the checked-in product projection and open contracts are exactly derived", async () => {
  const { graph, analysis } = await loadFixtures();
  const focus = analysis.productFocus;
  assert.deepEqual(focus, deriveProductFocus(graph.artifactTypes, graph.mechanisms));
  assert.deepEqual(
    {
      primaryMechanisms: focus.primaryMechanismIds.length,
      primaryArtifacts: focus.primaryArtifactIds.length,
      primaryIncidences: focus.primaryIncidences.length,
      inspectorInputs: focus.inspectorInputPorts.length,
      overlayMechanisms: focus.secondaryOverlayMechanismIds.length,
      directlyAttachedOverlayArtifacts: focus.secondaryOverlayArtifactIds.length,
      fullOnlyMechanisms: focus.fullOnlyMechanismIds.length,
      fullOnlyArtifacts: focus.fullOnlyArtifactIds.length,
      materializerGaps: focus.materializerGaps.length,
      openInputContracts: focus.openInputContracts.length,
      openAlternativeContracts: focus.openAlternativeContracts.length,
      openOutputContracts: focus.openOutputContracts.length,
    },
    {
      primaryMechanisms: 83,
      primaryArtifacts: 191,
      primaryIncidences: 279,
      inspectorInputs: 92,
      overlayMechanisms: 36,
      directlyAttachedOverlayArtifacts: 34,
      fullOnlyMechanisms: 30,
      fullOnlyArtifacts: 174,
      materializerGaps: 1,
      openInputContracts: 80,
      openAlternativeContracts: 5,
      openOutputContracts: 86,
    },
  );
  assert.deepEqual(focus.fullRegistryCounts, {
    mechanisms: 149,
    artifacts: 589,
    incidences: 771,
  });
  assert.deepEqual(focus.connectivityCounts, {
    materializerGaps: 1,
    openInputContracts: 80,
    openAlternativeContracts: 5,
    openOutputContracts: 86,
  });
  assert.deepEqual(focus.openContractSemantics, {
    semantics: "candidate-connectivity-observation",
    confirmedGapCondition: "future-selected-composition-requires-exact-contract",
    assertsPrerequisite: false,
    assertsWorkQueueItem: false,
    assertsBuildOrder: false,
    assertsMissingMechanism: false,
    assertsTrialGate: false,
  });

  const primaryClasses = new Set<MechanismFocusClass>([
    "product-transformation",
    "product-admission",
  ]);
  const primaryMechanisms = graph.mechanisms.filter((mechanism) =>
    primaryClasses.has(mechanism.focusClass),
  );
  const primaryProducerTypes = new Set(
    primaryMechanisms.flatMap((mechanism) =>
      mechanism.outputPorts.map((port) => port.artifactTypeId),
    ),
  );
  const fullProducerTypes = new Set(
    graph.mechanisms.flatMap((mechanism) =>
      mechanism.outputPorts.map((port) => port.artifactTypeId),
    ),
  );
  const artifactById = new Map(
    graph.artifactTypes.map((artifact) => [artifact.id, artifact]),
  );
  const mechanismById = new Map(
    graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]),
  );

  assert.deepEqual(focus.materializerGaps, [
    {
      status: "confirmed-structural-gap",
      kind: "missing-product-materializer",
      artifactTypeId: RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    },
  ]);
  for (const contract of focus.openInputContracts) {
    assert.equal(contract.semantics, "candidate-connectivity-observation");
    const mechanism = mechanismById.get(contract.consumerPort.mechanismId);
    const port = mechanism?.inputPorts.find(
      (candidate) => candidate.id === contract.consumerPort.portId,
    );
    assert.ok(mechanism && primaryClasses.has(mechanism.focusClass));
    assert.ok(port);
    assert.equal(port.requirement, "required");
    assert.equal(port.inputClass, "natural");
    assert.notEqual(contract.artifactTypeId, RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID);
    assert.equal(
      artifactById.get(contract.artifactTypeId)?.productFocus,
      "product-flow",
    );
    assert.notEqual(
      artifactById.get(contract.artifactTypeId)?.boundaryClassification,
      "expected-external",
    );
    assert.equal(primaryProducerTypes.has(contract.artifactTypeId), false);
    assert.equal(
      contract.kind,
      fullProducerTypes.has(contract.artifactTypeId)
        ? "nonprimary-provider-observed"
        : "missing-natural-provider",
    );
  }
  for (const contract of focus.openAlternativeContracts) {
    assert.equal(contract.semantics, "candidate-connectivity-observation");
    const mechanism = mechanismById.get(contract.mechanismId);
    assert.ok(mechanism && primaryClasses.has(mechanism.focusClass));
    const group = mechanism.alternativeGroups.find(
      (candidate) => candidate.id === contract.alternativeGroupId,
    );
    assert.ok(group);
    assert.ok(contract.artifactTypeIds.length > 0);
    assert.ok(
      contract.artifactTypeIds.every(
        (id) =>
          artifactById.get(id)?.productFocus === "product-flow" &&
          artifactById.get(id)?.boundaryClassification !== "expected-external" &&
          !primaryProducerTypes.has(id),
      ),
    );
  }

  let hasFullConsumerOutsideFocus = false;
  for (const contract of focus.openOutputContracts) {
    assert.equal(contract.semantics, "candidate-connectivity-observation");
    const artifact = artifactById.get(contract.artifactTypeId);
    assert.ok(artifact);
    assert.equal(artifact.productFocus, "product-flow");
    assert.equal(artifact.boundaryClassification, "internal");
    assert.equal(artifact.intentionalTerminalPurpose, undefined);
    assert.ok(contract.producerPorts.length > 0);
    assert.equal(
      primaryMechanisms.some((mechanism) =>
        mechanism.inputPorts.some(
          (port) => port.artifactTypeId === contract.artifactTypeId,
        ),
      ),
      false,
    );
    if (
      graph.mechanisms.some(
        (mechanism) =>
          !primaryClasses.has(mechanism.focusClass) &&
          mechanism.inputPorts.some(
            (port) => port.artifactTypeId === contract.artifactTypeId,
          ),
      )
    ) {
      hasFullConsumerOutsideFocus = true;
    }
  }
  assert.equal(hasFullConsumerOutsideFocus, true);
});

test("expected-external product-flow inputs remain boundary context, not open contracts", async () => {
  const { graph, analysis } = await loadFixtures();
  const focus = analysis.productFocus;
  const artifactById = new Map(
    graph.artifactTypes.map((artifact) => [artifact.id, artifact]),
  );
  const primaryIds = new Set(focus.primaryMechanismIds);
  const expectedExternalInputs = graph.mechanisms.flatMap((mechanism) =>
    primaryIds.has(mechanism.id)
      ? mechanism.inputPorts
          .filter((port) => {
            const artifact = artifactById.get(port.artifactTypeId);
            return (
              artifact?.productFocus === "product-flow" &&
              artifact.boundaryClassification === "expected-external"
            );
          })
          .map((port) => ({
            artifactTypeId: port.artifactTypeId,
            reference: {
              mechanismId: mechanism.id,
              direction: "input" as const,
              portId: port.id,
            },
          }))
      : [],
  );
  assert.ok(expectedExternalInputs.length > 0);
  assert.ok(
    expectedExternalInputs.some(
      ({ artifactTypeId }) =>
        artifactTypeId === "artifact.source.encoded-opaque-image.v1",
    ),
  );
  assert.ok(
    expectedExternalInputs.some(
      ({ artifactTypeId }) =>
        artifactTypeId === "artifact.measurement.native-color-occupancy.v1",
    ),
  );
  const primaryIncidenceKeys = new Set(focus.primaryIncidences.map(referenceKey));
  const openInputKeys = new Set(
    focus.openInputContracts.map((contract) => referenceKey(contract.consumerPort)),
  );
  for (const { reference } of expectedExternalInputs) {
    assert.ok(primaryIncidenceKeys.has(referenceKey(reference)));
    assert.equal(openInputKeys.has(referenceKey(reference)), false);
  }
  assert.ok(
    focus.openAlternativeContracts.every((contract) =>
      contract.artifactTypeIds.every(
        (id) => artifactById.get(id)?.boundaryClassification !== "expected-external",
      ),
    ),
  );
});

test("a future primary product output closes the confirmed materializer gap", async () => {
  const { graph } = await loadFixtures();
  const mechanisms = structuredClone(graph.mechanisms);
  const admission = mechanisms.find(
    (mechanism) => mechanism.focusClass === "product-admission",
  );
  assert.ok(admission);
  admission.outputPorts.push({
    id: "future-product-materializer",
    label: "Future exact product materializer",
    artifactTypeId: RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    cardinality: "exactly-one",
    valueStateNotes: ["Synthetic derivation fixture."],
    notes: ["Tests generated state rather than a permanent producer prohibition."],
  });
  const focus = deriveProductFocus(graph.artifactTypes, mechanisms);
  assert.deepEqual(focus.materializerGaps, []);
  assert.equal(focus.connectivityCounts.materializerGaps, 0);
  assert.ok(
    focus.primaryArtifactIds.includes(RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID),
  );
  assert.ok(
    focus.primaryIncidences.some(
      (reference) =>
        reference.mechanismId === admission.id &&
        reference.direction === "output" &&
        reference.portId === "future-product-materializer",
    ),
  );
});

test("shared working-raster and native-OKLab producer contracts remain connected", async () => {
  const { graph, analysis } = await loadFixtures();
  const workingId = "artifact.raster.working-srgb8-max-edge-224-lanczos3.v1";
  assert.equal(graph.artifactTypes.filter((artifact) => artifact.id === workingId).length, 1);
  const workingEdge = analysis.compatibilityHyperedges.find(
    (entry) => entry.artifactTypeId === workingId,
  );
  assert.ok(workingEdge);
  assert.ok(
    workingEdge.producerPorts.some(
      (port) =>
        port.mechanismId === "raster.fixed-working-copy" &&
        port.portId === "working-raster",
    ),
  );
  assert.ok(
    workingEdge.consumerPorts.some(
      (port) =>
        port.mechanismId === "evidence.slic-region-graph" &&
        port.portId === "working-raster",
    ),
  );

  const nativeOklabId = "artifact.raster.native-oklab-float.v1";
  const nativeOklabEdge = analysis.compatibilityHyperedges.find(
    (entry) => entry.artifactTypeId === nativeOklabId,
  );
  assert.ok(nativeOklabEdge);
  assert.ok(
    nativeOklabEdge.producerPorts.some(
      (port) =>
        port.mechanismId === "color.oklab-working-space" &&
        port.portId === "native-oklab",
    ),
  );
  assert.ok(nativeOklabEdge.consumerPorts.length > 0);
});

test("native transition-path evidence directly connects discovery to both gradient consumers", async () => {
  const { graph, analysis } = await loadFixtures();
  const artifactId = "artifact.evidence.gradient-ordered-transition-paths.v1";
  assert.equal(
    graph.artifactTypes.some(
      (artifact) => artifact.id === "artifact.diagnostic.native-transition-trace.v1",
    ),
    false,
  );
  const artifact = graph.artifactTypes.find((candidate) => candidate.id === artifactId);
  assert.ok(artifact);
  assert.equal(artifact.valueInspection, undefined);
  assert.match(artifact.description, /zero stages/);
  assert.match(artifact.description, /more than sixteen stages/);
  assert.match(artifact.provenanceNotes.join(" "), /not a universal artifact-shape bound/);

  const edge = analysis.compatibilityHyperedges.find(
    (candidate) => candidate.artifactTypeId === artifactId,
  );
  assert.ok(edge);
  assert.deepEqual(
    new Set(edge.producerPorts.map((port) => `${port.mechanismId}:${port.portId}`)),
    new Set(["candidate.native-transition-path:ordered-traces"]),
  );
  assert.deepEqual(
    new Set(edge.consumerPorts.map((port) => `${port.mechanismId}:${port.portId}`)),
    new Set([
      "gradient.transition-stage-midpoint:transition-paths",
      "gradient.transition-support-and-flat-fallback:transition-paths",
    ]),
  );
  const midpoint = graph.mechanisms.find(
    (mechanism) => mechanism.id === "gradient.transition-stage-midpoint",
  );
  const midpointInput = midpoint?.inputPorts.find((port) => port.id === "transition-paths");
  assert.equal(midpointInput?.cardinality, "one-or-more");
  assert.match(midpointInput?.notes.join(" ") ?? "", /full accepted and rejected evidence set/);
  assert.equal(
    analysis.orphans.neverProvidedInputTypes.some(
      (entry) => entry.artifactTypeId === artifactId,
    ),
    false,
  );
  assert.equal(
    analysis.orphans.neverUsedOutputTypes.some(
      (entry) =>
        entry.artifactTypeId ===
        "artifact.diagnostic.native-transition-trace.v1",
    ),
    false,
  );
});

test("legacy k-means does not claim to return its internal cluster state", async () => {
  const { graph, analysis } = await loadFixtures();
  const internalStateId = "artifact.measurement.legacy-kmeans-internal-cluster-state.v1";
  const kmeans = graph.mechanisms.find(
    (mechanism) => mechanism.id === "evidence.legacy-weighted-kmeans",
  );
  assert.ok(kmeans);
  assert.ok(kmeans.outputPorts.every((port) => port.artifactTypeId !== internalStateId));
  assert.equal(
    graph.artifactTypes.find((artifact) => artifact.id === internalStateId)
      ?.boundaryClassification,
    "unresolved-external",
  );
  const gap = analysis.orphans.neverProvidedInputTypes.find(
    (entry) => entry.artifactTypeId === internalStateId,
  );
  assert.equal(gap?.disposition, "unresolved-external-root");
  assert.ok(
    gap?.consumerPorts.some(
      (port) =>
        port.mechanismId === "publication.legacy-nearest-observed-cluster-color" &&
        port.portId === "cluster-state",
    ),
  );
});

test("known-good substitution has no artifact-type self-loop and remains an external handoff", async () => {
  const { graph, analysis } = await loadFixtures();
  const mechanism = graph.mechanisms.find(
    (candidate) => candidate.id === "validation.known-good-substitution",
  );
  assert.ok(mechanism);
  const inputs = new Set(mechanism.inputPorts.map((port) => port.artifactTypeId));
  assert.ok(mechanism.outputPorts.every((port) => !inputs.has(port.artifactTypeId)));
  const handoff = analysis.orphans.neverUsedOutputTypes.find(
    (entry) =>
      entry.artifactTypeId === "artifact.hypothesis.known-good-minimal-projection.v1",
  );
  assert.equal(handoff?.disposition, "expected-external-handoff");
  assert.deepEqual(handoff?.producerPorts, [
    {
      mechanismId: "validation.known-good-substitution",
      direction: "output",
      portId: "projection",
    },
  ]);
});

test("gradient paths retain source-specific stop cardinalities and accepted-transition handoff", async () => {
  const { graph, analysis } = await loadFixtures();
  const mechanism = (id: string): MechanismRecord => {
    const found = graph.mechanisms.find((candidate) => candidate.id === id);
    assert.ok(found, id);
    return found;
  };
  const portConstraint = (
    mechanismId: string,
    direction: "input" | "output",
    portId: string,
  ): { comparator: string; value: unknown } => {
    const record = mechanism(mechanismId);
    const ports = direction === "input" ? record.inputPorts : record.outputPorts;
    const port = ports.find((candidate) => candidate.id === portId);
    assert.ok(port, `${mechanismId}:${portId}`);
    assert.equal(port.valueConstraints?.length, 1);
    const constraint = port.valueConstraints[0];
    return { comparator: constraint.comparator, value: constraint.value };
  };

  assert.deepEqual(
    portConstraint(
      "gradient.transition-support-and-flat-fallback",
      "output",
      "exact-stop-path",
    ),
    { comparator: "count-between-inclusive", value: [2, 3] },
  );
  assert.deepEqual(
    portConstraint("gradient.excursion-probe", "input", "stop-path"),
    { comparator: "count-between-inclusive", value: [2, 3] },
  );
  assert.deepEqual(
    portConstraint(
      "gradient.excursion-midpoint-insertion",
      "input",
      "two-stop-path",
    ),
    { comparator: "count-equals", value: 2 },
  );
  assert.deepEqual(
    portConstraint(
      "gradient.excursion-midpoint-insertion",
      "output",
      "resulting-stop-path",
    ),
    { comparator: "count-between-inclusive", value: [2, 3] },
  );
  assert.deepEqual(
    portConstraint("gradient.whole-ramp-contrast", "input", "stop-path"),
    { comparator: "count-between-inclusive", value: [2, 4] },
  );

  const transitionId = "artifact.decision.gradient-transition-publication.v1";
  const transitionEdge = analysis.compatibilityHyperedges.find(
    (entry) => entry.artifactTypeId === transitionId,
  );
  assert.ok(transitionEdge);
  assert.ok(
    transitionEdge.producerPorts.some(
      (port) =>
        port.mechanismId === "gradient.transition-support-and-flat-fallback" &&
        port.portId === "publication-decision",
    ),
  );
  assert.ok(
    transitionEdge.consumerPorts.some(
      (port) =>
        port.mechanismId === "selection.transition-promotion" &&
        port.portId === "accepted-transitions",
    ),
  );
});

test("manifest cardinality, source-registry gap, and historical gradient gaps remain explicit", async () => {
  const { graph, analysis } = await loadFixtures();
  const developmentLoop = graph.mechanisms.find(
    (mechanism) => mechanism.id === "validation.content-addressed-development-loop",
  );
  assert.equal(
    developmentLoop?.inputPorts.find((port) => port.id === "manifests")?.cardinality,
    "exactly-two",
  );

  const sourceRegistry = analysis.orphans.neverProvidedInputTypes.find(
    (entry) => entry.artifactTypeId === "artifact.custody.source-registry.v1",
  );
  assert.equal(sourceRegistry?.disposition, "internal-gap");
  assert.ok(
    sourceRegistry?.consumerPorts.some(
      (port) =>
        port.mechanismId === "publication.source-connected-lineage" &&
        port.portId === "source-registry",
    ),
  );

  const acceptedFit = analysis.orphans.neverProvidedInputTypes.find(
    (entry) =>
      entry.artifactTypeId === "artifact.diagnostic.accepted-historical-gradient-fit.v1",
  );
  assert.equal(acceptedFit?.disposition, "internal-gap");
  assert.deepEqual(
    new Set(
      acceptedFit?.consumerPorts.map((port) => `${port.mechanismId}:${port.portId}`),
    ),
    new Set([
      "candidate.band-local-endpoints:accepted-fit",
      "gradient.spatial-midpoint-band:accepted-fit",
    ]),
  );
  const midpoint = analysis.orphans.neverProvidedInputTypes.find(
    (entry) =>
      entry.artifactTypeId === "artifact.evidence.occupied-native-midpoint-band.v1",
  );
  assert.equal(midpoint?.disposition, "internal-gap");
  assert.deepEqual(midpoint?.consumerPorts, [
    {
      mechanismId: "gradient.spatial-midpoint-band",
      direction: "input",
      portId: "occupied-midpoint-band",
    },
  ]);
});
