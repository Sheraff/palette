import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  compareCodeUnits,
  computeGenerationDigest,
  EXPECTED_GENERATION_INPUT_PATHS,
  EXPECTED_SOURCE_FRAGMENT_MANIFEST,
  readStrictJson,
  readStrictText,
  serializeCanonical as serialize,
  sha256,
  type StrictTextFile,
} from "./generation.ts";

import {
  COMPATIBILITY_WARNING,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  GRAPH_SCHEMA_VERSION,
  PINNED_SOURCE_COMMIT_DATE,
  PRODUCT_FOCUS_WARNING,
  type ArtifactType,
  type CapabilityGraph,
  type CapabilityGroups,
  type GeneratedAnalysis,
  type GenerationInputReference,
  type MappingFragment,
  type MechanismRecord,
  type NeverProvidedInputType,
  type NeverUsedOutputType,
  type PortReference,
  type ProductFocusAnalysis,
  type SourceFragmentReference,
} from "./types.ts";
import {
  deriveCompatibilityTopology,
  deriveProductFocus,
  validateCapabilityGraph,
  validateFragment,
  type ValidationIssue,
} from "./validate.ts";

const execFileAsync = promisify(execFile);
const GRAPH_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY_ROOT = resolve(GRAPH_ROOT, "../../..");
const GROUPS_PATH = resolve(GRAPH_ROOT, "data/capability-groups.json");
const FRAGMENTS_PATH = resolve(GRAPH_ROOT, "data/fragments");
const GRAPH_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/capability-graph.schema.json");
const FRAGMENT_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/fragment.schema.json");
const SOURCE_PATH = resolve(REPOSITORY_ROOT, "research/v4/MECHANISMS.md");
const GRAPH_OUTPUT_PATH = resolve(GRAPH_ROOT, "data/capability-graph.json");
const ANALYSIS_OUTPUT_PATH = resolve(GRAPH_ROOT, "data/orphan-analysis.json");
const ORPHANS_OUTPUT_PATH = resolve(GRAPH_ROOT, "ORPHANS.md");
const PRODUCT_CONNECTIVITY_OUTPUT_PATH = resolve(GRAPH_ROOT, "PRODUCT_CONNECTIVITY.md");
const ORPHAN_ROW_WARNING =
  "An orphan row is a topology observation, not automatically a gap: optional absence, unused alternatives, classified external roots, and intentional handoffs remain visible.";

interface LoadedFragment extends StrictTextFile {
  fileName: string;
  path: string;
  value: MappingFragment;
}

export interface BuildOutputs {
  graph: CapabilityGraph;
  analysis: GeneratedAnalysis;
  orphanMarkdown: string;
  productConnectivityMarkdown: string;
}

export interface BuildOptions {
  check?: boolean;
}

