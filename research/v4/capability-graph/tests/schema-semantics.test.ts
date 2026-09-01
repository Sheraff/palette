import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  computeGenerationDigest,
  EXPECTED_GENERATION_INPUT_PATHS,
  EXPECTED_SOURCE_FRAGMENT_MANIFEST,
  parseStrictJsonBytes,
} from "../src/generation.ts";
import {
  ARTIFACT_PRODUCT_FOCI,
  EXPECTED_MECHANISM_COUNT,
  LEFT_PRODUCT_ANCHOR_ARTIFACT_ID,
  MECHANISM_FOCUS_CLASSES,
  OPEN_INPUT_CONTRACT_KINDS,
  PRODUCT_FOCUS_WARNING,
  RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
} from "../src/types.ts";
import {
  parseMechanismCensus,
  validateArtifactTypeCompatibility,
  validateCapabilityGraph,
  validateFragment,
  validateGenerationFiles,
  validatePorts,
  validateReferentialIntegrity,
  validateVocabularies,
} from "../src/validate.ts";
import { GRAPH_ROOT, REPOSITORY_ROOT, loadFixtures } from "./helpers.ts";

const execFileAsync = promisify(execFile);

test("Ajv validates every fragment, the generated graph, and standalone analysis", async () => {
  const { graph, analysis, groups, graphSchema, fragmentSchema, fragments } =
    await loadFixtures();
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: false,
  });
  ajv.addSchema(graphSchema);
  const graphSchemaId = graphSchema.$id;
  assert.equal(typeof graphSchemaId, "string");
  if (typeof graphSchemaId !== "string") throw new Error("Graph schema has no $id.");
  const validateGraph = ajv.getSchema(graphSchemaId);
  assert.ok(validateGraph);
  assert.equal(validateGraph(graph), true, ajv.errorsText(validateGraph.errors));

  const validateGroups = ajv.compile({
    $ref: `${graphSchemaId}#/$defs/capabilityGroups`,
  });
  assert.equal(validateGroups(groups), true, ajv.errorsText(validateGroups.errors));
  const validateAnalysis = ajv.compile({
    $ref: `${graphSchemaId}#/$defs/generatedAnalysis`,
  });
  assert.equal(validateAnalysis(analysis), true, ajv.errorsText(validateAnalysis.errors));

  const validateFragmentSchema = ajv.compile(fragmentSchema);
  for (const fragment of fragments) {
    assert.equal(
      validateFragmentSchema(fragment.value),
      true,
      `${fragment.fileName}: ${ajv.errorsText(validateFragmentSchema.errors)}`,
    );
  }

  const invalidFragment = structuredClone(fragments[0]?.value);
  assert.ok(invalidFragment);
  (invalidFragment.mechanismTypings[0] as unknown as Record<string, unknown>).focusClass =
    "inferred-primary";
  assert.equal(validateFragmentSchema(invalidFragment), false);

  const missingArtifactFocus = structuredClone(fragments[0]?.value);
  assert.ok(missingArtifactFocus);
  delete (missingArtifactFocus.artifactTypes[0] as unknown as Record<string, unknown>)
    .productFocus;
  assert.equal(validateFragmentSchema(missingArtifactFocus), false);

  const invalidGraph = structuredClone(graph) as unknown as Record<string, unknown>;
  delete invalidGraph.documentKind;
  assert.equal(validateGraph(invalidGraph), false);
});

test("the exact 149-entry census, headings, titles, lines, and status fields stay synchronized", async () => {
  const { graph, groups, sourceText, fragments } = await loadFixtures();
  const census = parseMechanismCensus(sourceText);
  assert.equal(census.length, EXPECTED_MECHANISM_COUNT);
  assert.equal(graph.mechanisms.length, EXPECTED_MECHANISM_COUNT);
  assert.deepEqual(
    new Set(graph.mechanisms.map((mechanism) => mechanism.id)),
    new Set(census.map((entry) => entry.id)),
  );
  assert.ok(census.every((entry) => entry.authorizationText && entry.statusText));
  assert.deepEqual(validateCapabilityGraph(graph, sourceText), []);
  for (const fragment of fragments) {
    assert.deepEqual(
      validateFragment(fragment.value, groups, sourceText),
      [],
      fragment.fileName,
    );
  }
});

