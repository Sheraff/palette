import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  compareCodeUnits,
  computeGenerationDigest,
  EXPECTED_GENERATION_INPUT_PATHS,
  EXPECTED_SOURCE_FRAGMENT_MANIFEST,
  readStrictJson,
  readStrictText,
  serializeCanonical,
  sha256,
} from "./generation.ts";

import {
  ALTERNATIVE_SELECTION_CARDINALITIES,
  ARTIFACT_CATEGORIES,
  ARTIFACT_INSPECTION_VALUE_KINDS,
  ARTIFACT_PRODUCT_FOCI,
  AUTHORIZATION_TOKENS,
  BOUNDARY_CLASSIFICATIONS,
  COMPATIBILITY_WARNING,
  CONTRACT_MATURITIES,
  DATA_PLANES,
  EVIDENCE_SCOPES,
  EXPECTED_MECHANISM_COUNT,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  GRAPH_SCHEMA_VERSION,
  IMPLEMENTATION_STATES,
  INPUT_CLASSES,
  INPUT_REQUIREMENTS,
  LEFT_PRODUCT_ANCHOR_ARTIFACT_ID,
  MECHANISM_FOCUS_CLASSES,
  NEVER_PROVIDED_DISPOSITIONS,
  NEVER_USED_DISPOSITIONS,
  OPEN_CONTRACT_CONFIRMATION_CONDITION,
  OPEN_CONTRACT_SEMANTIC,
  OUTPUT_SELECTION_CARDINALITIES,
  PINNED_SOURCE_SNAPSHOT,
  PORT_CARDINALITIES,
  PRODUCT_FOCUS_WARNING,
  RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  RUNTIME_ADMISSIBILITIES,
  SCIENTIFIC_INTERPRETATIONS,
  VALUE_CONSTRAINT_COMPARATORS,
  type ArtifactType,
  type BoundaryClassification,
  type CapabilityGraph,
  type CapabilityGroups,
  type CompatibilityHyperedge,
  type GeneratedAnalysis,
  type GeneratedPortDetail,
  type InputObligationClassification,
  type MappingFragment,
  type MechanismRecord,
  type NeverProvidedDisposition,
  type NeverProvidedInputType,
  type NeverProvidedInputPortDetail,
  type NeverUsedDisposition,
  type NeverUsedOutputType,
  type NeverUsedOutputPortDetail,
  type PortReference,
  type OpenInputContractKind,
  type ProductFocusAnalysis,
  type SourceSnapshot,
} from "./types.ts";

export const MECHANISM_CENSUS_PATH = "research/v4/MECHANISMS.md" as const;
const GRAPH_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY_ROOT = resolve(GRAPH_ROOT, "../../..");
const GRAPH_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/capability-graph.schema.json");
const FRAGMENT_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/fragment.schema.json");

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface CensusEntry {
  id: string;
  title: string;
  headingText: string;
  headingLine: number;
  authorizationText: string;
  statusText: string;
}

export interface DerivedCompatibilityTopology {
  compatibilityHyperedges: CompatibilityHyperedge[];
  neverProvidedInputTypes: NeverProvidedInputType[];
  neverUsedOutputTypes: NeverUsedOutputType[];
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function isInVocabulary(value: unknown, vocabulary: readonly string[]): boolean {
  return typeof value === "string" && vocabulary.includes(value);
}

function duplicateIssues(
  values: readonly string[],
  path: string,
  noun: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates]
    .sort(compareCodeUnits)
    .map((value) => issue("duplicate-id", path, `Duplicate ${noun} ID: ${value}`));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

function normalizedLines(sourceText: string): string[] {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function normalizeBullet(parts: readonly string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractBullet(
  lines: readonly string[],
  start: number,
  end: number,
  label: "Authorization" | "Status",
): string {
  const prefix = `- **${label}:**`;
  for (let index = start; index < end; index += 1) {
    if (!lines[index].startsWith(prefix)) continue;
    const parts = [lines[index].slice(prefix.length).trim()];
    for (let continuation = index + 1; continuation < end; continuation += 1) {
      const line = lines[continuation];
      if (line === "" || /^- \*\*/.test(line)) break;
      parts.push(line.trim());
    }
    return normalizeBullet(parts);
  }
  return "";
}

export function parseMechanismCensus(sourceText: string): CensusEntry[] {
  const lines = normalizedLines(sourceText);
  const headings: Array<Omit<CensusEntry, "authorizationText" | "statusText">> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^### `([^`]+)` - (.+)$/.exec(lines[index]);
    if (!match) continue;
    headings.push({
      id: match[1],
      title: match[2],
      headingText: lines[index],
      headingLine: index + 1,
    });
  }

  return headings.map((heading, index) => {
    const start = heading.headingLine;
    const end = headings[index + 1]?.headingLine ?? lines.length;
    return {
      ...heading,
      authorizationText: extractBullet(lines, start, end, "Authorization"),
      statusText: extractBullet(lines, start, end, "Status"),
    };
  });
}

function repositoryRelativePathIssues(path: string, at: string): ValidationIssue[] {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("//") ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return [
      issue(
        "source-path",
        at,
        `Source path must be normalized and repository-relative: ${path}`,
      ),
    ];
  }
  return [];
}

export function validateCapabilityGroups(groups: CapabilityGroups): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const positionIds = groups.axis.positions.map((position) => position.id);
  const laneIds = groups.lanes.map((lane) => lane.id);
  const capabilityIds = groups.capabilities.map((capability) => capability.id);

  issues.push(
    ...duplicateIssues(positionIds, "capabilityGroups.axis.positions", "axis position"),
    ...duplicateIssues(
      groups.axis.positions.map((position) => String(position.order)),
      "capabilityGroups.axis.positions",
      "axis order",
    ),
    ...duplicateIssues(laneIds, "capabilityGroups.lanes", "lane"),
    ...duplicateIssues(capabilityIds, "capabilityGroups.capabilities", "capability"),
  );

  const sortedOrders = groups.axis.positions
    .map((position) => position.order)
    .sort((left, right) => left - right);
  sortedOrders.forEach((order, index) => {
    if (order !== index) {
      issues.push(
        issue(
          "axis-order",
          "capabilityGroups.axis.positions",
          "Axis orders must be unique and contiguous from zero.",
        ),
      );
    }
  });

  groups.capabilities.forEach((capability, index) => {
    if (!positionIds.includes(capability.axisPositionId)) {
      issues.push(
        issue(
          "unknown-axis-position",
          `capabilityGroups.capabilities[${index}].axisPositionId`,
          `Unknown axis position: ${capability.axisPositionId}`,
        ),
      );
    }
    if (!laneIds.includes(capability.laneId)) {
      issues.push(
        issue(
          "unknown-lane",
          `capabilityGroups.capabilities[${index}].laneId`,
          `Unknown lane: ${capability.laneId}`,
        ),
      );
    }
  });

  for (const [side, anchor] of Object.entries(groups.productAnchors)) {
    if (!positionIds.includes(anchor.axisPositionId)) {
      issues.push(
        issue(
          "unknown-axis-position",
          `capabilityGroups.productAnchors.${side}.axisPositionId`,
          `Unknown axis position: ${anchor.axisPositionId}`,
        ),
      );
    }
    if (!laneIds.includes(anchor.laneId)) {
      issues.push(
        issue(
          "unknown-lane",
          `capabilityGroups.productAnchors.${side}.laneId`,
          `Unknown lane: ${anchor.laneId}`,
        ),
      );
    }
  }

  if (
    groups.productAnchors.left.artifactTypeId !==
      LEFT_PRODUCT_ANCHOR_ARTIFACT_ID ||
    groups.productAnchors.left.axisPositionId !== "commitment.native-source"
  ) {
    issues.push(
      issue(
        "left-product-anchor",
        "capabilityGroups.productAnchors.left",
        "The left product anchor must be the native opaque sRGB8 raster at native-source commitment.",
      ),
    );
  }
  if (
    groups.productAnchors.right.artifactTypeId !==
      RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID ||
    groups.productAnchors.right.axisPositionId !== "commitment.exact-product-contract"
  ) {
    issues.push(
      issue(
        "right-product-anchor",
        "capabilityGroups.productAnchors.right",
        "The right product anchor must be the exact v3 UI Palette product contract at exact-product-contract commitment.",
      ),
    );
  }

  if (
    groups.semantics.orderingMeaning !== "semantic-commitment-only" ||
    groups.semantics.dependencyMeaning !== "none" ||
    groups.semantics.maturityMeaning !== "none"
  ) {
    issues.push(
      issue(
        "axis-semantics",
        "capabilityGroups.semantics",
        "The horizontal axis may encode semantic commitment only.",
      ),
    );
  }
  if (
    groups.topologyPolicy.cycles !== "permitted" ||
    groups.topologyPolicy.fanOut !== "permitted" ||
    groups.topologyPolicy.convergence !== "permitted" ||
    groups.topologyPolicy.externalRoots !== "permitted-and-classified"
  ) {
    issues.push(
      issue(
        "topology-policy",
        "capabilityGroups.topologyPolicy",
        "External roots, cycles, fan-out, and convergence must remain permitted.",
      ),
    );
  }

  return issues;
}

export function validateUniqueIds(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
  groups: CapabilityGroups,
  sourceFragmentIds: readonly string[] = [],
): ValidationIssue[] {
  const issues = [
    ...duplicateIssues(
      artifactTypes.map((artifact) => artifact.id),
      "artifactTypes",
      "artifact type",
    ),
    ...duplicateIssues(
      mechanisms.map((mechanism) => mechanism.id),
      "mechanisms",
      "mechanism",
    ),
    ...duplicateIssues(sourceFragmentIds, "analysis.sourceFragments", "fragment"),
  ];

  mechanisms.forEach((mechanism, mechanismIndex) => {
    issues.push(
      ...duplicateIssues(
        [
          ...mechanism.inputPorts.map((port) => port.id),
          ...mechanism.outputPorts.map((port) => port.id),
        ],
        `mechanisms[${mechanismIndex}]`,
        "port",
      ),
      ...duplicateIssues(
        mechanism.alternativeGroups.map((group) => group.id),
        `mechanisms[${mechanismIndex}].alternativeGroups`,
        "alternative group",
      ),
      ...duplicateIssues(
        (mechanism.outputGroups ?? []).map((group) => group.id),
        `mechanisms[${mechanismIndex}].outputGroups`,
        "output group",
      ),
      ...duplicateIssues(
        (mechanism.conditionalConstraints ?? []).map((constraint) => constraint.id),
        `mechanisms[${mechanismIndex}].conditionalConstraints`,
        "conditional constraint",
      ),
      ...duplicateIssues(
        mechanism.capabilityIds,
        `mechanisms[${mechanismIndex}].capabilityIds`,
        "capability reference",
      ),
    );
  });

  issues.push(...validateCapabilityGroups(groups));
  return issues;
}