function assertSafeRepositoryPath(path: string): void {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("//") ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe repository-relative path: ${path}`);
  }
  const absolute = resolve(REPOSITORY_ROOT, path);
  const fromRoot = relative(REPOSITORY_ROOT, absolute);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) {
    throw new Error(`Repository-relative path escapes the repository: ${path}`);
  }
}

function repositoryPath(absolutePath: string): string {
  const path = relative(REPOSITORY_ROOT, absolutePath).split(sep).join("/");
  assertSafeRepositoryPath(path);
  return path;
}

function formatIssues(path: string, issues: readonly ValidationIssue[]): string {
  return [
    `${path}: semantic validation failed:`,
    ...issues.map(
      (validationIssue) =>
        `  ${validationIssue.code}\t${validationIssue.path}\t${validationIssue.message}`,
    ),
  ].join("\n");
}

function compareById(left: { id: string }, right: { id: string }): number {
  return compareCodeUnits(left.id, right.id);
}

function portReferenceText(reference: PortReference): string {
  return `\`${reference.mechanismId}:${reference.portId}\``;
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function neverProvidedRows(
  entries: readonly NeverProvidedInputType[],
  artifactById: ReadonlyMap<string, ArtifactType>,
): string[] {
  return entries.flatMap((entry) =>
    entry.consumerPortDetails.map((detail) => {
      const artifact = artifactById.get(entry.artifactTypeId);
      const alternative = detail.alternativeGroup
        ? `${detail.alternativeGroup.id} (${detail.alternativeGroup.producerBackedMemberPortCount}/${detail.alternativeGroup.memberPortCount} producer-backed)`
        : "-";
      return `| \`${entry.artifactTypeId}\` | ${markdownCell(artifact?.label ?? "Unknown artifact")} | ${entry.boundaryClassification} | ${entry.disposition} | ${portReferenceText(detail.port)} | ${detail.requirement} | ${markdownCell(alternative)} | ${detail.producerAvailability} | ${detail.obligationClassification} |`;
    }),
  );
}

function neverUsedRows(
  entries: readonly NeverUsedOutputType[],
  artifactById: ReadonlyMap<string, ArtifactType>,
): string[] {
  return entries.flatMap((entry) =>
    entry.producerPortDetails.map((detail) => {
      const artifact = artifactById.get(entry.artifactTypeId);
      return `| \`${entry.artifactTypeId}\` | ${markdownCell(artifact?.label ?? "Unknown artifact")} | ${entry.boundaryClassification} | ${entry.disposition} | ${portReferenceText(detail.port)} | ${detail.disposition} | ${markdownCell(detail.terminalPurpose ?? "Unclassified")} |`;
    }),
  );
}

function buildOrphanMarkdown(
  analysis: GeneratedAnalysis,
  artifactTypes: readonly ArtifactType[],
): string {
  const artifactById = new Map(artifactTypes.map((artifact) => [artifact.id, artifact]));
  const providedRows = neverProvidedRows(
    analysis.orphans.neverProvidedInputTypes,
    artifactById,
  );
  const unusedRows = neverUsedRows(
    analysis.orphans.neverUsedOutputTypes,
    artifactById,
  );

  return [
    "# Capability Graph Orphan Analysis",
    "",
    "This file is generated by `research/v4/capability-graph/src/build.ts`. Do not edit it manually.",
    "",
    `- Generation digest: \`${analysis.generationDigest}\``,
    `- Generator: \`${analysis.generator.name}\` version \`${analysis.generator.version}\``,
    "",
    `> ${COMPATIBILITY_WARNING}`,
    "",
    `> ${ORPHAN_ROW_WARNING}`,
    "",
    "For the non-authoritative product-focused projection, see [`PRODUCT_CONNECTIVITY.md`](PRODUCT_CONNECTIVITY.md).",
    "",
    "## Summary",
    "",
    `- Source snapshot: \`${analysis.sourceFragments.length}\` mapping fragments over the pinned 149-mechanism census.`,
    `- Artifact types: ${analysis.counts.artifactTypes}.`,
    `- Mechanisms: ${analysis.counts.mechanisms}.`,
    `- Input ports: ${analysis.counts.inputPorts}.`,
    `- Output ports: ${analysis.counts.outputPorts}.`,
    `- Compatibility hyperedges: ${analysis.counts.compatibilityHyperedges}.`,
    `- Never-provided input types: ${analysis.counts.neverProvidedInputTypes} across ${analysis.counts.neverProvidedInputPorts} consumer ports.`,
    `- Never-used output types: ${analysis.counts.neverUsedOutputTypes} across ${analysis.counts.neverUsedOutputPorts} producer ports.`,
    `- Direct obligations: ${analysis.obligationCounts.directObligations}.`,
    `- Collective alternative-group obligations: ${analysis.obligationCounts.collectiveAlternativeGroupObligations}.`,
    `- Optional absences: ${analysis.obligationCounts.optionalAbsences}.`,
    `- Unused alternatives: ${analysis.obligationCounts.unusedAlternatives}.`,
    "",
    "## Never-Provided Input Ports",
    "",
    "Every type-level orphan remains listed. Port rows distinguish actual obligations from optional absence and alternatives whose group is already producer-backed.",
    "",
    "| Artifact type | Label | Boundary | Type disposition | Consumer port | Requirement | Alternative group | Producer availability | Obligation classification |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(providedRows.length > 0
      ? providedRows
      : ["| _None_ |  |  |  |  |  |  |  |  |"]),
    "",
    "## Never-Used Output Ports",
    "",
    "Every type-level orphan remains listed. Per-port dispositions expose intentional terminals, product terminals, external handoffs, unresolved terminals, and unclassified internal outputs.",
    "",
    "| Artifact type | Label | Boundary | Type disposition | Producer port | Port disposition | Terminal purpose |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(unusedRows.length > 0
      ? unusedRows
      : ["| _None_ |  |  |  |  |  |  |"]),
    "",
  ].join("\n");
}