test("IDs are unique and every artifact, taxonomy, and primary-capability reference resolves", async () => {
  const { graph } = await loadFixtures();
  const artifactIds = new Set(graph.artifactTypes.map((artifact) => artifact.id));
  const mechanismIds = new Set(graph.mechanisms.map((mechanism) => mechanism.id));
  const capabilityIds = new Set(
    graph.capabilityGroups.capabilities.map((capability) => capability.id),
  );
  const axisIds = new Set(
    graph.capabilityGroups.axis.positions.map((position) => position.id),
  );
  const laneIds = new Set(graph.capabilityGroups.lanes.map((lane) => lane.id));
  assert.equal(artifactIds.size, graph.artifactTypes.length);
  assert.equal(mechanismIds.size, graph.mechanisms.length);

  for (const artifact of graph.artifactTypes) {
    assert.ok(axisIds.has(artifact.axisPositionId), artifact.id);
    assert.ok(laneIds.has(artifact.laneId), artifact.id);
  }
  for (const mechanism of graph.mechanisms) {
    const portIds = [
      ...mechanism.inputPorts.map((port) => port.id),
      ...mechanism.outputPorts.map((port) => port.id),
    ];
    assert.equal(new Set(portIds).size, portIds.length, mechanism.id);
    assert.ok(mechanism.capabilityIds.includes(mechanism.primaryCapabilityId), mechanism.id);
    assert.ok(capabilityIds.has(mechanism.primaryCapabilityId), mechanism.id);
    for (const capabilityId of mechanism.capabilityIds) {
      assert.ok(capabilityIds.has(capabilityId), `${mechanism.id}: ${capabilityId}`);
    }
    for (const port of [...mechanism.inputPorts, ...mechanism.outputPorts]) {
      assert.ok(artifactIds.has(port.artifactTypeId), `${mechanism.id}:${port.id}`);
    }
  }
});

test("focus metadata is explicit, closed, exhaustive, and preserves the audited census", async () => {
  const { graph, fragments } = await loadFixtures();
  const mechanismCounts = Object.fromEntries(
    MECHANISM_FOCUS_CLASSES.map((focusClass) => [
      focusClass,
      graph.mechanisms.filter((mechanism) => mechanism.focusClass === focusClass).length,
    ]),
  );
  const artifactCounts = Object.fromEntries(
    ARTIFACT_PRODUCT_FOCI.map((productFocus) => [
      productFocus,
      graph.artifactTypes.filter((artifact) => artifact.productFocus === productFocus).length,
    ]),
  );
  assert.deepEqual(mechanismCounts, {
    "product-transformation": 72,
    "product-admission": 11,
    "evaluation-probe": 23,
    "review-custody": 8,
    "configuration-governance": 5,
    "historical-comparator": 10,
    "research-only-oracle": 20,
  });
  assert.deepEqual(artifactCounts, {
    "product-flow": 191,
    "inspector-metadata": 138,
    "secondary-overlay": 86,
    "full-analysis-only": 174,
  });
  const canonicalFocus = new Map(
    graph.artifactTypes.map((artifact) => [artifact.id, artifact.productFocus]),
  );
  for (const fragment of fragments) {
    assert.ok(fragment.value.mechanismTypings.every((mechanism) => mechanism.focusClass));
    for (const artifact of fragment.value.artifactTypes) {
      assert.equal(artifact.productFocus, canonicalFocus.get(artifact.id), artifact.id);
    }
  }
  assert.deepEqual(graph.analysis.productFocus.mechanismClassCounts, mechanismCounts);
  assert.deepEqual(graph.analysis.productFocus.artifactFocusCounts, artifactCounts);
  assert.deepEqual(graph.analysis.productFocus.interpretationWarnings, [
    PRODUCT_FOCUS_WARNING,
  ]);

  const prohibitedPrimary = structuredClone(graph.mechanisms);
  const primary = prohibitedPrimary.find(
    (mechanism) => mechanism.focusClass === "product-transformation",
  );
  assert.ok(primary);
  primary.censusStatus.runtimeAdmissibilities = ["prohibited"];
  assert.ok(
    validateVocabularies(graph.artifactTypes, prohibitedPrimary).some(
      (validationIssue) =>
        validationIssue.code === "product-focus-runtime-prohibited",
    ),
  );
});