function vocabularyArrayIssues(
  values: readonly string[],
  vocabulary: readonly string[],
  path: string,
): ValidationIssue[] {
  return values.flatMap((value, index) =>
    isInVocabulary(value, vocabulary)
      ? []
      : [
          issue(
            "vocabulary",
            `${path}[${index}]`,
            `Value is outside the closed vocabulary: ${value}`,
          ),
        ],
  );
}

function valueConstraintIssues(
  constraint: { comparator: string; value?: unknown },
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isInVocabulary(constraint.comparator, VALUE_CONSTRAINT_COMPARATORS)) {
    issues.push(
      issue(
        "vocabulary",
        `${path}.comparator`,
        `Value is outside the closed vocabulary: ${constraint.comparator}`,
      ),
    );
    return issues;
  }
  const presenceComparator =
    constraint.comparator === "present" || constraint.comparator === "absent";
  if (presenceComparator === (constraint.value !== undefined)) {
    issues.push(
      issue(
        "constraint-value",
        path,
        presenceComparator
          ? "Presence constraints must not declare a comparison value."
          : "Non-presence constraints must declare a comparison value.",
      ),
    );
  }
  if (
    constraint.comparator === "count-between-inclusive" &&
    (!Array.isArray(constraint.value) ||
      constraint.value.length !== 2 ||
      !constraint.value.every((value) => Number.isInteger(value) && value >= 0) ||
      (constraint.value[0] as number) > (constraint.value[1] as number))
  ) {
    issues.push(
      issue(
        "constraint-range",
        `${path}.value`,
        "count-between-inclusive requires an ascending pair of nonnegative integers.",
      ),
    );
  }
  if (
    constraint.comparator === "count-equals" &&
    (!Number.isInteger(constraint.value) || (constraint.value as number) < 0)
  ) {
    issues.push(
      issue(
        "constraint-count",
        `${path}.value`,
        "count-equals requires a nonnegative integer.",
      ),
    );
  }
  if (
    (constraint.comparator === "in" || constraint.comparator === "not-in") &&
    (!Array.isArray(constraint.value) || constraint.value.length === 0)
  ) {
    issues.push(
      issue(
        "constraint-set",
        `${path}.value`,
        `${constraint.comparator} requires a nonempty array of permitted comparison values.`,
      ),
    );
  }
  if (
    [
      "less-than",
      "less-than-or-equal",
      "greater-than",
      "greater-than-or-equal",
    ].includes(constraint.comparator) &&
    (typeof constraint.value !== "number" || !Number.isFinite(constraint.value))
  ) {
    issues.push(
      issue(
        "constraint-number",
        `${path}.value`,
        `${constraint.comparator} requires a finite numeric comparison value.`,
      ),
    );
  }
  return issues;
}

export function validateVocabularies(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  artifactTypes.forEach((artifact, index) => {
    const values: Array<[unknown, readonly string[], string]> = [
      [artifact.productFocus, ARTIFACT_PRODUCT_FOCI, "productFocus"],
      [artifact.category, ARTIFACT_CATEGORIES, "category"],
      [artifact.plane, DATA_PLANES, "plane"],
      [artifact.contractMaturity, CONTRACT_MATURITIES, "contractMaturity"],
      [
        artifact.boundaryClassification,
        BOUNDARY_CLASSIFICATIONS,
        "boundaryClassification",
      ],
    ];
    for (const [value, vocabulary, field] of values) {
      if (!isInVocabulary(value, vocabulary)) {
        issues.push(
          issue(
            "vocabulary",
            `artifactTypes[${index}].${field}`,
            `Value is outside the closed vocabulary: ${String(value)}`,
          ),
        );
      }
    }
    const inspectionPaths = artifact.valueInspection?.paths ?? [];
    issues.push(
      ...duplicateIssues(
        inspectionPaths.map((entry) => entry.valuePath),
        `artifactTypes[${index}].valueInspection.paths`,
        "artifact inspection path",
      ),
    );
    inspectionPaths.forEach((entry, pathIndex) => {
      const entryPath = `artifactTypes[${index}].valueInspection.paths[${pathIndex}]`;
      if (!isInVocabulary(entry.valueKind, ARTIFACT_INSPECTION_VALUE_KINDS)) {
        issues.push(
          issue(
            "vocabulary",
            `${entryPath}.valueKind`,
            `Value is outside the closed vocabulary: ${entry.valueKind}`,
          ),
        );
      }
      issues.push(
        ...duplicateIssues(
          entry.permittedConstraints.map((constraint) =>
            serializeCanonical({
              comparator: constraint.comparator,
              value: constraint.value,
            }),
          ),
          `${entryPath}.permittedConstraints`,
          "permitted artifact value constraint",
        ),
      );
      entry.permittedConstraints.forEach((constraint, constraintIndex) => {
        issues.push(
          ...valueConstraintIssues(
            constraint,
            `${entryPath}.permittedConstraints[${constraintIndex}]`,
          ),
        );
      });
    });
  });

  mechanisms.forEach((mechanism, mechanismIndex) => {
    const statusPath = `mechanisms[${mechanismIndex}].censusStatus`;
    if (!isInVocabulary(mechanism.focusClass, MECHANISM_FOCUS_CLASSES)) {
      issues.push(
        issue(
          "vocabulary",
          `mechanisms[${mechanismIndex}].focusClass`,
          `Value is outside the closed vocabulary: ${String(mechanism.focusClass)}`,
        ),
      );
    }
    issues.push(
      ...vocabularyArrayIssues(
        mechanism.censusStatus.scientificInterpretations,
        SCIENTIFIC_INTERPRETATIONS,
        `${statusPath}.scientificInterpretations`,
      ),
      ...vocabularyArrayIssues(
        mechanism.censusStatus.implementationStates,
        IMPLEMENTATION_STATES,
        `${statusPath}.implementationStates`,
      ),
      ...vocabularyArrayIssues(
        mechanism.censusStatus.evidenceScopes,
        EVIDENCE_SCOPES,
        `${statusPath}.evidenceScopes`,
      ),
      ...vocabularyArrayIssues(
        mechanism.censusStatus.runtimeAdmissibilities,
        RUNTIME_ADMISSIBILITIES,
        `${statusPath}.runtimeAdmissibilities`,
      ),
      ...vocabularyArrayIssues(
        mechanism.censusStatus.authorizationTokens,
        AUTHORIZATION_TOKENS,
        `${statusPath}.authorizationTokens`,
      ),
    );
    if (
      (mechanism.focusClass === "product-transformation" ||
        mechanism.focusClass === "product-admission") &&
      mechanism.censusStatus.runtimeAdmissibilities.every(
        (admissibility) => admissibility === "prohibited",
      )
    ) {
      issues.push(
        issue(
          "product-focus-runtime-prohibited",
          `${statusPath}.runtimeAdmissibilities`,
          "Primary product-focus mechanisms must not be exclusively runtime-prohibited.",
        ),
      );
    }

    mechanism.alternativeGroups.forEach((group, groupIndex) => {
      if (
        !isInVocabulary(
          group.selectionCardinality,
          ALTERNATIVE_SELECTION_CARDINALITIES,
        )
      ) {
        issues.push(
          issue(
            "vocabulary",
            `mechanisms[${mechanismIndex}].alternativeGroups[${groupIndex}].selectionCardinality`,
            `Value is outside the closed vocabulary: ${group.selectionCardinality}`,
          ),
        );
      }
    });

    (mechanism.outputGroups ?? []).forEach((group, groupIndex) => {
      if (
        !isInVocabulary(
          group.selectionCardinality,
          OUTPUT_SELECTION_CARDINALITIES,
        )
      ) {
        issues.push(
          issue(
            "vocabulary",
            `mechanisms[${mechanismIndex}].outputGroups[${groupIndex}].selectionCardinality`,
            `Value is outside the closed vocabulary: ${group.selectionCardinality}`,
          ),
        );
      }
    });

    mechanism.inputPorts.forEach((port, portIndex) => {
      const portPath = `mechanisms[${mechanismIndex}].inputPorts[${portIndex}]`;
      if (!isInVocabulary(port.requirement, INPUT_REQUIREMENTS)) {
        issues.push(
          issue(
            "vocabulary",
            `${portPath}.requirement`,
            `Value is outside the closed vocabulary: ${port.requirement}`,
          ),
        );
      }
      if (!isInVocabulary(port.cardinality, PORT_CARDINALITIES)) {
        issues.push(
          issue(
            "vocabulary",
            `${portPath}.cardinality`,
            `Value is outside the closed vocabulary: ${port.cardinality}`,
          ),
        );
      }
      if (!isInVocabulary(port.inputClass, INPUT_CLASSES)) {
        issues.push(
          issue(
            "vocabulary",
            `${portPath}.inputClass`,
            `Value is outside the closed vocabulary: ${port.inputClass}`,
          ),
        );
      }
      (port.valueConstraints ?? []).forEach((constraint, constraintIndex) => {
        issues.push(
          ...valueConstraintIssues(
            constraint,
            `${portPath}.valueConstraints[${constraintIndex}]`,
          ),
        );
      });
    });

    mechanism.outputPorts.forEach((port, portIndex) => {
      if (!isInVocabulary(port.cardinality, PORT_CARDINALITIES)) {
        issues.push(
          issue(
            "vocabulary",
            `mechanisms[${mechanismIndex}].outputPorts[${portIndex}].cardinality`,
            `Value is outside the closed vocabulary: ${port.cardinality}`,
          ),
        );
      }
      (port.valueConstraints ?? []).forEach((constraint, constraintIndex) => {
        issues.push(
          ...valueConstraintIssues(
            constraint,
            `mechanisms[${mechanismIndex}].outputPorts[${portIndex}].valueConstraints[${constraintIndex}]`,
          ),
        );
      });
    });

    (mechanism.conditionalConstraints ?? []).forEach((constraint, constraintIndex) => {
      for (const [side, predicates] of [
        ["if", constraint.if],
        ["then", constraint.then],
      ] as const) {
        predicates.forEach((predicate, predicateIndex) => {
          issues.push(
            ...valueConstraintIssues(
              predicate,
              `mechanisms[${mechanismIndex}].conditionalConstraints[${constraintIndex}].${side}[${predicateIndex}]`,
            ),
          );
        });
      }
    });
  });

  return issues;
}