function buildProductConnectivityMarkdown(
  analysis: GeneratedAnalysis,
  artifactTypes: readonly ArtifactType[],
): string {
  const focus = analysis.productFocus;
  const artifactById = new Map(artifactTypes.map((artifact) => [artifact.id, artifact]));
  const materializerRows = focus.materializerGaps.map((gap) => {
    const artifact = artifactById.get(gap.artifactTypeId);
    return `| \`${gap.artifactTypeId}\` | ${markdownCell(artifact?.label ?? "Unknown artifact")} | ${gap.status} |`;
  });
  const inputRows = focus.openInputContracts.map((contract) => {
    const artifact = artifactById.get(contract.artifactTypeId);
    return `| \`${contract.artifactTypeId}\` | ${markdownCell(artifact?.label ?? "Unknown artifact")} | ${portReferenceText(contract.consumerPort)} | ${contract.kind} |`;
  });
  const alternativeRows = focus.openAlternativeContracts.map(
    (contract) =>
      `| \`${contract.mechanismId}:${contract.alternativeGroupId}\` | ${contract.artifactTypeIds.map((id) => `\`${id}\``).join("<br>")} | ${contract.memberPorts.map(portReferenceText).join("<br>")} | ${contract.kind} |`,
  );
  const outputRows = focus.openOutputContracts.map((contract) => {
    const artifact = artifactById.get(contract.artifactTypeId);
    return `| \`${contract.artifactTypeId}\` | ${markdownCell(artifact?.label ?? "Unknown artifact")} | ${contract.producerPorts.map(portReferenceText).join("<br>")} | ${contract.kind} |`;
  });

  return [
    "# Product Connectivity",
    "",
    "This file is generated by `research/v4/capability-graph/src/build.ts`. Do not edit it manually.",
    "",
    `- Generation digest: \`${analysis.generationDigest}\``,
    `- Generator: \`${analysis.generator.name}\` version \`${analysis.generator.version}\``,
    "- Full exhaustive topology report: [`ORPHANS.md`](ORPHANS.md)",
    "",
    `> ${PRODUCT_FOCUS_WARNING}`,
    "",
    "## Confirmed Structural Gap",
    "",
    "The current snapshot has one confirmed structural gap: no primary mechanism emits the exact v3 UI Palette product contract. No open-contract observation below is included in this confirmed set.",
    "",
    "| Artifact type | Label | Status |",
    "| --- | --- | --- |",
    ...(materializerRows.length > 0 ? materializerRows : ["| _None_ |  |  |"]),
    "",
    "## Candidate Open Contract Observations",
    "",
    "Open contracts are candidate connectivity observations. Their topology classifications record exact-type primary-provider visibility and primary-consumer visibility without prescribing work, sequence, mechanism inventory, or trial decisions.",
    "",
    "An open contract becomes a confirmed gap only if a future selected composition requires that exact contract. Exploration may implement a narrow mechanism with local typed I/O without closing or registering these contracts.",
    "",
    `- Open input contracts: ${focus.connectivityCounts.openInputContracts}.`,
    `- Open alternative contracts: ${focus.connectivityCounts.openAlternativeContracts}.`,
    `- Open output contracts: ${focus.connectivityCounts.openOutputContracts}.`,
    "",
    "<details>",
    `<summary>Open input contract observations (${focus.connectivityCounts.openInputContracts})</summary>`,
    "",
    "Expected-external roots remain boundary context and are excluded. The topology classification describes producer visibility only.",
    "",
    "| Artifact type | Label | Consumer port | Topology classification |",
    "| --- | --- | --- | --- |",
    ...(inputRows.length > 0 ? inputRows : ["| _None_ |  |  |  |"]),
    "",
    "</details>",
    "",
    "<details>",
    `<summary>Open alternative contract observations (${focus.connectivityCounts.openAlternativeContracts})</summary>`,
    "",
    "Each row records an alternative group with no exact primary producer-backed product-flow member in the current registry.",
    "",
    "| Alternative group | Artifact types | Member ports | Topology classification |",
    "| --- | --- | --- | --- |",
    ...(alternativeRows.length > 0 ? alternativeRows : ["| _None_ |  |  |  |"]),
    "",
    "</details>",
    "",
    "<details>",
    `<summary>Open output contract observations (${focus.connectivityCounts.openOutputContracts})</summary>`,
    "",
    "Each row records an internal nonterminal product-flow output with no primary natural consumer in the current registry.",
    "",
    "| Artifact type | Label | Producer ports | Topology classification |",
    "| --- | --- | --- | --- |",
    ...(outputRows.length > 0 ? outputRows : ["| _None_ |  |  |"]),
    "",
    "</details>",
    "",
    "## Projection Context",
    "",
    `- Primary mechanisms: ${focus.primaryMechanismIds.length}.`,
    `- Primary product-flow artifacts: ${focus.primaryArtifactIds.length}.`,
    `- Primary product-flow incidences: ${focus.primaryIncidences.length}.`,
    `- Inspector/context input ports: ${focus.inspectorInputPorts.length}.`,
    `- Secondary-overlay mechanisms: ${focus.secondaryOverlayMechanismIds.length}.`,
    `- Directly attached secondary-overlay artifacts: ${focus.secondaryOverlayArtifactIds.length}.`,
    `- Full-analysis-only registry: ${focus.fullOnlyArtifactIds.length} artifacts and ${focus.fullOnlyMechanismIds.length} mechanisms.`,
    `- Full registry retained: ${focus.fullRegistryCounts.mechanisms} mechanisms, ${focus.fullRegistryCounts.artifacts} artifacts, and ${focus.fullRegistryCounts.incidences} incidences.`,
    "",
  ].join("\n");
}