test("product connectivity separates the confirmed gap from complete open-contract observations", async () => {
  const { analysis } = await loadFixtures();
  const focus = analysis.productFocus;
  assert.deepEqual(focus.materializerGaps, [
    {
      status: "confirmed-structural-gap",
      kind: "missing-product-materializer",
      artifactTypeId: RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    },
  ]);
  assert.equal("gaps" in focus, false);
  assert.equal("inputGaps" in focus, false);
  assert.equal("alternativeGroupGaps" in focus, false);
  assert.equal("outputGaps" in focus, false);
  assert.deepEqual(focus.connectivityCounts, {
    materializerGaps: focus.materializerGaps.length,
    openInputContracts: focus.openInputContracts.length,
    openAlternativeContracts: focus.openAlternativeContracts.length,
    openOutputContracts: focus.openOutputContracts.length,
  });
  assert.deepEqual(focus.connectivityCounts, {
    materializerGaps: 1,
    openInputContracts: 80,
    openAlternativeContracts: 5,
    openOutputContracts: 86,
  });
  const openContracts = [
    ...focus.openInputContracts,
    ...focus.openAlternativeContracts,
    ...focus.openOutputContracts,
  ];
  assert.equal(openContracts.length, 171);
  assert.ok(
    openContracts.every(
      (contract) => contract.semantics === "candidate-connectivity-observation",
    ),
  );
  assert.deepEqual(focus.openContractSemantics, {
    semantics: "candidate-connectivity-observation",
    confirmedGapCondition: "future-selected-composition-requires-exact-contract",
    assertsPrerequisite: false,
    assertsWorkQueueItem: false,
    assertsBuildOrder: false,
    assertsMissingMechanism: false,
    assertsTrialGate: false,
  });
  assert.deepEqual(OPEN_INPUT_CONTRACT_KINDS, [
    "missing-natural-provider",
    "nonprimary-provider-observed",
  ]);
  assert.ok(
    [...focus.openInputContracts, ...focus.openAlternativeContracts].every((contract) =>
      OPEN_INPUT_CONTRACT_KINDS.includes(contract.kind),
    ),
  );
});