export function validateReferentialIntegrity(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
  groups: CapabilityGroups,
  requireProductAnchorDefinitions = true,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const artifactIds = new Set(artifactTypes.map((artifact) => artifact.id));
  const positionIds = new Set(groups.axis.positions.map((position) => position.id));
  const laneIds = new Set(groups.lanes.map((lane) => lane.id));
  const capabilityIds = new Set(groups.capabilities.map((capability) => capability.id));

  artifactTypes.forEach((artifact, artifactIndex) => {
    if (!positionIds.has(artifact.axisPositionId)) {
      issues.push(
        issue(
          "unknown-axis-position",
          `artifactTypes[${artifactIndex}].axisPositionId`,
          `Unknown axis position: ${artifact.axisPositionId}`,
        ),
      );
    }
    if (!laneIds.has(artifact.laneId)) {
      issues.push(
        issue(
          "unknown-lane",
          `artifactTypes[${artifactIndex}].laneId`,
          `Unknown lane: ${artifact.laneId}`,
        ),
      );
    }
  });

  mechanisms.forEach((mechanism, mechanismIndex) => {
    issues.push(
      ...repositoryRelativePathIssues(
        mechanism.source.path,
        `mechanisms[${mechanismIndex}].source.path`,
      ),
    );
    mechanism.capabilityIds.forEach((capabilityId, capabilityIndex) => {
      if (!capabilityIds.has(capabilityId)) {
        issues.push(
          issue(
            "unknown-capability",
            `mechanisms[${mechanismIndex}].capabilityIds[${capabilityIndex}]`,
            `Unknown capability: ${capabilityId}`,
          ),
        );
      }
    });
    if (!mechanism.capabilityIds.includes(mechanism.primaryCapabilityId)) {
      issues.push(
        issue(
          "primary-capability",
          `mechanisms[${mechanismIndex}].primaryCapabilityId`,
          "The layout-only primary capability must also appear in capabilityIds.",
        ),
      );
    }
    for (const [direction, ports] of [
      ["inputPorts", mechanism.inputPorts],
      ["outputPorts", mechanism.outputPorts],
    ] as const) {
      ports.forEach((port, portIndex) => {
        if (!artifactIds.has(port.artifactTypeId)) {
          issues.push(
            issue(
              "unknown-artifact-type",
              `mechanisms[${mechanismIndex}].${direction}[${portIndex}].artifactTypeId`,
              `Unknown artifact type: ${port.artifactTypeId}`,
            ),
          );
        }
      });
    }
  });

  if (requireProductAnchorDefinitions) {
    for (const [side, anchor] of Object.entries(groups.productAnchors)) {
      if (!artifactIds.has(anchor.artifactTypeId)) {
        issues.push(
          issue(
            "missing-product-anchor-type",
            `capabilityGroups.productAnchors.${side}.artifactTypeId`,
            `Product anchor artifact type is not defined: ${anchor.artifactTypeId}`,
          ),
        );
      }
    }

    const leftAnchor = artifactTypes.find(
      (artifact) => artifact.id === groups.productAnchors.left.artifactTypeId,
    );
    if (
      leftAnchor &&
      (leftAnchor.category !== "raster" ||
        leftAnchor.productFocus !== "product-flow" ||
        leftAnchor.plane !== "runtime" ||
        leftAnchor.axisPositionId !== groups.productAnchors.left.axisPositionId ||
        leftAnchor.laneId !== groups.productAnchors.left.laneId)
    ) {
      issues.push(
        issue(
          "left-product-anchor-type",
          "artifactTypes",
          "The native raster anchor must be a runtime raster in its pinned axis/lane cell.",
        ),
      );
    }
    const rightAnchor = artifactTypes.find(
      (artifact) => artifact.id === groups.productAnchors.right.artifactTypeId,
    );
    if (
      rightAnchor &&
      (rightAnchor.category !== "treatment" ||
        rightAnchor.productFocus !== "product-flow" ||
        rightAnchor.plane !== "runtime" ||
        rightAnchor.axisPositionId !== groups.productAnchors.right.axisPositionId ||
        rightAnchor.laneId !== groups.productAnchors.right.laneId ||
        rightAnchor.boundaryClassification !== "product-goal")
    ) {
      issues.push(
        issue(
          "right-product-anchor-type",
          "artifactTypes",
          "The exact v3 UI Palette anchor must be a runtime product-goal treatment in its pinned axis/lane cell.",
        ),
      );
    }

    const rightAnchorConsumers = mechanisms.flatMap((mechanism) =>
      mechanism.inputPorts.filter(
        (port) => port.artifactTypeId === groups.productAnchors.right.artifactTypeId,
      ),
    );
    if (rightAnchorConsumers.length === 0) {
      issues.push(
        issue(
          "right-product-anchor-topology",
          "mechanisms",
          "The exact v3 UI Palette product goal must remain consumed by at least one mechanism.",
        ),
      );
    }
  }

  return issues;
}

function artifactConstraintIssues(
  artifact: ArtifactType | undefined,
  constraint: {
    valuePath: string;
    comparator: string;
    value?: unknown;
  },
  path: string,
): ValidationIssue[] {
  if (!artifact) return [];
  if (
    constraint.valuePath === "" &&
    (constraint.comparator === "present" || constraint.comparator === "absent")
  ) {
    return [];
  }
  const inspectionPath = artifact.valueInspection?.paths.find(
    (entry) => entry.valuePath === constraint.valuePath,
  );
  if (!inspectionPath) {
    return [
      issue(
        "unanchored-value-constraint",
        path,
        `Artifact ${artifact.id} does not declare inspection path ${JSON.stringify(constraint.valuePath)}.`,
      ),
    ];
  }
  const constraintIdentity = serializeCanonical({
    comparator: constraint.comparator,
    value: constraint.value,
  });
  const permitted = inspectionPath.permittedConstraints.some(
    (candidate) =>
      serializeCanonical({
        comparator: candidate.comparator,
        value: candidate.value,
      }) === constraintIdentity,
  );
  return permitted
    ? []
    : [
        issue(
          "unanchored-value-constraint",
          path,
          `Artifact ${artifact.id} does not permit comparator/value ${constraint.comparator} ${JSON.stringify(constraint.value)} at ${JSON.stringify(constraint.valuePath)}.`,
        ),
      ];
}

export function validatePorts(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const artifactById = new Map(artifactTypes.map((artifact) => [artifact.id, artifact]));

  mechanisms.forEach((mechanism, mechanismIndex) => {
    const groupIds = new Set(mechanism.alternativeGroups.map((group) => group.id));
    const memberCount = new Map<string, number>();

    mechanism.inputPorts.forEach((port, portIndex) => {
      const portPath = `mechanisms[${mechanismIndex}].inputPorts[${portIndex}]`;
      const isAlternative = port.requirement === "alternative";
      if (isAlternative !== (port.alternativeGroupId !== undefined)) {
        issues.push(
          issue(
            "alternative-group",
            portPath,
            "Only alternative inputs may name an alternative group, and every alternative input must name one.",
          ),
        );
      }
      if (port.alternativeGroupId !== undefined) {
        if (!groupIds.has(port.alternativeGroupId)) {
          issues.push(
            issue(
              "unknown-alternative-group",
              `${portPath}.alternativeGroupId`,
              `Unknown alternative group: ${port.alternativeGroupId}`,
            ),
          );
        }
        memberCount.set(
          port.alternativeGroupId,
          (memberCount.get(port.alternativeGroupId) ?? 0) + 1,
        );
      }

      const nonZero = [
        "exactly-one",
        "exactly-two",
        "one-to-two",
        "one-or-more",
      ].includes(port.cardinality);
      if (
        (port.requirement === "required" || port.requirement === "configuration") !==
        nonZero
      ) {
        issues.push(
          issue(
            "input-cardinality",
            `${portPath}.cardinality`,
            "Required/configuration inputs need a non-zero cardinality; optional/alternative inputs need a zero-allowing cardinality.",
          ),
        );
      }

      const artifact = artifactById.get(port.artifactTypeId);
      (port.valueConstraints ?? []).forEach((constraint, constraintIndex) => {
        issues.push(
          ...artifactConstraintIssues(
            artifact,
            constraint,
            `${portPath}.valueConstraints[${constraintIndex}]`,
          ),
        );
      });
      if (
        artifact &&
        port.requirement === "configuration" &&
        artifact.category !== "configuration" &&
        artifact.category !== "control"
      ) {
        issues.push(
          issue(
            "configuration-artifact",
            `${portPath}.artifactTypeId`,
            "A configuration requirement must reference a configuration or control artifact type.",
          ),
        );
      }
      const allowedCategoryByInputClass: Partial<Record<string, readonly string[]>> = {
        configuration: ["configuration"],
        control: ["configuration", "control"],
        model: ["model"],
        review: ["review"],
      };
      const allowedCategories = allowedCategoryByInputClass[port.inputClass];
      if (artifact && allowedCategories && !allowedCategories.includes(artifact.category)) {
        issues.push(
          issue(
            "input-class-artifact",
            `${portPath}.inputClass`,
            `Input class ${port.inputClass} is incompatible with artifact category ${artifact.category}.`,
          ),
        );
      }
    });

    mechanism.alternativeGroups.forEach((group, groupIndex) => {
      const count = memberCount.get(group.id) ?? 0;
      if (count < 2) {
        issues.push(
          issue(
            "alternative-group-cardinality",
            `mechanisms[${mechanismIndex}].alternativeGroups[${groupIndex}]`,
            `Alternative group ${group.id} must contain at least two input ports; found ${count}.`,
          ),
        );
      }
    });

    const outputById = new Map(mechanism.outputPorts.map((port) => [port.id, port]));
    const groupedOutputIds: string[] = [];
    (mechanism.outputGroups ?? []).forEach((group, groupIndex) => {
      groupedOutputIds.push(...group.portIds);
      group.portIds.forEach((portId, portIndex) => {
        const port = outputById.get(portId);
        if (!port) {
          issues.push(
            issue(
              "unknown-output-group-port",
              `mechanisms[${mechanismIndex}].outputGroups[${groupIndex}].portIds[${portIndex}]`,
              `Unknown output port: ${portId}`,
            ),
          );
        } else if (
          !["zero-or-one", "zero-to-two", "zero-to-six", "zero-or-more"].includes(
            port.cardinality,
          )
        ) {
          issues.push(
            issue(
              "output-group-cardinality",
              `mechanisms[${mechanismIndex}].outputGroups[${groupIndex}].portIds[${portIndex}]`,
              "A mutually exclusive output variant must use a zero-allowing port cardinality.",
            ),
          );
        }
      });
    });
    issues.push(
      ...duplicateIssues(
        groupedOutputIds,
        `mechanisms[${mechanismIndex}].outputGroups`,
        "grouped output port",
      ),
    );

    const inputById = new Map(mechanism.inputPorts.map((port) => [port.id, port]));
    (mechanism.conditionalConstraints ?? []).forEach((constraint, constraintIndex) => {
      for (const [side, predicates] of [
        ["if", constraint.if],
        ["then", constraint.then],
      ] as const) {
        predicates.forEach((predicate, predicateIndex) => {
          const ports = predicate.subject.direction === "input" ? inputById : outputById;
          const port = ports.get(predicate.subject.portId);
          const predicatePath = `mechanisms[${mechanismIndex}].conditionalConstraints[${constraintIndex}].${side}[${predicateIndex}]`;
          if (!port) {
            issues.push(
              issue(
                "constraint-port-reference",
                `${predicatePath}.subject.portId`,
                `Unknown ${predicate.subject.direction} port: ${predicate.subject.portId}`,
              ),
            );
          } else {
            issues.push(
              ...artifactConstraintIssues(
                artifactById.get(port.artifactTypeId),
                {
                  valuePath: predicate.subject.valuePath,
                  comparator: predicate.comparator,
                  value: predicate.value,
                },
                predicatePath,
              ),
            );
          }
        });
      }
    });

    mechanism.outputPorts.forEach((port, portIndex) => {
      const portPath = `mechanisms[${mechanismIndex}].outputPorts[${portIndex}]`;
      (port.valueConstraints ?? []).forEach((constraint, constraintIndex) => {
        issues.push(
          ...artifactConstraintIssues(
            artifactById.get(port.artifactTypeId),
            constraint,
            `${portPath}.valueConstraints[${constraintIndex}]`,
          ),
        );
      });
      const rawPort = port as unknown as Record<string, unknown>;
      if ("terminal" in rawPort || "isTerminal" in rawPort) {
        issues.push(
          issue(
            "terminal-declaration",
            portPath,
            "Terminal state may be declared only by artifact metadata or terminalPurpose.",
          ),
        );
      }
    });
  });

  return issues;
}