async function gitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  return stdout.trim();
}

async function verifyGitSnapshot(
  snapshot: MappingFragment["sourceSnapshot"],
): Promise<void> {
  assertSafeRepositoryPath(snapshot.path);
  const [tree, blob, timestamp, currentBlob] = await Promise.all([
    gitOutput(["rev-parse", `${snapshot.gitCommit}^{tree}`]),
    gitOutput(["rev-parse", `${snapshot.gitCommit}:${snapshot.path}`]),
    gitOutput(["show", "-s", "--format=%cI", snapshot.gitCommit]),
    gitOutput(["hash-object", "--no-filters", "--", snapshot.path]),
  ]);
  const checks = [
    ["gitTree", snapshot.gitTree, tree],
    ["gitBlob", snapshot.gitBlob, blob],
    ["gitCommitTimestamp", snapshot.gitCommitTimestamp, timestamp],
    ["current source blob", snapshot.gitBlob, currentBlob],
  ] as const;
  for (const [name, declared, actual] of checks) {
    if (declared !== actual) {
      throw new Error(
        `Pinned source ${name} mismatch: declared ${declared}, Git reports ${actual}.`,
      );
    }
  }
}

function obligationCounts(
  entries: readonly NeverProvidedInputType[],
): GeneratedAnalysis["obligationCounts"] {
  const details = entries.flatMap((entry) => entry.consumerPortDetails);
  const collectiveGroups = new Set(
    details
      .filter(
        (detail) =>
          detail.obligationClassification ===
            "collective-alternative-group-obligation" && detail.alternativeGroup,
      )
      .map(
        (detail) =>
          `${detail.port.mechanismId}\u0000${detail.alternativeGroup?.id ?? ""}`,
      ),
  );
  return {
    directObligations: details.filter(
      (detail) => detail.obligationClassification === "direct-obligation",
    ).length,
    collectiveAlternativeGroupObligations: collectiveGroups.size,
    optionalAbsences: details.filter(
      (detail) => detail.obligationClassification === "optional-absence",
    ).length,
    unusedAlternatives: details.filter(
      (detail) => detail.obligationClassification === "unused-alternative",
    ).length,
  };
}