test("generated product connectivity documentation is compact and non-prescriptive", async () => {
  const report = await readFile(resolve(GRAPH_ROOT, "PRODUCT_CONNECTIVITY.md"), "utf8");
  await assert.rejects(
    readFile(resolve(GRAPH_ROOT, "PRODUCT_GAPS.md"), "utf8"),
    (error: unknown) =>
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
  const confirmedIndex = report.indexOf("## Confirmed Structural Gap");
  const openIndex = report.indexOf("## Candidate Open Contract Observations");
  assert.ok(confirmedIndex >= 0 && openIndex > confirmedIndex);
  const confirmedSection = report.slice(confirmedIndex, openIndex);
  assert.match(confirmedSection, /one confirmed structural gap/);
  assert.match(confirmedSection, /artifact\.product\.ui-palette\.v3/);
  assert.equal((confirmedSection.match(/confirmed-structural-gap/g) ?? []).length, 1);

  const openSection = report.slice(openIndex);
  assert.match(openSection, /Open input contracts: 80\./);
  assert.match(openSection, /Open alternative contracts: 5\./);
  assert.match(openSection, /Open output contracts: 86\./);
  assert.equal((openSection.match(/<details>/g) ?? []).length, 3);
  assert.equal((openSection.match(/<\/details>/g) ?? []).length, 3);
  assert.match(openSection, /candidate connectivity observations/);
  assert.match(openSection, /nonprimary-provider-observed/);
  assert.match(
    openSection,
    /future selected composition requires that exact contract/,
  );
  assert.match(
    openSection,
    /implement a narrow mechanism with local typed I\/O without closing or registering these contracts/,
  );
  assert.doesNotMatch(openSection, /focus-bridge-or-adapter-needed/);
  const prescriptiveTerms =
    /\b(?:needed|blocker|blockers|blocking|backlog)\b|\brequired(?:[ -]+)(?:work|closure)\b|\bwork(?:[ -]+)required\b/i;
  assert.doesNotMatch(
    openSection,
    prescriptiveTerms,
  );

  const readme = await readFile(resolve(GRAPH_ROOT, "README.md"), "utf8");
  const focusSection = readme.slice(
    readme.indexOf("## Product Focus"),
    readme.indexOf("## Ports And Terminals"),
  );
  const closureSection = readme.slice(
    readme.indexOf("The Canvas projection"),
    readme.indexOf("Missing-link controls"),
  );
  assert.doesNotMatch(focusSection, prescriptiveTerms);
  assert.doesNotMatch(closureSection, prescriptiveTerms);
});

test("product anchors retain their focus and authority boundaries while the current UI Palette stays producerless", async () => {
  const { graph } = await loadFixtures();
  const left = graph.artifactTypes.find(
    (artifact) => artifact.id === LEFT_PRODUCT_ANCHOR_ARTIFACT_ID,
  );
  const right = graph.artifactTypes.find(
    (artifact) => artifact.id === RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  );
  assert.ok(left);
  assert.ok(right);
  assert.deepEqual(
    {
      category: left.category,
      productFocus: left.productFocus,
      plane: left.plane,
      axisPositionId: left.axisPositionId,
      laneId: left.laneId,
    },
    {
      category: "raster",
      productFocus: "product-flow",
      plane: "runtime",
      axisPositionId: "commitment.native-source",
      laneId: "lane.image-and-color",
    },
  );
  assert.deepEqual(
    {
      category: right.category,
      productFocus: right.productFocus,
      plane: right.plane,
      axisPositionId: right.axisPositionId,
      laneId: right.laneId,
      boundaryClassification: right.boundaryClassification,
    },
    {
      category: "treatment",
      productFocus: "product-flow",
      plane: "runtime",
      axisPositionId: "commitment.exact-product-contract",
      laneId: "lane.role-and-treatment",
      boundaryClassification: "product-goal",
    },
  );
  assert.equal(
    graph.capabilityGroups.productAnchors.left.artifactTypeId,
    LEFT_PRODUCT_ANCHOR_ARTIFACT_ID,
  );
  assert.equal(
    graph.capabilityGroups.productAnchors.right.artifactTypeId,
    RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  );
  const rightInputs = graph.mechanisms.flatMap((mechanism) =>
    mechanism.inputPorts.filter(
      (port) => port.artifactTypeId === RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    ),
  );
  const rightOutputs = graph.mechanisms.flatMap((mechanism) =>
    mechanism.outputPorts.filter(
      (port) => port.artifactTypeId === RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    ),
  );
  assert.ok(rightInputs.length > 0);
  assert.equal(rightOutputs.length, 0);

  const withMaterializer = structuredClone(graph.mechanisms);
  const admission = withMaterializer.find(
    (mechanism) => mechanism.focusClass === "product-admission",
  );
  assert.ok(admission);
  admission.outputPorts.push({
    id: "future-product-materializer",
    label: "Future exact product materializer",
    artifactTypeId: RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
    cardinality: "exactly-one",
    valueStateNotes: ["Synthetic validation fixture."],
    notes: ["A future producer is allowed by the anchor invariant."],
  });
  assert.equal(
    validateReferentialIntegrity(
      graph.artifactTypes,
      withMaterializer,
      graph.capabilityGroups,
    ).some((validationIssue) => validationIssue.code === "right-product-anchor-topology"),
    false,
  );
});

test("internal treatment, protected review, known-good, and answer-bearing contracts remain distinct", async () => {
  const { graph } = await loadFixtures();
  const ids = [
    "artifact.treatment.selected-internal.v1",
    "artifact.review.protected-semantic-review-store.v1",
    "artifact.hypothesis.known-good-minimal-projection.v1",
    "artifact.hypothesis.privileged-answer-bearing-projection.v1",
  ];
  const artifacts = ids.map((id) =>
    graph.artifactTypes.find((artifact) => artifact.id === id),
  );
  assert.ok(artifacts.every(Boolean));
  assert.equal(new Set(artifacts.map((artifact) => artifact?.id)).size, ids.length);
  assert.deepEqual(
    artifacts.map((artifact) => artifact?.category),
    ["treatment", "review", "hypothesis", "hypothesis"],
  );
  assert.notEqual(ids[0], RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID);

  const knownGood = graph.mechanisms.find(
    (mechanism) => mechanism.id === "validation.known-good-substitution",
  );
  const upperBound = graph.mechanisms.find(
    (mechanism) => mechanism.id === "validation.answer-bearing-upper-bound",
  );
  assert.ok(knownGood);
  assert.ok(upperBound);
  assert.equal(
    knownGood.inputPorts.find((port) => port.id === "protected-review")?.inputClass,
    "review",
  );
  assert.equal(
    knownGood.outputPorts.find((port) => port.id === "projection")?.artifactTypeId,
    ids[2],
  );
  assert.equal(
    upperBound.inputPorts.find((port) => port.id === "privileged-projection")?.inputClass,
    "answer-bearing-upper-bound",
  );
  assert.equal(
    upperBound.inputPorts.find((port) => port.id === "privileged-projection")?.artifactTypeId,
    ids[3],
  );
});

test("value constraints are inspection-anchored and tampering is rejected", async () => {
  const { graph } = await loadFixtures();
  assert.deepEqual(validatePorts(graph.artifactTypes, graph.mechanisms), []);

  const tampered = structuredClone(graph);
  const constrainedPort = tampered.mechanisms
    .flatMap((mechanism) => [...mechanism.inputPorts, ...mechanism.outputPorts])
    .find((port) => port.valueConstraints?.some((constraint) => constraint.valuePath));
  assert.ok(constrainedPort?.valueConstraints);
  const constraint = constrainedPort.valueConstraints.find(
    (candidate) => candidate.valuePath !== "",
  );
  assert.ok(constraint);
  constraint.value = "tampered-value";
  assert.ok(
    validatePorts(tampered.artifactTypes, tampered.mechanisms).some(
      (validationIssue) => validationIssue.code === "unanchored-value-constraint",
    ),
  );
});

test("strict JSON rejects duplicate keys and malformed UTF-8", () => {
  assert.throws(
    () =>
      parseStrictJsonBytes(
        Buffer.from('{"outer":{"key":1,"\\u006bey":2}}'),
        "duplicate.json",
      ),
    /Duplicate JSON object key "key"/,
  );
  assert.throws(
    () => parseStrictJsonBytes(Buffer.from([0xc3, 0x28]), "utf8.json"),
    /invalid UTF-8/,
  );
});

test("generation digest and both manifests match current bytes", async () => {
  const { graph, analysis } = await loadFixtures();
  assert.deepEqual(graph.analysis, analysis);
  assert.equal(graph.generationDigest, analysis.generationDigest);
  assert.equal(
    graph.generationDigest,
    computeGenerationDigest({
      generator: analysis.generator,
      generatedAt: analysis.generatedAt,
      sourceSnapshot: graph.sourceSnapshot,
      generationInputs: analysis.generationInputs,
    }),
  );
  assert.deepEqual(
    analysis.sourceFragments.map(({ fragmentId, path }) => ({ fragmentId, path })),
    EXPECTED_SOURCE_FRAGMENT_MANIFEST,
  );
  assert.deepEqual(
    analysis.generationInputs.map(({ path }) => path),
    EXPECTED_GENERATION_INPUT_PATHS,
  );
  for (const fragment of analysis.sourceFragments) {
    const input = analysis.generationInputs.find(
      (candidate) => candidate.path === fragment.path,
    );
    assert.ok(input, fragment.path);
    assert.equal(input.sha256, fragment.sha256);
    assert.equal(input.byteLength, fragment.byteLength);
  }
  assert.deepEqual(await validateGenerationFiles(graph), []);
});

test("standalone validation rejects incomplete or noncanonical manifests after valid digest recomputation", async (context) => {
  const { graph, sourceText } = await loadFixtures();

  function validateResignedManifest(tampered: typeof graph) {
    const digest = computeGenerationDigest({
      generator: tampered.analysis.generator,
      generatedAt: tampered.analysis.generatedAt,
      sourceSnapshot: tampered.sourceSnapshot,
      generationInputs: tampered.analysis.generationInputs,
    });
    tampered.generationDigest = digest;
    tampered.analysis.generationDigest = digest;
    const issues = validateCapabilityGraph(tampered, sourceText);
    assert.equal(
      issues.some((validationIssue) =>
        ["generation-digest", "generation-digest-inputs"].includes(validationIssue.code),
      ),
      false,
    );
    assert.ok(
      issues.some((validationIssue) =>
        ["source-fragment-manifest", "generation-input-manifest"].includes(
          validationIssue.code,
        ),
      ),
    );
    return issues;
  }

  await context.test("missing fragment removed from both manifests", () => {
    const tampered = structuredClone(graph);
    const removed = tampered.analysis.sourceFragments.shift();
    assert.ok(removed);
    const inputIndex = tampered.analysis.generationInputs.findIndex(
      (input) => input.path === removed.path,
    );
    assert.notEqual(inputIndex, -1);
    tampered.analysis.generationInputs.splice(inputIndex, 1);
    const issues = validateResignedManifest(tampered);
    assert.ok(
      issues.some((validationIssue) => validationIssue.code === "source-fragment-manifest"),
    );
    assert.ok(
      issues.some((validationIssue) => validationIssue.code === "generation-input-manifest"),
    );
  });

  await context.test("extra fragment added to both manifests", () => {
    const tampered = structuredClone(graph);
    const sourceTemplate = tampered.analysis.sourceFragments[0];
    const inputTemplate = tampered.analysis.generationInputs[0];
    assert.ok(sourceTemplate);
    assert.ok(inputTemplate);
    const extraPath =
      "research/v4/capability-graph/data/fragments/11-unexpected.json";
    tampered.analysis.sourceFragments.push({
      ...sourceTemplate,
      fragmentId: "fragment.11-unexpected.v1",
      path: extraPath,
    });
    tampered.analysis.generationInputs.push({ ...inputTemplate, path: extraPath });
    tampered.analysis.generationInputs.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    validateResignedManifest(tampered);
  });

  await context.test("renamed fragment changes its ID and path in both manifests", () => {
    const tampered = structuredClone(graph);
    const fragment = tampered.analysis.sourceFragments[0];
    assert.ok(fragment);
    const input = tampered.analysis.generationInputs.find(
      (candidate) => candidate.path === fragment.path,
    );
    assert.ok(input);
    const renamedPath =
      "research/v4/capability-graph/data/fragments/02-raster-color-renamed.json";
    fragment.fragmentId = "fragment.02-raster-color-renamed.v1";
    fragment.path = renamedPath;
    input.path = renamedPath;
    validateResignedManifest(tampered);
  });

  await context.test("duplicated fragment and generation-input declarations", () => {
    const tampered = structuredClone(graph);
    const fragment = tampered.analysis.sourceFragments[0];
    const inputIndex = tampered.analysis.generationInputs.findIndex(
      (candidate) => candidate.path === fragment?.path,
    );
    assert.ok(fragment);
    assert.notEqual(inputIndex, -1);
    tampered.analysis.sourceFragments.splice(1, 0, structuredClone(fragment));
    tampered.analysis.generationInputs.splice(
      inputIndex + 1,
      0,
      structuredClone(tampered.analysis.generationInputs[inputIndex]),
    );
    validateResignedManifest(tampered);
  });

  await context.test("reordered source-fragment and generation-input declarations", () => {
    const tampered = structuredClone(graph);
    [tampered.analysis.sourceFragments[0], tampered.analysis.sourceFragments[1]] = [
      tampered.analysis.sourceFragments[1],
      tampered.analysis.sourceFragments[0],
    ];
    [tampered.analysis.generationInputs[0], tampered.analysis.generationInputs[1]] = [
      tampered.analysis.generationInputs[1],
      tampered.analysis.generationInputs[0],
    ];
    validateResignedManifest(tampered);
  });
});

test("stale analysis, generation digests, and input manifests are rejected", async () => {
  const { graph, sourceText } = await loadFixtures();

  const staleAnalysis = structuredClone(graph.analysis);
  assert.ok(staleAnalysis.orphans.neverProvidedInputTypes.shift());
  assert.ok(
    validateArtifactTypeCompatibility(
      graph.artifactTypes,
      graph.mechanisms,
      staleAnalysis,
    ).some((validationIssue) => validationIssue.code === "missing-never-provided-type"),
  );

  const staleProductFocus = structuredClone(graph.analysis);
  assert.ok(staleProductFocus.productFocus.primaryMechanismIds.shift());
  assert.ok(
    validateArtifactTypeCompatibility(
      graph.artifactTypes,
      graph.mechanisms,
      staleProductFocus,
    ).some((validationIssue) => validationIssue.code === "product-focus-analysis"),
  );

  const staleDigest = structuredClone(graph);
  staleDigest.generationDigest = "0".repeat(64);
  assert.ok(
    validateCapabilityGraph(staleDigest, sourceText).some(
      (validationIssue) => validationIssue.code === "generation-digest",
    ),
  );

  const staleManifest = structuredClone(graph);
  staleManifest.analysis.generationInputs[0].sha256 = "0".repeat(64);
  assert.ok(
    (await validateGenerationFiles(staleManifest)).some(
      (validationIssue) => validationIssue.code === "generation-input-hash",
    ),
  );
});

test("the no-write build check validates deterministic generated bytes", async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      "--experimental-strip-types",
      "research/v4/capability-graph/src/build.ts",
      "--check",
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
  assert.equal(stderr, "");
  assert.match(stdout, /Verified 149 mechanisms/);
});