function portReferenceKey(reference: PortReference): string {
  return `${reference.mechanismId}\u0000${reference.direction}\u0000${reference.portId}`;
}

function sortPortReferences(references: PortReference[]): PortReference[] {
  return references.sort((left, right) =>
    compareCodeUnits(portReferenceKey(left), portReferenceKey(right)),
  );
}

function neverProvidedDisposition(
  boundary: BoundaryClassification,
): NeverProvidedDisposition {
  switch (boundary) {
    case "expected-external":
      return "expected-external-root";
    case "unresolved-external":
      return "unresolved-external-root";
    case "product-goal":
      return "product-goal-gap";
    case "internal":
      return "internal-gap";
  }
}

function neverUsedDisposition(
  artifact: ArtifactType,
  producerPorts: readonly { port: { terminalPurpose?: string } }[],
): NeverUsedDisposition {
  if (artifact.boundaryClassification === "product-goal") {
    return "product-goal-terminal";
  }
  if (
    artifact.intentionalTerminalPurpose !== undefined ||
    producerPorts.some(({ port }) => port.terminalPurpose !== undefined)
  ) {
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

function neverUsedPortDisposition(
  artifact: ArtifactType,
  port: { terminalPurpose?: string },
): NeverUsedDisposition {
  if (artifact.boundaryClassification === "product-goal") {
    return "product-goal-terminal";
  }
  if (
    artifact.intentionalTerminalPurpose !== undefined ||
    port.terminalPurpose !== undefined
  ) {
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

export function deriveCompatibilityTopology(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
): DerivedCompatibilityTopology {
  const artifactById = new Map(artifactTypes.map((artifact) => [artifact.id, artifact]));
  const consumers = new Map<
    string,
    Array<{
      reference: PortReference;
      port: MechanismRecord["inputPorts"][number];
      mechanism: MechanismRecord;
    }>
  >();
  const producers = new Map<
    string,
    Array<{ reference: PortReference; port: MechanismRecord["outputPorts"][number] }>
  >();

  for (const mechanism of mechanisms) {
    for (const port of mechanism.inputPorts) {
      const references = consumers.get(port.artifactTypeId) ?? [];
      references.push({
        reference: {
          mechanismId: mechanism.id,
          direction: "input",
          portId: port.id,
        },
        port,
        mechanism,
      });
      consumers.set(port.artifactTypeId, references);
    }
    for (const port of mechanism.outputPorts) {
      const references = producers.get(port.artifactTypeId) ?? [];
      references.push({
        reference: { mechanismId: mechanism.id, direction: "output", portId: port.id },
        port,
      });
      producers.set(port.artifactTypeId, references);
    }
  }

  const compatibilityHyperedges: CompatibilityHyperedge[] = [];
  const neverProvidedInputTypes: NeverProvidedInputType[] = [];
  const neverUsedOutputTypes: NeverUsedOutputType[] = [];
  const usedTypeIds = new Set([...consumers.keys(), ...producers.keys()]);

  for (const artifactTypeId of [...usedTypeIds].sort(compareCodeUnits)) {
    const artifact = artifactById.get(artifactTypeId);
    if (!artifact) continue;
    const consumerRecords = consumers.get(artifactTypeId) ?? [];
    const consumerPorts = sortPortReferences(
      consumerRecords.map(({ reference }) => reference),
    );
    const producerRecords = producers.get(artifactTypeId) ?? [];
    const producerPorts = sortPortReferences(
      producerRecords.map(({ reference }) => reference),
    );

    if (consumerPorts.length > 0 && producerPorts.length > 0) {
      compatibilityHyperedges.push({ artifactTypeId, producerPorts, consumerPorts });
    } else if (consumerPorts.length > 0) {
      const consumerPortDetails: NeverProvidedInputPortDetail[] = consumerRecords
        .map(({ reference, port, mechanism }) => {
          let obligationClassification: InputObligationClassification;
          let alternativeGroup:
            | NeverProvidedInputPortDetail["alternativeGroup"]
            | undefined;
          if (port.requirement === "optional") {
            obligationClassification = "optional-absence";
          } else if (port.requirement === "alternative") {
            const group = mechanism.alternativeGroups.find(
              (candidate) => candidate.id === port.alternativeGroupId,
            );
            const members = mechanism.inputPorts.filter(
              (candidate) => candidate.alternativeGroupId === port.alternativeGroupId,
            );
            const producerBackedMemberPortCount = members.filter(
              (member) => (producers.get(member.artifactTypeId)?.length ?? 0) > 0,
            ).length;
            if (group) {
              alternativeGroup = {
                id: group.id,
                selectionCardinality: group.selectionCardinality,
                memberPortCount: members.length,
                producerBackedMemberPortCount,
              };
            }
            obligationClassification =
              producerBackedMemberPortCount > 0
                ? "unused-alternative"
                : "collective-alternative-group-obligation";
          } else {
            obligationClassification = "direct-obligation";
          }
          const producerAvailability: NeverProvidedInputPortDetail["producerAvailability"] =
            (producers.get(port.artifactTypeId)?.length ?? 0) > 0
              ? "available"
              : "unavailable";
          return {
            port: reference,
            requirement: port.requirement,
            producerAvailability,
            obligationClassification,
            ...(alternativeGroup ? { alternativeGroup } : {}),
          };
        })
        .sort((left, right) =>
          compareCodeUnits(portReferenceKey(left.port), portReferenceKey(right.port)),
        );
      neverProvidedInputTypes.push({
        artifactTypeId,
        boundaryClassification: artifact.boundaryClassification,
        disposition: neverProvidedDisposition(artifact.boundaryClassification),
        consumerPorts,
        consumerPortDetails,
      });
    } else if (producerPorts.length > 0) {
      const producerPortDetails: NeverUsedOutputPortDetail[] = producerRecords
        .map(({ reference, port }) => ({
          port: reference,
          disposition: neverUsedPortDisposition(artifact, port),
          ...(port.terminalPurpose
            ? { terminalPurpose: port.terminalPurpose }
            : artifact.intentionalTerminalPurpose
              ? { terminalPurpose: artifact.intentionalTerminalPurpose }
              : {}),
        }))
        .sort((left, right) =>
          compareCodeUnits(portReferenceKey(left.port), portReferenceKey(right.port)),
        );
      neverUsedOutputTypes.push({
        artifactTypeId,
        boundaryClassification: artifact.boundaryClassification,
        disposition: neverUsedDisposition(artifact, producerRecords),
        producerPorts,
        producerPortDetails,
      });
    }
  }

  return {
    compatibilityHyperedges,
    neverProvidedInputTypes,
    neverUsedOutputTypes,
  };
}

function openContractKind(
  artifactTypeId: string,
  producerTypeIds: ReadonlySet<string>,
): OpenInputContractKind {
  return producerTypeIds.has(artifactTypeId)
    ? "nonprimary-provider-observed"
    : "missing-natural-provider";
}

export function deriveProductFocus(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
): ProductFocusAnalysis {
  const artifacts = [...artifactTypes].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  );
  const sortedMechanisms = [...mechanisms].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  );
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const primaryMechanisms = sortedMechanisms.filter(
    (mechanism) =>
      mechanism.focusClass === "product-transformation" ||
      mechanism.focusClass === "product-admission",
  );
  const primaryMechanismIds = primaryMechanisms.map(({ id }) => id);
  const fullProducerTypeIds = new Set<string>();
  const primaryProducerTypeIds = new Set<string>();
  const primaryNaturalConsumerTypeIds = new Set<string>();
  const primaryIncidences: PortReference[] = [];
  const inspectorInputPorts: PortReference[] = [];
  const primaryArtifactIdSet = new Set<string>([
    LEFT_PRODUCT_ANCHOR_ARTIFACT_ID,
    RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  ]);

  for (const mechanism of sortedMechanisms) {
    for (const port of mechanism.outputPorts) {
      fullProducerTypeIds.add(port.artifactTypeId);
    }
  }
  for (const mechanism of primaryMechanisms) {
    for (const port of mechanism.inputPorts) {
      const artifact = artifactById.get(port.artifactTypeId);
      const reference: PortReference = {
        mechanismId: mechanism.id,
        direction: "input",
        portId: port.id,
      };
      if (artifact?.productFocus === "product-flow") {
        primaryArtifactIdSet.add(artifact.id);
        if (port.inputClass === "natural") {
          primaryNaturalConsumerTypeIds.add(artifact.id);
        }
        primaryIncidences.push(reference);
      } else {
        inspectorInputPorts.push(reference);
      }
    }
    for (const port of mechanism.outputPorts) {
      const artifact = artifactById.get(port.artifactTypeId);
      primaryProducerTypeIds.add(port.artifactTypeId);
      if (artifact?.productFocus === "product-flow") {
        primaryArtifactIdSet.add(artifact.id);
        primaryIncidences.push({
          mechanismId: mechanism.id,
          direction: "output",
          portId: port.id,
        });
      }
    }
  }

  const secondaryOverlayMechanismIds = sortedMechanisms
    .filter(
      (mechanism) =>
        mechanism.focusClass === "evaluation-probe" ||
        mechanism.focusClass === "review-custody" ||
        mechanism.focusClass === "configuration-governance",
    )
    .map(({ id }) => id);
  const directlyAttachedArtifactIds = new Set(
    primaryMechanisms.flatMap((mechanism) => [
      ...mechanism.inputPorts.map(({ artifactTypeId }) => artifactTypeId),
      ...mechanism.outputPorts.map(({ artifactTypeId }) => artifactTypeId),
    ]),
  );
  const secondaryOverlayArtifactIds = artifacts
    .filter(
      (artifact) =>
        artifact.productFocus === "secondary-overlay" &&
        directlyAttachedArtifactIds.has(artifact.id),
    )
    .map(({ id }) => id);
  const fullOnlyMechanismIds = sortedMechanisms
    .filter(
      (mechanism) =>
        mechanism.focusClass === "historical-comparator" ||
        mechanism.focusClass === "research-only-oracle",
    )
    .map(({ id }) => id);
  const fullOnlyArtifactIds = artifacts
    .filter((artifact) => artifact.productFocus === "full-analysis-only")
    .map(({ id }) => id);

  const materializerGaps = primaryProducerTypeIds.has(
    RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
  )
    ? []
    : ([
        {
          status: "confirmed-structural-gap",
          kind: "missing-product-materializer",
          artifactTypeId: RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID,
        },
      ] as const);
  const openInputContracts = primaryMechanisms
    .flatMap((mechanism) =>
      mechanism.inputPorts
        .filter(
          (port) =>
            port.requirement === "required" &&
            port.inputClass === "natural" &&
            port.artifactTypeId !== RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID &&
            artifactById.get(port.artifactTypeId)?.productFocus === "product-flow" &&
            artifactById.get(port.artifactTypeId)?.boundaryClassification !==
              "expected-external" &&
            !primaryProducerTypeIds.has(port.artifactTypeId),
        )
        .map((port) => ({
          semantics: OPEN_CONTRACT_SEMANTIC,
          kind: openContractKind(port.artifactTypeId, fullProducerTypeIds),
          artifactTypeId: port.artifactTypeId,
          consumerPort: {
            mechanismId: mechanism.id,
            direction: "input" as const,
            portId: port.id,
          },
        })),
    )
    .sort((left, right) =>
      compareCodeUnits(
        portReferenceKey(left.consumerPort),
        portReferenceKey(right.consumerPort),
      ),
    );
  const openAlternativeContracts = primaryMechanisms
    .flatMap((mechanism) =>
      mechanism.alternativeGroups.flatMap((group) => {
        const members = mechanism.inputPorts.filter(
          (port) => port.alternativeGroupId === group.id,
        );
        const naturalMembers = members.filter(
          (port) =>
            port.inputClass === "natural" &&
            artifactById.get(port.artifactTypeId)?.productFocus === "product-flow",
        );
        if (
          naturalMembers.length === 0 ||
          naturalMembers.some(
            (port) =>
              artifactById.get(port.artifactTypeId)?.boundaryClassification ===
              "expected-external",
          ) ||
          naturalMembers.some((port) => primaryProducerTypeIds.has(port.artifactTypeId))
        ) {
          return [];
        }
        const artifactTypeIds = [...new Set(naturalMembers.map((port) => port.artifactTypeId))]
          .sort(compareCodeUnits);
        const kind: OpenInputContractKind = artifactTypeIds.some((artifactTypeId) =>
          fullProducerTypeIds.has(artifactTypeId),
        )
          ? "nonprimary-provider-observed"
          : "missing-natural-provider";
        return [
          {
            semantics: OPEN_CONTRACT_SEMANTIC,
            kind,
            mechanismId: mechanism.id,
            alternativeGroupId: group.id,
            artifactTypeIds,
            memberPorts: sortPortReferences(
              naturalMembers.map((port) => ({
                mechanismId: mechanism.id,
                direction: "input" as const,
                portId: port.id,
              })),
            ),
          },
        ];
      }),
    )
    .sort((left, right) =>
      compareCodeUnits(
        `${left.mechanismId}\u0000${left.alternativeGroupId}`,
        `${right.mechanismId}\u0000${right.alternativeGroupId}`,
      ),
    );
  const openOutputContracts = artifacts.flatMap((artifact) => {
    if (
      artifact.productFocus !== "product-flow" ||
      artifact.boundaryClassification !== "internal" ||
      artifact.intentionalTerminalPurpose !== undefined ||
      primaryNaturalConsumerTypeIds.has(artifact.id)
    ) {
      return [];
    }
    const producerPorts = primaryMechanisms.flatMap((mechanism) =>
      mechanism.outputPorts
        .filter(
          (port) =>
            port.artifactTypeId === artifact.id && port.terminalPurpose === undefined,
        )
        .map((port) => ({
          mechanismId: mechanism.id,
          direction: "output" as const,
          portId: port.id,
        })),
    );
    return producerPorts.length > 0
      ? [
          {
            semantics: OPEN_CONTRACT_SEMANTIC,
            kind: "unconsumed-product-evidence" as const,
            artifactTypeId: artifact.id,
            producerPorts: sortPortReferences(producerPorts),
          },
        ]
      : [];
  });

  return {
    interpretationWarnings: [PRODUCT_FOCUS_WARNING],
    mechanismClassCounts: Object.fromEntries(
      MECHANISM_FOCUS_CLASSES.map((focusClass) => [
        focusClass,
        sortedMechanisms.filter((mechanism) => mechanism.focusClass === focusClass).length,
      ]),
    ) as ProductFocusAnalysis["mechanismClassCounts"],
    artifactFocusCounts: Object.fromEntries(
      ARTIFACT_PRODUCT_FOCI.map((productFocus) => [
        productFocus,
        artifacts.filter((artifact) => artifact.productFocus === productFocus).length,
      ]),
    ) as ProductFocusAnalysis["artifactFocusCounts"],
    primaryMechanismIds,
    primaryArtifactIds: [...primaryArtifactIdSet].sort(compareCodeUnits),
    primaryIncidences: sortPortReferences(primaryIncidences),
    inspectorInputPorts: sortPortReferences(inspectorInputPorts),
    secondaryOverlayMechanismIds,
    secondaryOverlayArtifactIds,
    fullOnlyMechanismIds,
    fullOnlyArtifactIds,
    fullRegistryCounts: {
      mechanisms: mechanisms.length,
      artifacts: artifactTypes.length,
      incidences: mechanisms.reduce(
        (count, mechanism) =>
          count + mechanism.inputPorts.length + mechanism.outputPorts.length,
        0,
      ),
    },
    openContractSemantics: {
      semantics: OPEN_CONTRACT_SEMANTIC,
      confirmedGapCondition: OPEN_CONTRACT_CONFIRMATION_CONDITION,
      assertsPrerequisite: false,
      assertsWorkQueueItem: false,
      assertsBuildOrder: false,
      assertsMissingMechanism: false,
      assertsTrialGate: false,
    },
    connectivityCounts: {
      materializerGaps: materializerGaps.length,
      openInputContracts: openInputContracts.length,
      openAlternativeContracts: openAlternativeContracts.length,
      openOutputContracts: openOutputContracts.length,
    },
    materializerGaps: [...materializerGaps],
    openInputContracts,
    openAlternativeContracts,
    openOutputContracts,
  };
}

function referenceSet(references: readonly PortReference[]): string[] {
  return references.map(portReferenceKey).sort(compareCodeUnits);
}

function buildPortIndex(mechanisms: readonly MechanismRecord[]): Map<
  string,
  { artifactTypeId: string; direction: "input" | "output" }
> {
  const index = new Map<
    string,
    { artifactTypeId: string; direction: "input" | "output" }
  >();
  for (const mechanism of mechanisms) {
    for (const port of mechanism.inputPorts) {
      const reference: PortReference = {
        mechanismId: mechanism.id,
        direction: "input",
        portId: port.id,
      };
      index.set(portReferenceKey(reference), {
        artifactTypeId: port.artifactTypeId,
        direction: "input",
      });
    }
    for (const port of mechanism.outputPorts) {
      const reference: PortReference = {
        mechanismId: mechanism.id,
        direction: "output",
        portId: port.id,
      };
      index.set(portReferenceKey(reference), {
        artifactTypeId: port.artifactTypeId,
        direction: "output",
      });
    }
  }
  return index;
}

function validateAnalysisPortReferences(
  references: readonly PortReference[],
  expectedDirection: "input" | "output",
  artifactTypeId: string,
  path: string,
  portIndex: ReturnType<typeof buildPortIndex>,
): ValidationIssue[] {
  const issues = duplicateIssues(referenceSet(references), path, "port reference");
  references.forEach((reference, index) => {
    const indexed = portIndex.get(portReferenceKey(reference));
    if (!indexed) {
      issues.push(
        issue(
          "unknown-port-reference",
          `${path}[${index}]`,
          `Unknown port reference: ${portReferenceKey(reference)}`,
        ),
      );
      return;
    }
    if (reference.direction !== expectedDirection || indexed.direction !== expectedDirection) {
      issues.push(
        issue(
          "port-direction",
          `${path}[${index}]`,
          `Expected a ${expectedDirection} port reference.`,
        ),
      );
    }
    if (indexed.artifactTypeId !== artifactTypeId) {
      issues.push(
        issue(
          "artifact-type-compatibility",
          `${path}[${index}]`,
          `Port uses ${indexed.artifactTypeId}, not ${artifactTypeId}.`,
        ),
      );
    }
  });
  return issues;
}

function validatePerPortDetails(
  details: readonly GeneratedPortDetail[] | undefined,
  allowedReferences: readonly PortReference[],
  path: string,
  portIndex: ReturnType<typeof buildPortIndex>,
): ValidationIssue[] {
  if (!details) return [];
  const issues: ValidationIssue[] = [];
  const allowed = new Set(referenceSet(allowedReferences));
  const keys = details.map((detail) => portReferenceKey(detail.port));
  issues.push(...duplicateIssues(keys, path, "per-port detail"));
  details.forEach((detail, index) => {
    const key = portReferenceKey(detail.port);
    if (!portIndex.has(key) || !allowed.has(key)) {
      issues.push(
        issue(
          "per-port-detail-reference",
          `${path}[${index}].port`,
          "Generated per-port detail must reference a port in its containing analysis record.",
        ),
      );
    }
  });
  return issues;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function validateDerivedPortDetails<T extends { port: PortReference }>(
  actual: readonly T[],
  expected: readonly T[] | undefined,
  allowedReferences: readonly PortReference[],
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowed = new Set(referenceSet(allowedReferences));
  const actualKeys = actual.map((detail) => portReferenceKey(detail.port));
  issues.push(...duplicateIssues(actualKeys, path, "derived port detail"));
  if (!expected) {
    issues.push(issue("unexpected-port-details", path, "Unexpected derived port details."));
    return issues;
  }
  const expectedByKey = new Map(
    expected.map((detail) => [portReferenceKey(detail.port), detail]),
  );
  actual.forEach((detail, index) => {
    const key = portReferenceKey(detail.port);
    if (!allowed.has(key)) {
      issues.push(
        issue(
          "derived-port-detail-reference",
          `${path}[${index}].port`,
          "Derived detail must reference a port in its containing orphan record.",
        ),
      );
    }
    const expectedDetail = expectedByKey.get(key);
    if (
      !expectedDetail ||
      JSON.stringify(canonicalJson(detail)) !==
        JSON.stringify(canonicalJson(expectedDetail))
    ) {
      issues.push(
        issue(
          "stale-port-detail",
          `${path}[${index}]`,
          `Generated detail is stale for ${key}.`,
        ),
      );
    }
  });
  if (!sameStringSet(actualKeys, [...expectedByKey.keys()])) {
    issues.push(
      issue(
        "derived-port-detail-set",
        path,
        "Generated detail set does not match the containing orphan port set.",
      ),
    );
  }
  return issues;
}

function compareTopologyRecord(
  actualTypeId: string,
  actualReferences: readonly PortReference[],
  actualBoundary: string | undefined,
  actualDisposition: string | undefined,
  expected:
    | CompatibilityHyperedge
    | NeverProvidedInputType
    | NeverUsedOutputType
    | undefined,
  expectedReferences: readonly PortReference[] | undefined,
  path: string,
): ValidationIssue[] {
  if (!expected || !expectedReferences) {
    return [
      issue(
        "unexpected-analysis-type",
        path,
        `Unexpected generated analysis record for ${actualTypeId}.`,
      ),
    ];
  }
  const issues: ValidationIssue[] = [];
  if (!sameStringSet(referenceSet(actualReferences), referenceSet(expectedReferences))) {
    issues.push(
      issue(
        "analysis-port-set",
        path,
        `Generated port set is stale for ${actualTypeId}.`,
      ),
    );
  }
  if (
    actualBoundary !== undefined &&
    "boundaryClassification" in expected &&
    actualBoundary !== expected.boundaryClassification
  ) {
    issues.push(
      issue(
        "orphan-boundary",
        path,
        `Generated boundary classification is stale for ${actualTypeId}.`,
      ),
    );
  }
  if (
    actualDisposition !== undefined &&
    "disposition" in expected &&
    actualDisposition !== expected.disposition
  ) {
    issues.push(
      issue(
        "orphan-disposition",
        path,
        `Generated orphan disposition is stale for ${actualTypeId}.`,
      ),
    );
  }
  return issues;
}

export function validateArtifactTypeCompatibility(
  artifactTypes: readonly ArtifactType[],
  mechanisms: readonly MechanismRecord[],
  analysis: GeneratedAnalysis,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const expected = deriveCompatibilityTopology(artifactTypes, mechanisms);
  const expectedProductFocus = deriveProductFocus(artifactTypes, mechanisms);
  const portIndex = buildPortIndex(mechanisms);
  const expectedEdges = new Map(
    expected.compatibilityHyperedges.map((entry) => [entry.artifactTypeId, entry]),
  );
  const expectedNeverProvided = new Map(
    expected.neverProvidedInputTypes.map((entry) => [entry.artifactTypeId, entry]),
  );
  const expectedNeverUsed = new Map(
    expected.neverUsedOutputTypes.map((entry) => [entry.artifactTypeId, entry]),
  );

  issues.push(
    ...duplicateIssues(
      analysis.compatibilityHyperedges.map((entry) => entry.artifactTypeId),
      "analysis.compatibilityHyperedges",
      "compatibility artifact type",
    ),
    ...duplicateIssues(
      analysis.orphans.neverProvidedInputTypes.map((entry) => entry.artifactTypeId),
      "analysis.orphans.neverProvidedInputTypes",
      "never-provided artifact type",
    ),
    ...duplicateIssues(
      analysis.orphans.neverUsedOutputTypes.map((entry) => entry.artifactTypeId),
      "analysis.orphans.neverUsedOutputTypes",
      "never-used artifact type",
    ),
  );

  analysis.compatibilityHyperedges.forEach((entry, index) => {
    const path = `analysis.compatibilityHyperedges[${index}]`;
    const expectedEntry = expectedEdges.get(entry.artifactTypeId);
    issues.push(
      ...compareTopologyRecord(
        entry.artifactTypeId,
        entry.producerPorts,
        undefined,
        undefined,
        expectedEntry,
        expectedEntry?.producerPorts,
        `${path}.producerPorts`,
      ),
      ...compareTopologyRecord(
        entry.artifactTypeId,
        entry.consumerPorts,
        undefined,
        undefined,
        expectedEntry,
        expectedEntry?.consumerPorts,
        `${path}.consumerPorts`,
      ),
      ...validateAnalysisPortReferences(
        entry.producerPorts,
        "output",
        entry.artifactTypeId,
        `${path}.producerPorts`,
        portIndex,
      ),
      ...validateAnalysisPortReferences(
        entry.consumerPorts,
        "input",
        entry.artifactTypeId,
        `${path}.consumerPorts`,
        portIndex,
      ),
      ...validatePerPortDetails(
        entry.perPortDetails,
        [...entry.producerPorts, ...entry.consumerPorts],
        `${path}.perPortDetails`,
        portIndex,
      ),
    );
  });

  analysis.orphans.neverProvidedInputTypes.forEach((entry, index) => {
    const path = `analysis.orphans.neverProvidedInputTypes[${index}]`;
    const expectedEntry = expectedNeverProvided.get(entry.artifactTypeId);
    issues.push(
      ...compareTopologyRecord(
        entry.artifactTypeId,
        entry.consumerPorts,
        entry.boundaryClassification,
        entry.disposition,
        expectedEntry,
        expectedEntry?.consumerPorts,
        path,
      ),
      ...validateAnalysisPortReferences(
        entry.consumerPorts,
        "input",
        entry.artifactTypeId,
        `${path}.consumerPorts`,
        portIndex,
      ),
      ...validateDerivedPortDetails(
        entry.consumerPortDetails,
        expectedEntry?.consumerPortDetails,
        entry.consumerPorts,
        `${path}.consumerPortDetails`,
      ),
    );
  });

  analysis.orphans.neverUsedOutputTypes.forEach((entry, index) => {
    const path = `analysis.orphans.neverUsedOutputTypes[${index}]`;
    const expectedEntry = expectedNeverUsed.get(entry.artifactTypeId);
    issues.push(
      ...compareTopologyRecord(
        entry.artifactTypeId,
        entry.producerPorts,
        entry.boundaryClassification,
        entry.disposition,
        expectedEntry,
        expectedEntry?.producerPorts,
        path,
      ),
      ...validateAnalysisPortReferences(
        entry.producerPorts,
        "output",
        entry.artifactTypeId,
        `${path}.producerPorts`,
        portIndex,
      ),
      ...validateDerivedPortDetails(
        entry.producerPortDetails,
        expectedEntry?.producerPortDetails,
        entry.producerPorts,
        `${path}.producerPortDetails`,
      ),
    );
  });

  for (const artifactTypeId of expectedEdges.keys()) {
    if (!analysis.compatibilityHyperedges.some((entry) => entry.artifactTypeId === artifactTypeId)) {
      issues.push(
        issue(
          "missing-compatibility-hyperedge",
          "analysis.compatibilityHyperedges",
          `Missing compatibility hyperedge for ${artifactTypeId}.`,
        ),
      );
    }
  }
  for (const artifactTypeId of expectedNeverProvided.keys()) {
    if (
      !analysis.orphans.neverProvidedInputTypes.some(
        (entry) => entry.artifactTypeId === artifactTypeId,
      )
    ) {
      issues.push(
        issue(
          "missing-never-provided-type",
          "analysis.orphans.neverProvidedInputTypes",
          `Missing never-provided input type ${artifactTypeId}; classified roots must not be suppressed.`,
        ),
      );
    }
  }
  for (const artifactTypeId of expectedNeverUsed.keys()) {
    if (
      !analysis.orphans.neverUsedOutputTypes.some(
        (entry) => entry.artifactTypeId === artifactTypeId,
      )
    ) {
      issues.push(
        issue(
          "missing-never-used-type",
          "analysis.orphans.neverUsedOutputTypes",
          `Missing never-used output type ${artifactTypeId}; intentional terminals must not be suppressed.`,
        ),
      );
    }
  }

  if (!analysis.warnings.includes(COMPATIBILITY_WARNING)) {
    issues.push(
      issue(
        "compatibility-warning",
        "analysis.warnings",
        "Generated analysis must retain the compatibility-versus-dependency warning.",
      ),
    );
  }
  if (
    JSON.stringify(canonicalJson(analysis.productFocus)) !==
    JSON.stringify(canonicalJson(expectedProductFocus))
  ) {
    issues.push(
      issue(
        "product-focus-analysis",
        "analysis.productFocus",
        "Generated product-focus projection or gap analysis is stale.",
      ),
    );
  }
  if (!analysis.productFocus.interpretationWarnings.includes(PRODUCT_FOCUS_WARNING)) {
    issues.push(
      issue(
        "product-focus-warning",
        "analysis.productFocus.interpretationWarnings",
        "Generated product-focus analysis must retain its non-authoritative interpretation warning.",
      ),
    );
  }
  if (Number.isNaN(Date.parse(analysis.generatedAt))) {
    issues.push(
      issue("generated-at", "analysis.generatedAt", "generatedAt must be an ISO date-time."),
    );
  }

  const expectedCounts = {
    artifactTypes: artifactTypes.length,
    mechanisms: mechanisms.length,
    inputPorts: mechanisms.reduce((count, mechanism) => count + mechanism.inputPorts.length, 0),
    outputPorts: mechanisms.reduce((count, mechanism) => count + mechanism.outputPorts.length, 0),
    compatibilityHyperedges: expected.compatibilityHyperedges.length,
    neverProvidedInputTypes: expected.neverProvidedInputTypes.length,
    neverProvidedInputPorts: expected.neverProvidedInputTypes.reduce(
      (count, entry) => count + entry.consumerPorts.length,
      0,
    ),
    neverUsedOutputTypes: expected.neverUsedOutputTypes.length,
    neverUsedOutputPorts: expected.neverUsedOutputTypes.reduce(
      (count, entry) => count + entry.producerPorts.length,
      0,
    ),
  };
  for (const [name, value] of Object.entries(expectedCounts)) {
    if (analysis.counts[name as keyof typeof expectedCounts] !== value) {
      issues.push(
        issue(
          "analysis-count",
          `analysis.counts.${name}`,
          `Expected generated count ${value}; found ${analysis.counts[name as keyof typeof expectedCounts]}.`,
        ),
      );
    }
  }

  const inputDetails = expected.neverProvidedInputTypes.flatMap(
    (entry) => entry.consumerPortDetails,
  );
  const collectiveGroups = new Set(
    inputDetails
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
  const expectedObligationCounts = {
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
  };
  for (const [name, value] of Object.entries(expectedObligationCounts)) {
    if (
      analysis.obligationCounts[name as keyof typeof expectedObligationCounts] !==
      value
    ) {
      issues.push(
        issue(
          "obligation-count",
          `analysis.obligationCounts.${name}`,
          `Expected generated count ${value}; found ${analysis.obligationCounts[name as keyof typeof expectedObligationCounts]}.`,
        ),
      );
    }
  }

  if (
    analysis.generator.name !== GENERATOR_NAME ||
    analysis.generator.version !== GENERATOR_VERSION
  ) {
    issues.push(
      issue(
        "generator-identity",
        "analysis.generator",
        `Expected ${GENERATOR_NAME} version ${GENERATOR_VERSION}.`,
      ),
    );
  }

  return issues;
}

export function validateCensusCoverage(
  mechanisms: readonly MechanismRecord[],
  sourceText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const census = parseMechanismCensus(sourceText);
  const censusIds = census.map((entry) => entry.id);
  const mechanismIds = mechanisms.map((mechanism) => mechanism.id);

  issues.push(
    ...duplicateIssues(censusIds, "source", "census mechanism"),
    ...duplicateIssues(mechanismIds, "mechanisms", "mechanism"),
  );
  if (census.length !== EXPECTED_MECHANISM_COUNT) {
    issues.push(
      issue(
        "census-count",
        "source",
        `Expected ${EXPECTED_MECHANISM_COUNT} mechanism headings; found ${census.length}.`,
      ),
    );
  }
  if (mechanisms.length !== EXPECTED_MECHANISM_COUNT) {
    issues.push(
      issue(
        "mechanism-count",
        "mechanisms",
        `Expected ${EXPECTED_MECHANISM_COUNT} typed mechanisms; found ${mechanisms.length}.`,
      ),
    );
  }
  for (const id of censusIds) {
    if (!mechanismIds.includes(id)) {
      issues.push(
        issue("missing-mechanism", "mechanisms", `Census mechanism is not typed: ${id}`),
      );
    }
  }
  for (const id of mechanismIds) {
    if (!censusIds.includes(id)) {
      issues.push(
        issue("unknown-mechanism", "mechanisms", `Typed mechanism is absent from census: ${id}`),
      );
    }
  }
  return issues;
}

function tokensInText(text: string, vocabulary: readonly string[]): string[] {
  const tokens = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  return vocabulary.filter((value) => tokens.includes(value));
}

function validateStatusTokenSynchronization(
  mechanism: MechanismRecord,
  census: CensusEntry,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checks: Array<[
    readonly string[],
    readonly string[],
    string,
    string,
  ]> = [
    [
      mechanism.censusStatus.scientificInterpretations,
      SCIENTIFIC_INTERPRETATIONS,
      census.statusText,
      "scientificInterpretations",
    ],
    [
      mechanism.censusStatus.implementationStates,
      IMPLEMENTATION_STATES,
      census.statusText,
      "implementationStates",
    ],
    [
      mechanism.censusStatus.evidenceScopes,
      EVIDENCE_SCOPES,
      census.statusText,
      "evidenceScopes",
    ],
    [
      mechanism.censusStatus.runtimeAdmissibilities,
      RUNTIME_ADMISSIBILITIES,
      census.statusText,
      "runtimeAdmissibilities",
    ],
    [
      mechanism.censusStatus.authorizationTokens,
      AUTHORIZATION_TOKENS,
      census.authorizationText,
      "authorizationTokens",
    ],
  ];

  for (const [declared, vocabulary, text, field] of checks) {
    const sourceTokens = tokensInText(text, vocabulary);
    if (!sameStringSet(declared, sourceTokens)) {
      issues.push(
        issue(
          "status-token-sync",
          `${path}.censusStatus.${field}`,
          `Declared tokens do not match source tokens: expected [${sourceTokens.join(", ")}].`,
        ),
      );
    }
  }
  return issues;
}

export function validateSourceSynchronization(
  snapshot: SourceSnapshot,
  mechanisms: readonly MechanismRecord[],
  sourceText: string,
  requireExactCoverage = true,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const census = parseMechanismCensus(sourceText);
  const censusById = new Map(census.map((entry) => [entry.id, entry]));
  const lines = normalizedLines(sourceText);
  const sourceHash = sha256(sourceText);

  for (const key of [
    "path",
    "gitCommit",
    "gitBlob",
    "gitTree",
    "gitCommitTimestamp",
    "sha256",
    "byteLength",
    "lineCount",
    "mechanismCount",
  ] as const) {
    if (snapshot[key] !== PINNED_SOURCE_SNAPSHOT[key]) {
      issues.push(
        issue(
          "pinned-source-snapshot",
          `sourceSnapshot.${key}`,
          `Expected pinned value ${String(PINNED_SOURCE_SNAPSHOT[key])}; found ${String(snapshot[key])}.`,
        ),
      );
    }
  }

  issues.push(...repositoryRelativePathIssues(snapshot.path, "sourceSnapshot.path"));
  if (snapshot.path !== MECHANISM_CENSUS_PATH) {
    issues.push(
      issue(
        "source-path",
        "sourceSnapshot.path",
        `Mechanism source snapshot must use ${MECHANISM_CENSUS_PATH}.`,
      ),
    );
  }
  if (snapshot.sha256 !== sourceHash) {
    issues.push(
      issue(
        "source-hash",
        "sourceSnapshot.sha256",
        `Source SHA-256 is stale; expected ${sourceHash}.`,
      ),
    );
  }
  if (snapshot.byteLength !== Buffer.byteLength(sourceText, "utf8")) {
    issues.push(
      issue(
        "source-byte-length",
        "sourceSnapshot.byteLength",
        `Source byte length is stale; expected ${Buffer.byteLength(sourceText, "utf8")}.`,
      ),
    );
  }
  if (snapshot.lineCount !== lines.length) {
    issues.push(
      issue(
        "source-line-count",
        "sourceSnapshot.lineCount",
        `Source line count is stale; expected ${lines.length}.`,
      ),
    );
  }
  if (snapshot.mechanismCount !== EXPECTED_MECHANISM_COUNT) {
    issues.push(
      issue(
        "snapshot-mechanism-count",
        "sourceSnapshot.mechanismCount",
        `Source snapshot mechanismCount must be ${EXPECTED_MECHANISM_COUNT}.`,
      ),
    );
  }

  mechanisms.forEach((mechanism, index) => {
    const path = `mechanisms[${index}]`;
    const source = censusById.get(mechanism.id);
    if (!source) return;
    if (mechanism.title !== source.title) {
      issues.push(
        issue(
          "source-title-sync",
          `${path}.title`,
          `Expected source title: ${source.title}`,
        ),
      );
    }
    if (mechanism.source.path !== snapshot.path) {
      issues.push(
        issue(
          "source-path-sync",
          `${path}.source.path`,
          `Mechanism source path must match snapshot path ${snapshot.path}.`,
        ),
      );
    }
    if (mechanism.source.headingText !== source.headingText) {
      issues.push(
        issue(
          "source-heading-sync",
          `${path}.source.headingText`,
          `Expected exact source heading: ${source.headingText}`,
        ),
      );
    }
    if (mechanism.source.headingLine !== source.headingLine) {
      issues.push(
        issue(
          "source-line-sync",
          `${path}.source.headingLine`,
          `Expected source heading line ${source.headingLine}.`,
        ),
      );
    }
    if (mechanism.censusStatus.authorizationText !== source.authorizationText) {
      issues.push(
        issue(
          "authorization-text-sync",
          `${path}.censusStatus.authorizationText`,
          "Authorization text does not match the normalized source bullet.",
        ),
      );
    }
    if (mechanism.censusStatus.statusText !== source.statusText) {
      issues.push(
        issue(
          "status-text-sync",
          `${path}.censusStatus.statusText`,
          "Status text does not match the normalized source bullet.",
        ),
      );
    }
    issues.push(...validateStatusTokenSynchronization(mechanism, source, path));
  });

  if (requireExactCoverage) {
    issues.push(...validateCensusCoverage(mechanisms, sourceText));
  } else if (census.length !== EXPECTED_MECHANISM_COUNT) {
    issues.push(
      issue(
        "census-count",
        "source",
        `Expected ${EXPECTED_MECHANISM_COUNT} mechanism headings; found ${census.length}.`,
      ),
    );
  }

  return issues;
}

function validateGenerationManifestCompleteness(
  analysis: GeneratedAnalysis,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (analysis.sourceFragments.length !== EXPECTED_SOURCE_FRAGMENT_MANIFEST.length) {
    issues.push(
      issue(
        "source-fragment-manifest",
        "analysis.sourceFragments",
        `Generator ${GENERATOR_VERSION} requires exactly ${EXPECTED_SOURCE_FRAGMENT_MANIFEST.length} source fragments; found ${analysis.sourceFragments.length}.`,
      ),
    );
  }
  const sourceFragmentLength = Math.max(
    analysis.sourceFragments.length,
    EXPECTED_SOURCE_FRAGMENT_MANIFEST.length,
  );
  for (let index = 0; index < sourceFragmentLength; index += 1) {
    const actual = analysis.sourceFragments[index];
    const expected = EXPECTED_SOURCE_FRAGMENT_MANIFEST[index];
    if (
      actual?.fragmentId !== expected?.fragmentId ||
      actual?.path !== expected?.path
    ) {
      issues.push(
        issue(
          "source-fragment-manifest",
          `analysis.sourceFragments[${index}]`,
          expected
            ? `Expected ${expected.fragmentId} at ${expected.path}; found ${actual ? `${actual.fragmentId} at ${actual.path}` : "no declaration"}.`
            : `Unexpected source fragment ${actual?.fragmentId} at ${actual?.path}.`,
        ),
      );
    }
  }

  if (analysis.generationInputs.length !== EXPECTED_GENERATION_INPUT_PATHS.length) {
    issues.push(
      issue(
        "generation-input-manifest",
        "analysis.generationInputs",
        `Generator ${GENERATOR_VERSION} requires exactly ${EXPECTED_GENERATION_INPUT_PATHS.length} generation inputs; found ${analysis.generationInputs.length}.`,
      ),
    );
  }
  const generationInputLength = Math.max(
    analysis.generationInputs.length,
    EXPECTED_GENERATION_INPUT_PATHS.length,
  );
  for (let index = 0; index < generationInputLength; index += 1) {
    const actual = analysis.generationInputs[index];
    const expectedPath = EXPECTED_GENERATION_INPUT_PATHS[index];
    if (actual?.path !== expectedPath) {
      issues.push(
        issue(
          "generation-input-manifest",
          `analysis.generationInputs[${index}]`,
          expectedPath
            ? `Expected generation input ${expectedPath}; found ${actual?.path ?? "no declaration"}.`
            : `Unexpected generation input ${actual?.path}.`,
        ),
      );
    }
  }
  return issues;
}

export function validateCapabilityGraph(
  graph: CapabilityGraph,
  sourceText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (graph.documentKind !== "typed-capability-compatibility-hypergraph") {
    issues.push(issue("document-kind", "documentKind", "Unexpected graph document kind."));
  }
  if (graph.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    issues.push(issue("schema-version", "schemaVersion", "Unsupported graph schema version."));
  }
  if (
    graph.semantics.relation !== "candidate-semantic-compatibility" ||
    graph.semantics.sameArtifactTypeAssertsTestedBinding !== false ||
    graph.semantics.assertsDependencyGraph !== false ||
    graph.semantics.assertsArchitecture !== false ||
    graph.semantics.assertsBuildOrder !== false
  ) {
    issues.push(
      issue(
        "graph-semantics",
        "semantics",
        "The document may assert candidate semantic compatibility only.",
      ),
    );
  }
  if (
    !/^[0-9a-f]{64}$/.test(graph.generationDigest) ||
    graph.generationDigest !== graph.analysis.generationDigest
  ) {
    issues.push(
      issue(
        "generation-digest",
        "generationDigest",
        "The graph and standalone analysis payload must share one valid generation digest.",
      ),
    );
  }
  const recomputedGenerationDigest = computeGenerationDigest({
    generator: graph.analysis.generator,
    generatedAt: graph.analysis.generatedAt,
    sourceSnapshot: graph.sourceSnapshot,
    generationInputs: graph.analysis.generationInputs,
  });
  if (graph.generationDigest !== recomputedGenerationDigest) {
    issues.push(
      issue(
        "generation-digest-inputs",
        "generationDigest",
        `Generation digest does not match the declared generator, timestamp, source snapshot, and generation input manifest; expected ${recomputedGenerationDigest}.`,
      ),
    );
  }
  if (graph.analysis.generatedAt !== PINNED_SOURCE_SNAPSHOT.gitCommitTimestamp) {
    issues.push(
      issue(
        "generated-at",
        "analysis.generatedAt",
        "generatedAt must equal the pinned source commit timestamp.",
      ),
    );
  }
  issues.push(
    ...validateGenerationManifestCompleteness(graph.analysis),
    ...duplicateIssues(
      graph.analysis.generationInputs.map((input) => input.path),
      "analysis.generationInputs",
      "generation input path",
    ),
    ...duplicateIssues(
      graph.analysis.sourceFragments.map((fragment) => fragment.path),
      "analysis.sourceFragments",
      "source fragment path",
    ),
  );
  graph.analysis.generationInputs.forEach((input, index) => {
    issues.push(
      ...repositoryRelativePathIssues(
        input.path,
        `analysis.generationInputs[${index}].path`,
      ),
    );
  });
  const sortedGenerationInputPaths = graph.analysis.generationInputs
    .map((input) => input.path)
    .sort(compareCodeUnits);
  if (
    !graph.analysis.generationInputs.every(
      (input, index) => input.path === sortedGenerationInputPaths[index],
    )
  ) {
    issues.push(
      issue(
        "generation-input-order",
        "analysis.generationInputs",
        "Generation input references must use canonical code-unit path order.",
      ),
    );
  }
  graph.analysis.sourceFragments.forEach((fragment, index) => {
    issues.push(
      ...repositoryRelativePathIssues(
        fragment.path,
        `analysis.sourceFragments[${index}].path`,
      ),
    );
  });

  issues.push(
    ...validateUniqueIds(
      graph.artifactTypes,
      graph.mechanisms,
      graph.capabilityGroups,
      graph.analysis.sourceFragments.map((fragment) => fragment.fragmentId),
    ),
    ...validateVocabularies(graph.artifactTypes, graph.mechanisms),
    ...validateReferentialIntegrity(
      graph.artifactTypes,
      graph.mechanisms,
      graph.capabilityGroups,
      true,
    ),
    ...validatePorts(graph.artifactTypes, graph.mechanisms),
    ...validateArtifactTypeCompatibility(
      graph.artifactTypes,
      graph.mechanisms,
      graph.analysis,
    ),
    ...validateSourceSynchronization(
      graph.sourceSnapshot,
      graph.mechanisms,
      sourceText,
      true,
    ),
  );
  return issues;
}

export async function validateGenerationFiles(
  graph: CapabilityGraph,
  repositoryRoot = REPOSITORY_ROOT,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const files = new Map<
    string,
    Awaited<ReturnType<typeof readStrictText>> & { value?: unknown }
  >();

  async function load(path: string): Promise<Awaited<ReturnType<typeof readStrictText>> | undefined> {
    const pathIssues = repositoryRelativePathIssues(path, path);
    if (pathIssues.length > 0) {
      issues.push(...pathIssues);
      return undefined;
    }
    const cached = files.get(path);
    if (cached) return cached;
    const absolutePath = resolve(repositoryRoot, path);
    try {
      const file = path.endsWith(".json")
        ? await readStrictJson<unknown>(absolutePath)
        : await readStrictText(absolutePath);
      files.set(path, file);
      return file;
    } catch (error: unknown) {
      issues.push(
        issue(
          "generation-input-read",
          path,
          error instanceof Error ? error.message : String(error),
        ),
      );
      return undefined;
    }
  }

  for (const [index, input] of graph.analysis.generationInputs.entries()) {
    const file = await load(input.path);
    if (!file) continue;
    const path = `analysis.generationInputs[${index}]`;
    const actualHash = sha256(file.bytes);
    if (input.sha256 !== actualHash) {
      issues.push(
        issue(
          "generation-input-hash",
          `${path}.sha256`,
          `Declared ${input.sha256}; file bytes hash to ${actualHash}.`,
        ),
      );
    }
    if (input.byteLength !== file.bytes.byteLength) {
      issues.push(
        issue(
          "generation-input-length",
          `${path}.byteLength`,
          `Declared ${input.byteLength}; file has ${file.bytes.byteLength} bytes.`,
        ),
      );
    }
  }

  for (const [index, fragment] of graph.analysis.sourceFragments.entries()) {
    const file = await load(fragment.path);
    if (!file) continue;
    const path = `analysis.sourceFragments[${index}]`;
    const actualHash = sha256(file.bytes);
    if (fragment.sha256 !== actualHash) {
      issues.push(
        issue(
          "source-fragment-hash",
          `${path}.sha256`,
          `Declared ${fragment.sha256}; fragment bytes hash to ${actualHash}.`,
        ),
      );
    }
    if (fragment.byteLength !== file.bytes.byteLength) {
      issues.push(
        issue(
          "source-fragment-length",
          `${path}.byteLength`,
          `Declared ${fragment.byteLength}; fragment has ${file.bytes.byteLength} bytes.`,
        ),
      );
    }
    const input = graph.analysis.generationInputs.find(
      (candidate) => candidate.path === fragment.path,
    );
    if (
      !input ||
      input.sha256 !== fragment.sha256 ||
      input.byteLength !== fragment.byteLength
    ) {
      issues.push(
        issue(
          "source-fragment-manifest",
          path,
          "Source fragment identity must exactly match its generation-input manifest entry.",
        ),
      );
    }
    const value = files.get(fragment.path)?.value as
      | { fragmentId?: unknown }
      | undefined;
    if (value?.fragmentId !== fragment.fragmentId) {
      issues.push(
        issue(
          "source-fragment-id",
          `${path}.fragmentId`,
          `Declared ${fragment.fragmentId}; fragment file declares ${String(value?.fragmentId)}.`,
        ),
      );
    }
  }

  return issues;
}

export function validateFragment(
  fragment: MappingFragment,
  groups: CapabilityGroups,
  sourceText?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (fragment.documentKind !== "capability-graph-mapping-fragment") {
    issues.push(issue("document-kind", "documentKind", "Unexpected fragment document kind."));
  }
  if (fragment.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    issues.push(issue("schema-version", "schemaVersion", "Unsupported fragment schema version."));
  }
  issues.push(
    ...validateUniqueIds(fragment.artifactTypes, fragment.mechanismTypings, groups),
    ...validateVocabularies(fragment.artifactTypes, fragment.mechanismTypings),
    ...validateReferentialIntegrity(
      fragment.artifactTypes,
      fragment.mechanismTypings,
      groups,
      false,
    ),
    ...validatePorts(fragment.artifactTypes, fragment.mechanismTypings),
  );
  if (sourceText !== undefined) {
    issues.push(
      ...validateSourceSynchronization(
        fragment.sourceSnapshot,
        fragment.mechanismTypings,
        sourceText,
        false,
      ),
    );
  }
  return issues;
}

async function runCli(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length < 2 || arguments_.length > 3) {
    throw new Error(
      "Usage:\n  validate.ts <capability-graph.json> <MECHANISMS.md>\n  validate.ts <fragment.json> <MECHANISMS.md> [capability-groups.json]",
    );
  }
  const [documentPath, sourcePath, groupsPath] = arguments_ as [
    string,
    string,
    string?,
  ];

  const [documentFile, sourceFile, graphSchemaFile, fragmentSchemaFile] =
    await Promise.all([
      readStrictJson<Record<string, unknown>>(resolve(documentPath)),
      readStrictText(resolve(sourcePath)),
      readStrictJson<Record<string, unknown>>(GRAPH_SCHEMA_PATH),
      readStrictJson<Record<string, unknown>>(FRAGMENT_SCHEMA_PATH),
    ]);
  const document = documentFile.value;
  const sourceText = sourceFile.text;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: false,
  });
  ajv.addSchema(graphSchemaFile.value);
  const graphSchemaId = graphSchemaFile.value.$id;
  if (typeof graphSchemaId !== "string") {
    throw new Error(`${GRAPH_SCHEMA_PATH}: schema has no $id.`);
  }
  const validateGraphSchema = ajv.getSchema(graphSchemaId);
  if (!validateGraphSchema) {
    throw new Error(`${GRAPH_SCHEMA_PATH}: failed to compile graph schema.`);
  }
  const validateFragmentSchema = ajv.compile(fragmentSchemaFile.value);
  const validateGroupsSchema = ajv.compile({
    $ref: `${graphSchemaId}#/$defs/capabilityGroups`,
  });
  const schemaFailure = (
    label: string,
    errors: Parameters<typeof ajv.errorsText>[0],
  ): Error =>
    new Error(
      `${label} failed JSON Schema validation:\n${ajv.errorsText(errors, { separator: "\n" })}`,
    );
  let issues: ValidationIssue[];

  if (document.documentKind === "typed-capability-compatibility-hypergraph") {
    if (arguments_.length !== 2) {
      throw new Error(
        "Graph validation accepts exactly: validate.ts <capability-graph.json> <MECHANISMS.md>",
      );
    }
    if (!validateGraphSchema(document)) {
      throw schemaFailure("Capability graph", validateGraphSchema.errors);
    }
    const graph = document as unknown as CapabilityGraph;
    if (!validateGroupsSchema(graph.capabilityGroups)) {
      throw schemaFailure("Embedded capability groups", validateGroupsSchema.errors);
    }
    issues = [
      ...validateCapabilityGraph(graph, sourceText),
      ...(await validateGenerationFiles(graph)),
    ];
  } else if (document.documentKind === "capability-graph-mapping-fragment") {
    if (!validateFragmentSchema(document)) {
      throw schemaFailure("Mapping fragment", validateFragmentSchema.errors);
    }
    const defaultGroupsPath = fileURLToPath(
      new URL("../data/capability-groups.json", import.meta.url),
    );
    const groupsFile = await readStrictJson<CapabilityGroups>(
      resolve(groupsPath ?? defaultGroupsPath),
    );
    if (!validateGroupsSchema(groupsFile.value)) {
      throw schemaFailure("Capability groups", validateGroupsSchema.errors);
    }
    issues = validateFragment(
      document as unknown as MappingFragment,
      groupsFile.value,
      sourceText,
    );
  } else {
    throw new Error("Document has an unknown or missing documentKind.");
  }

  if (issues.length > 0) {
    for (const validationIssue of issues) {
      console.error(
        `${validationIssue.code}\t${validationIssue.path}\t${validationIssue.message}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("Semantic validation passed.");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