async function writeOutputsFromStaging(
  outputs: readonly { path: string; content: string }[],
): Promise<void> {
  const staged: Array<{ path: string; temporaryPath: string }> = [];
  try {
    for (const output of outputs) {
      const temporaryPath = `${output.path}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temporaryPath, output.content, { encoding: "utf8", flag: "wx" });
      staged.push({ path: output.path, temporaryPath });
    }
    for (const output of staged) {
      await rename(output.temporaryPath, output.path);
    }
  } finally {
    await Promise.all(
      staged.map(({ temporaryPath }) =>
        unlink(temporaryPath).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }),
      ),
    );
  }
}

async function checkOutputs(
  outputs: readonly { path: string; content: string }[],
): Promise<void> {
  const stale: string[] = [];
  for (const output of outputs) {
    try {
      const actual = await readFile(output.path);
      if (!actual.equals(Buffer.from(output.content, "utf8"))) {
        stale.push(repositoryPath(output.path));
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        stale.push(repositoryPath(output.path));
      } else {
        throw error;
      }
    }
  }
  if (stale.length > 0) {
    throw new Error(
      `Generated outputs are stale or missing:\n${stale.map((path) => `  ${path}`).join("\n")}`,
    );
  }
}

export async function buildCapabilityGraph(
  options: BuildOptions = {},
): Promise<BuildOutputs> {
  const discoveredFragmentFileNames = (await readdir(FRAGMENTS_PATH))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort(compareCodeUnits);
  const expectedFragmentFileNames = EXPECTED_SOURCE_FRAGMENT_MANIFEST.map(
    ({ path }) => path.slice(path.lastIndexOf("/") + 1),
  ).sort(compareCodeUnits);
  if (serialize(discoveredFragmentFileNames) !== serialize(expectedFragmentFileNames)) {
    const missing = expectedFragmentFileNames.filter(
      (fileName) => !discoveredFragmentFileNames.includes(fileName),
    );
    const extra = discoveredFragmentFileNames.filter(
      (fileName) => !expectedFragmentFileNames.includes(fileName),
    );
    throw new Error(
      `Fragment directory does not match the generator ${GENERATOR_VERSION} manifest; missing [${missing.join(", ")}], extra [${extra.join(", ")}].`,
    );
  }
  for (const fileName of discoveredFragmentFileNames) {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(fileName)) {
      throw new Error(`Unsafe fragment file name: ${fileName}`);
    }
  }

  const [groupsFile, graphSchemaFile, fragmentSchemaFile, sourceFile, loaded] =
    await Promise.all([
      readStrictJson<CapabilityGroups>(GROUPS_PATH),
      readStrictJson<Record<string, unknown>>(GRAPH_SCHEMA_PATH),
      readStrictJson<Record<string, unknown>>(FRAGMENT_SCHEMA_PATH),
      readStrictText(SOURCE_PATH),
      Promise.all(
        EXPECTED_SOURCE_FRAGMENT_MANIFEST.map(async (expected): Promise<LoadedFragment> => {
          const path = resolve(REPOSITORY_ROOT, expected.path);
          const fileName = expected.path.slice(expected.path.lastIndexOf("/") + 1);
          const file = await readStrictJson<MappingFragment>(path);
          if (file.value.fragmentId !== expected.fragmentId) {
            throw new Error(
              `${fileName}: expected fragmentId ${expected.fragmentId}; found ${file.value.fragmentId}.`,
            );
          }
          return { fileName, path, ...file };
        }),
      ),
    ]);

  const groups = groupsFile.value;
  const graphSchema = graphSchemaFile.value;
  const fragmentSchema = fragmentSchemaFile.value;
  const sourceText = sourceFile.text;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: false,
  });
  ajv.addSchema(graphSchema);
  const graphSchemaId = graphSchema.$id;
  if (typeof graphSchemaId !== "string") {
    throw new Error(`${GRAPH_SCHEMA_PATH}: schema has no $id.`);
  }
  const validateGraphSchema = ajv.getSchema(graphSchemaId);
  if (!validateGraphSchema) {
    throw new Error(`${GRAPH_SCHEMA_PATH}: failed to compile graph schema.`);
  }
  const validateGroupsSchema = ajv.compile({
    $ref: `${graphSchemaId}#/$defs/capabilityGroups`,
  });
  const validateFragmentSchema = ajv.compile(fragmentSchema);
  const validateAnalysisSchema = ajv.compile({
    $ref: `${graphSchemaId}#/$defs/generatedAnalysis`,
  });
  if (!validateGroupsSchema(groups)) {
    throw new Error(
      `Capability groups failed JSON Schema validation:\n${ajv.errorsText(validateGroupsSchema.errors, { separator: "\n" })}`,
    );
  }

  const fragments = loaded;
  for (const fragment of fragments) {
    if (!validateFragmentSchema(fragment.value)) {
      throw new Error(
        `${fragment.fileName}: JSON Schema validation failed:\n${ajv.errorsText(validateFragmentSchema.errors, { separator: "\n" })}`,
      );
    }
    const issues = validateFragment(fragment.value, groups, sourceText);
    if (issues.length > 0) throw new Error(formatIssues(fragment.fileName, issues));
  }

  const sourceSnapshotText = serialize(fragments[0].value.sourceSnapshot);
  for (const fragment of fragments.slice(1)) {
    if (serialize(fragment.value.sourceSnapshot) !== sourceSnapshotText) {
      throw new Error(
        `${fragment.fileName}: source snapshot conflicts with ${fragments[0].fileName}.`,
      );
    }
  }
  await verifyGitSnapshot(fragments[0].value.sourceSnapshot);

  const artifactById = new Map<
    string,
    { artifact: ArtifactType; fragmentId: string }
  >();
  const mechanismById = new Map<
    string,
    { mechanism: MechanismRecord; fragmentId: string }
  >();
  for (const fragment of fragments) {
    for (const artifact of fragment.value.artifactTypes) {
      const existing = artifactById.get(artifact.id);
      if (existing && serialize(existing.artifact) !== serialize(artifact)) {
        throw new Error(
          `Conflicting artifact definition ${artifact.id} in ${existing.fragmentId} and ${fragment.value.fragmentId}.`,
        );
      }
      artifactById.set(artifact.id, {
        artifact,
        fragmentId: existing?.fragmentId ?? fragment.value.fragmentId,
      });
    }
    for (const mechanism of fragment.value.mechanismTypings) {
      const existing = mechanismById.get(mechanism.id);
      if (existing) {
        throw new Error(
          `Duplicate mechanism ${mechanism.id} in ${existing.fragmentId} and ${fragment.value.fragmentId}.`,
        );
      }
      mechanismById.set(mechanism.id, {
        mechanism,
        fragmentId: fragment.value.fragmentId,
      });
    }
  }

  const artifactTypes = [...artifactById.values()]
    .map(({ artifact }) => artifact)
    .sort(compareById);
  const mechanisms = [...mechanismById.values()]
    .map(({ mechanism }) => mechanism)
    .sort(compareById);
  const sourceFragments: SourceFragmentReference[] = fragments.map((fragment) => ({
    fragmentId: fragment.value.fragmentId,
    path: repositoryPath(fragment.path),
    sha256: sha256(fragment.bytes),
    byteLength: fragment.bytes.byteLength,
  }));
  const generationInputFiles = [
    { path: GROUPS_PATH, bytes: groupsFile.bytes },
    { path: GRAPH_SCHEMA_PATH, bytes: graphSchemaFile.bytes },
    { path: FRAGMENT_SCHEMA_PATH, bytes: fragmentSchemaFile.bytes },
    { path: SOURCE_PATH, bytes: sourceFile.bytes },
    ...fragments.map((fragment) => ({ path: fragment.path, bytes: fragment.bytes })),
  ];
  const generationInputFileByPath = new Map(
    generationInputFiles.map((input) => [repositoryPath(input.path), input]),
  );
  const actualGenerationInputPaths = [...generationInputFileByPath.keys()].sort(
    compareCodeUnits,
  );
  if (serialize(actualGenerationInputPaths) !== serialize(EXPECTED_GENERATION_INPUT_PATHS)) {
    throw new Error(
      `Generator ${GENERATOR_VERSION} input set conflicts with its canonical manifest.`,
    );
  }
  const generationInputs: GenerationInputReference[] = EXPECTED_GENERATION_INPUT_PATHS.map(
    (path) => {
      const input = generationInputFileByPath.get(path);
      if (!input) throw new Error(`Missing required generation input: ${path}`);
      return {
        path,
        sha256: sha256(input.bytes),
        byteLength: input.bytes.byteLength,
      };
    },
  );
  const generationDigest = computeGenerationDigest({
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    generatedAt: PINNED_SOURCE_COMMIT_DATE,
    sourceSnapshot: fragments[0].value.sourceSnapshot,
    generationInputs,
  });

  const topology = deriveCompatibilityTopology(artifactTypes, mechanisms);
  const productFocus: ProductFocusAnalysis = deriveProductFocus(artifactTypes, mechanisms);
  const inputPortCount = mechanisms.reduce(
    (count, mechanism) => count + mechanism.inputPorts.length,
    0,
  );
  const outputPortCount = mechanisms.reduce(
    (count, mechanism) => count + mechanism.outputPorts.length,
    0,
  );
  const neverProvidedInputPortCount = topology.neverProvidedInputTypes.reduce(
    (count, entry) => count + entry.consumerPorts.length,
    0,
  );
  const neverUsedOutputPortCount = topology.neverUsedOutputTypes.reduce(
    (count, entry) => count + entry.producerPorts.length,
    0,
  );
  const analysis: GeneratedAnalysis = {
    generatedAt: PINNED_SOURCE_COMMIT_DATE,
    generationDigest,
    generator: {
      name: GENERATOR_NAME,
      version: GENERATOR_VERSION,
    },
    generationInputs,
    sourceFragments,
    counts: {
      artifactTypes: artifactTypes.length,
      mechanisms: mechanisms.length,
      inputPorts: inputPortCount,
      outputPorts: outputPortCount,
      compatibilityHyperedges: topology.compatibilityHyperedges.length,
      neverProvidedInputTypes: topology.neverProvidedInputTypes.length,
      neverProvidedInputPorts: neverProvidedInputPortCount,
      neverUsedOutputTypes: topology.neverUsedOutputTypes.length,
      neverUsedOutputPorts: neverUsedOutputPortCount,
    },
    obligationCounts: obligationCounts(topology.neverProvidedInputTypes),
    productFocus,
    compatibilityHyperedges: topology.compatibilityHyperedges,
    orphans: {
      neverProvidedInputTypes: topology.neverProvidedInputTypes,
      neverUsedOutputTypes: topology.neverUsedOutputTypes,
    },
    warnings: [COMPATIBILITY_WARNING, ORPHAN_ROW_WARNING],
  };
  const graph: CapabilityGraph = {
    $schema: "../schema/capability-graph.schema.json",
    documentKind: "typed-capability-compatibility-hypergraph",
    schemaVersion: GRAPH_SCHEMA_VERSION,
    semantics: {
      relation: "candidate-semantic-compatibility",
      sameArtifactTypeAssertsTestedBinding: false,
      assertsDependencyGraph: false,
      assertsArchitecture: false,
      assertsBuildOrder: false,
    },
    generationDigest,
    sourceSnapshot: fragments[0].value.sourceSnapshot,
    capabilityGroups: groups,
    artifactTypes,
    mechanisms,
    analysis,
  };

  if (!validateGraphSchema(graph)) {
    throw new Error(
      `Generated graph failed JSON Schema validation:\n${ajv.errorsText(validateGraphSchema.errors, { separator: "\n" })}`,
    );
  }
  if (!validateAnalysisSchema(analysis)) {
    throw new Error(
      `Generated orphan analysis failed JSON Schema validation:\n${ajv.errorsText(validateAnalysisSchema.errors, { separator: "\n" })}`,
    );
  }
  const graphIssues = validateCapabilityGraph(graph, sourceText);
  if (graphIssues.length > 0) {
    throw new Error(formatIssues("generated capability graph", graphIssues));
  }

  const orphanMarkdown = buildOrphanMarkdown(analysis, artifactTypes);
  const productConnectivityMarkdown = buildProductConnectivityMarkdown(
    analysis,
    artifactTypes,
  );
  const generatedOutputs = [
    { path: GRAPH_OUTPUT_PATH, content: serialize(graph) },
    { path: ANALYSIS_OUTPUT_PATH, content: serialize(analysis) },
    { path: ORPHANS_OUTPUT_PATH, content: orphanMarkdown },
    {
      path: PRODUCT_CONNECTIVITY_OUTPUT_PATH,
      content: productConnectivityMarkdown,
    },
  ];
  if (options.check) {
    await checkOutputs(generatedOutputs);
  } else {
    await writeOutputsFromStaging(generatedOutputs);
  }

  return { graph, analysis, orphanMarkdown, productConnectivityMarkdown };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--check") || arguments_.length > 1) {
    console.error("Usage: build.ts [--check]");
    process.exitCode = 1;
  } else {
    const check = arguments_[0] === "--check";
    buildCapabilityGraph({ check })
      .then(({ analysis }) => {
        console.log(
          `${check ? "Verified" : "Generated"} ${analysis.counts.mechanisms} mechanisms, ${analysis.counts.artifactTypes} artifact types, ${analysis.counts.compatibilityHyperedges} compatibility hyperedges, ${analysis.counts.neverProvidedInputTypes} never-provided types, and ${analysis.counts.neverUsedOutputTypes} never-used types.`,
        );
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
