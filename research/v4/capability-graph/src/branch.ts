import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { compareCodeUnits, readStrictJson, serializeCanonical, sha256 } from "./generation.ts";
import { WORKBENCH_LAYERS } from "./branch-types.ts";
import type {
  BranchAnalysis,
  BranchCardinality,
  BranchConstraint,
  CurrentMechanismDisposition,
  BranchFailure,
  BranchInputGroup,
  BranchOutputBranch,
  BranchPlanManifest,
  BranchPort,
  BranchRecipe,
  BranchReadinessProvider,
  EqualityConstraint,
  MechanismSidecars,
  ProposedArtifact,
  ProposedMechanism,
  RecipeAnalysis,
  RecipeBinding,
  WorkbenchLayer,
} from "./branch-types.ts";
import type {
  ArtifactType,
  CapabilityGraph,
  InputPort,
  MechanismRecord,
  OutputPort,
} from "./types.ts";

const GRAPH_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const BRANCH_PLAN_PATH = resolve(GRAPH_ROOT, "data/branch-plan.json");
export const BRANCH_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/branch-plan.schema.json");
export const BRANCH_ANALYSIS_PATH = resolve(GRAPH_ROOT, "data/branch-analysis.json");
export const BRANCH_REPORT_PATH = resolve(GRAPH_ROOT, "BRANCH_RESEARCH.md");

interface PlannedContract {
  id: string;
  origin: "current" | "proposed";
  title: string;
  operation: string;
  productInputs: BranchInputGroup[];
  outputBranches: BranchOutputBranch[];
  fixedConfigRefs: string[];
  requiredNonProductInputs: BranchPort[];
  implementationAvailable: boolean;
  fixtureAvailable: boolean;
  visualizationAvailable: boolean;
  humanScoreAvailable: boolean;
}

interface ArtifactContract {
  id: string;
  productFocus: ArtifactType["productFocus"];
  payloadShape?: ProposedArtifact["payloadShape"];
  semanticRoles?: string[];
  valueInspection?: {
    paths: Array<{
      valuePath: string;
      valueKind: string;
      permittedConstraints: Array<{ comparator: string; value?: unknown }>;
      semanticRole?: string;
    }>;
    relations?: ProposedArtifact["valueInspection"]["relations"];
  };
}

interface CardinalityRange {
  min: number;
  max: number;
}

interface ResolvedBinding {
  binding: RecipeBinding;
  path: string;
  consumerInstanceId: string;
  consumer: BranchPort;
  producer: BranchPort;
}

const PRODUCT_TREATMENT_IDENTITY_PATHS = [
  "/sourceImageId",
  "/nativeRasterId",
  "/provenanceChain",
  "/roleProvenance",
  "/candidateDomainId",
  "/paletteDomainId",
  "/candidateIds",
  "/selectedCandidateId",
  "/selectedHypothesisId",
  "/selectedCandidateIds",
  "/selectedTreatmentRecord",
  "/selectedTreatmentRecords",
  "/selectionObjectiveId",
  "/treatmentId",
  "/roleAssignments",
  "/roles/background/color",
  "/roles/surface/color",
  "/roles/foreground/color",
  "/roles/accent/color",
  "/contractVersion",
  "/roles/background/rgb",
  "/roles/background/hex",
  "/roles/surface/rgb",
  "/roles/surface/hex",
  "/roles/foreground/rgb",
  "/roles/foreground/hex",
  "/roles/accent/rgb",
  "/roles/accent/hex",
  "/gradient",
  "/collapse/surfaceCollapsed",
  "/collapse/accentCollapsed",
  "/contrast/minTextContrast/requestedLc",
  "/contrast/minTextContrast/effectiveRawMagnitude",
  "/contrast/minAccentContrast/requestedLc",
  "/contrast/minAccentContrast/effectiveRawMagnitude",
  "/metadata/algorithmVersion",
  "/metadata/preprocessingVersion",
  "/metadata/inputContentHash",
  "/metadata/sourceRendition/path",
  "/metadata/sourceRendition/width",
  "/metadata/sourceRendition/height",
  "/metadata/sourceRendition/format",
  "/metadata/processedSize/width",
  "/metadata/processedSize/height",
  "/treatmentKind",
  "/gradient/stops",
  "/gradient/path",
  "/gradient/endpoints",
] as const;

const SELECTED_TREATMENT_RECORD_CONTENT_PATHS =
  PRODUCT_TREATMENT_IDENTITY_PATHS.filter(
    (valuePath) =>
      valuePath !== "/selectedTreatmentRecord" &&
      valuePath !== "/selectedTreatmentRecords",
  );

// Minimal in-memory fixtures predate the product/custody identity split. Keep
// their contract recognizable without permitting it in the authored branch.
const LEGACY_TEST_TREATMENT_IDENTITY_PATHS = [
  "/sourceFingerprint",
  ...PRODUCT_TREATMENT_IDENTITY_PATHS.slice(1),
] as const;

const ADMITTED_TREATMENT_IDENTITY_PATHS = [
  ...PRODUCT_TREATMENT_IDENTITY_PATHS,
  "/occupiedColorIds",
  "/roles/background/occupiedColorId",
  "/roles/background/nativePixelWitness",
  "/roles/surface/occupiedColorId",
  "/roles/surface/nativePixelWitness",
  "/roles/foreground/occupiedColorId",
  "/roles/foreground/nativePixelWitness",
  "/roles/accent/occupiedColorId",
  "/roles/accent/nativePixelWitness",
  "/gradient/stopColorIds",
  "/gradient/stopOccupiedColorIds",
  "/gradient/stopNativePixelWitnesses",
  "/gradient/endpointColorIds",
  "/gradient/endpointOccupiedColorIds",
  "/gradient/endpointNativePixelWitnesses",
  "/admission/kind",
  "/admission/membershipChecks",
  "/admission/allRequiredColorsOccupied",
  "/admission/candidateDomainId",
] as const;

const EMERGENCY_ADMISSION_IDENTITY_PATHS = [
  "/admission/infeasibilityProofId",
  "/admission/evaluatedCandidateIds",
  "/admission/exhaustedConstraintWitnesses",
  "/admission/zeroFeasibleCount",
] as const;

const ADMITTED_UNION_IDENTITY_PATHS = [
  ...ADMITTED_TREATMENT_IDENTITY_PATHS,
  "/treatmentVariant",
] as const;

const EMERGENCY_FLAT_WITNESS_PATHS = [
  ...PRODUCT_TREATMENT_IDENTITY_PATHS,
  "/occupiedColorIds",
  "/roles/background/occupiedColorId",
  "/roles/background/nativePixelWitness",
  "/roles/surface/occupiedColorId",
  "/roles/surface/nativePixelWitness",
  "/roles/foreground/occupiedColorId",
  "/roles/foreground/nativePixelWitness",
  "/roles/accent/occupiedColorId",
  "/roles/accent/nativePixelWitness",
] as const;

const SELECTED_MEMBER_IDENTITY_PATHS = [
  "/sourceImageId",
  "/nativeRasterId",
  "/provenanceChain",
  "/candidateDomainId",
  "/paletteDomainId",
  "/candidateIds",
  "/selectedCandidateId",
  "/selectedHypothesisId",
  "/selectedCandidateIds",
  "/selectedTreatmentRecord",
  "/selectedTreatmentRecords",
  "/selectionObjectiveId",
] as const;

const SELECTED_DECISION_DOMAIN_IDENTITY_PATHS = SELECTED_MEMBER_IDENTITY_PATHS.filter(
  (valuePath) =>
    valuePath !== "/selectedTreatmentRecord" &&
    valuePath !== "/selectedTreatmentRecords",
);

const V3_PALETTE_REQUIRED_PATHS = [
  "/contractVersion",
  "/roles/background/rgb",
  "/roles/background/hex",
  "/roles/surface/rgb",
  "/roles/surface/hex",
  "/roles/foreground/rgb",
  "/roles/foreground/hex",
  "/roles/accent/rgb",
  "/roles/accent/hex",
  "/gradient",
  "/collapse/surfaceCollapsed",
  "/collapse/accentCollapsed",
  "/contrast/minTextContrast/requestedLc",
  "/contrast/minTextContrast/effectiveRawMagnitude",
  "/contrast/minAccentContrast/requestedLc",
  "/contrast/minAccentContrast/effectiveRawMagnitude",
  "/metadata/algorithmVersion",
  "/metadata/preprocessingVersion",
  "/metadata/inputContentHash",
  "/metadata/sourceRendition/path",
  "/metadata/sourceRendition/width",
  "/metadata/sourceRendition/height",
  "/metadata/sourceRendition/format",
  "/metadata/processedSize/width",
  "/metadata/processedSize/height",
] as const;

const TREATMENT_KIND_CONSTRAINT: BranchConstraint = {
  valuePath: "/treatmentKind",
  comparator: "in",
  value: ["flat", "gradient"],
};

const JOINT_HYPOTHESES = "artifact.treatment.joint-role-hypotheses.v1";
const FINITE_FACTORS = "artifact.treatment.finite-role-factors.v1";
const SWAP_LEGAL_DOMAIN = "artifact.treatment.swap-legal-candidate-domain.v1";
const SELECTED_DECISION = "artifact.decision.selected-treatment-hypothesis.v1";
const SELECTED_TREATMENT = "artifact.treatment.selected-source-ordinary.v1";
const REPAIR_WINNER_INPUT = "artifact.treatment.repair-winner-input.v1";
const REPAIR_RESULT = "artifact.treatment.repair-result.v1";
const REPAIRED_TREATMENT = "artifact.treatment.repaired-source-ordinary.v1";
const ADMITTED_TREATMENT = "artifact.treatment.admitted-final.v1";
const SELECTION_FEASIBILITY = "artifact.decision.exact-source-selection-feasibility.v1";
const INFEASIBILITY_PROOF = "artifact.proof.exact-source-selection-infeasibility.v1";
const NATIVE_OCCUPANCY = "artifact.measurement.native-color-occupancy.v1";
const JOINT_HYPOTHESIS_CONSTRUCTION = "treatment.joint-hypothesis-construction";
const FINITE_FACTOR_CONSTRUCTION = "treatment.finite-factor-construction";
const SWAPPED_CANDIDATE_DOMAIN_INSERTION = "treatment.swapped-candidate-domain-insertion";
const SELECTED_DECISION_MECHANISM = "selection.total-order-election";
const SELECTED_TREATMENT_ROLE_REIFICATION = "treatment.selected-treatment-role-reification";
const REPAIR_WINNER_INPUT_CONSTRUCTION = "repair.winner-input-construction";
const REPAIR_MECHANISM = "repair.exact-source-admission";
const REPAIR_RESULT_ROLE_REIFICATION = "repair.result-role-reification";
const EXACT_SOURCE_INFEASIBILITY_PROOF = "selection.exact-source-infeasibility-proof";
const EMERGENCY_EXACT_SOURCE_ADMISSION = "publication.emergency-exact-source-admission";
const ORDINARY_EXACT_SOURCE_ADMISSION = "publication.ordinary-exact-source-admission";

const COMPLETE_TREATMENT_EMITTERS = new Set([
  SELECTED_TREATMENT_ROLE_REIFICATION,
  REPAIR_WINNER_INPUT_CONSTRUCTION,
  REPAIR_MECHANISM,
  REPAIR_RESULT_ROLE_REIFICATION,
  ORDINARY_EXACT_SOURCE_ADMISSION,
  EMERGENCY_EXACT_SOURCE_ADMISSION,
  "publication.ui-palette-v3-materializer",
]);

const BOUNDED_PROPOSED_OUTPUT_FAMILIES = new Map<string, ReadonlySet<string>>([
  ["evidence.native-raster-primitives", new Set([
    "artifact.evidence.evidence-native-raster-primitives.v1",
    "artifact.scalar-field.native-intensity.v1",
    "artifact.raster.native-oklab-float.v1",
    "artifact.scalar-field.soft-morphology-input.v1",
    "artifact.measurement.rgbxy-normalized-coordinates.v1",
  ])],
  ["evidence.native-pixel-graph-construction", new Set([
    "artifact.evidence.evidence-native-pixel-graph-construction.v1",
    "artifact.graph.pixel-adjacency.v1",
  ])],
  ["evidence.native-edge-dissimilarity-measurement", new Set([
    "artifact.evidence.evidence-native-edge-dissimilarity-measurement.v1",
    "artifact.measurement.graph-edge-dissimilarities.v1",
  ])],
  ["evidence.native-component-local-measurement", new Set([
    "artifact.evidence.evidence-native-component-local-measurement.v1",
    "artifact.region-set.native-family-components.v1",
  ])],
  ["evidence.native-family-evidence-construction", new Set([
    "artifact.evidence.evidence-native-family-evidence-construction.v1",
    NATIVE_OCCUPANCY,
    "artifact.measurement.color-family-evidence.v1",
    "artifact.statistic.native-color-histogram-role-evidence.v1",
  ])],
  ["candidate.archetypoid-observation-construction", new Set([
    "artifact.candidates.candidate-archetypoid-observation-construction.v1",
    "artifact.hypothesis.logical-treatment-descriptor.v1",
    "artifact.candidate-set.archetypoids-observations.v1",
    "artifact.candidate-set.structured-hypotheses.v1",
    "artifact.candidate-set.multicriteria-alternatives.v1",
    "artifact.measurement.oriented-criterion-performance-table.v1",
    "artifact.candidate-set.submodular-selection-items.v1",
  ])],
  ["field.accepted-domain-measurement", new Set([
    "artifact.domain.field-accepted-domain-measurement.v1",
    "artifact.region-set.field-domain-evidence.v1",
    "artifact.evidence.field-domain.v1",
  ])],
  ["saliency.source-color-proposal-extraction", new Set([
    "artifact.saliency.saliency-source-color-proposal-extraction.v1",
    "artifact.color.global-mean-cielab.v1",
    "artifact.scalar-field.normalized-scale-saliency-input.v1",
  ])],
  ["role.artwork-family-relation-measurement", new Set([
    "artifact.roles.role-artwork-family-relation-measurement.v1",
    "artifact.hypothesis.artwork-family-relations.v1",
  ])],
  [SWAPPED_CANDIDATE_DOMAIN_INSERTION, new Set([
    SWAP_LEGAL_DOMAIN,
    "artifact.candidate-set.complete-infeasible-source-domain.v1",
    "artifact.measurement.role-swap-legality.v1",
    "artifact.candidate-set.finite-treatment-tuple-factors.v1",
    "artifact.candidate-set.complete-treatment-domain.v1",
  ])],
  ["gradient.native-transition-publication", new Set([
    "artifact.gradient.gradient-native-transition-publication.v1",
    "artifact.decision.gradient-transition-publication.v1",
  ])],
  [REPAIR_WINNER_INPUT_CONSTRUCTION, new Set([
    REPAIR_WINNER_INPUT,
    "artifact.treatment.published-internal-with-midpoint.v1",
    "artifact.candidate-set.ranked-source-eligible-repair-slate.v1",
    "artifact.treatment.complete-internal.v1",
  ])],
]);

function failure(code: string, path: string, message: string): BranchFailure {
  return { code, path, message };
}

function hasTreatmentContentContract(port: BranchPort): boolean {
  const kindConstraint = port.constraints.some(
    (constraint) =>
      sameJson(constraint, TREATMENT_KIND_CONSTRAINT) ||
      (constraint.valuePath === "/treatmentKind" &&
        constraint.comparator === "equals" &&
        (constraint.value === "flat" || constraint.value === "gradient")),
  );
  return (
    (PRODUCT_TREATMENT_IDENTITY_PATHS.every((valuePath) => port.identityPaths.includes(valuePath)) ||
      LEGACY_TEST_TREATMENT_IDENTITY_PATHS.every((valuePath) =>
        port.identityPaths.includes(valuePath),
      )) &&
    kindConstraint
  );
}

function treatmentContentPathCount(port: BranchPort): number {
  return PRODUCT_TREATMENT_IDENTITY_PATHS.filter((valuePath) =>
    port.identityPaths.includes(valuePath),
  ).length;
}

function hasAdmittedTreatmentContract(
  port: BranchPort,
  admissionKind?: "ordinary" | "emergency-flat",
): boolean {
  const admissionConstraint = port.constraints.some(
    (constraint) =>
      constraint.valuePath === "/admission/kind" &&
      (admissionKind
        ? constraint.comparator === "equals" && constraint.value === admissionKind
        : constraint.comparator === "in" &&
          sameJson(constraint.value, ["ordinary", "emergency-flat"])),
  );
  const membershipConstraint = port.constraints.some(
    (constraint) =>
      constraint.valuePath === "/admission/allRequiredColorsOccupied" &&
      constraint.comparator === "equals" &&
      constraint.value === true,
  );
  return (
    port.artifactTypeId === ADMITTED_TREATMENT &&
    hasTreatmentContentContract(port) &&
    [...ADMITTED_TREATMENT_IDENTITY_PATHS,
      ...(admissionKind === "emergency-flat" ? EMERGENCY_ADMISSION_IDENTITY_PATHS : []),
    ].every((valuePath) =>
      port.identityPaths.includes(valuePath),
    ) &&
    admissionConstraint &&
    membershipConstraint
  );
}

function productArtifactTypes(groups: readonly BranchInputGroup[]): string[] {
  return allPorts(groups).map((port) => port.artifactTypeId);
}

function successArtifactTypes(mechanism: ProposedMechanism): string[] {
  return mechanism.productOutputs
    .find((branch) => branch.id === "success")
    ?.ports.map((port) => port.artifactTypeId) ?? [];
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort(compareCodeUnits).every(
      (value, index) => value === [...expected].sort(compareCodeUnits)[index],
    )
  );
}

function equalityPreserves(
  equalityConstraints: readonly EqualityConstraint[],
  identityPaths: readonly string[],
): boolean {
  return identityPaths.every((valuePath) =>
    equalityConstraints.some(
      (constraint) =>
        constraint.producerValuePath === valuePath &&
        constraint.consumerValuePath === valuePath,
    ),
  );
}

function hasCrossPortConstraint(
  mechanism: ProposedMechanism,
  leftPortId: string,
  leftValuePath: string,
  relation: ProposedMechanism["crossPortConstraints"][number]["relation"],
  rightPortId: string,
  rightValuePath: string,
): boolean {
  return mechanism.crossPortConstraints.some(
    (constraint) =>
      constraint.leftPortId === leftPortId &&
      constraint.leftValuePath === leftValuePath &&
      constraint.relation === relation &&
      constraint.rightPortId === rightPortId &&
      constraint.rightValuePath === rightValuePath,
  );
}

function preservesAcrossPorts(
  mechanism: ProposedMechanism,
  inputPortId: string,
  outputPortId: string,
  valuePaths: readonly string[],
): boolean {
  return valuePaths.every((valuePath) =>
    hasCrossPortConstraint(
      mechanism,
      inputPortId,
      valuePath,
      "equals",
      outputPortId,
      valuePath,
    ),
  );
}

function isSemanticClosureShim(
  artifact: ProposedArtifact,
  sourceArtifactTypeId: string,
): boolean {
  if (artifact.kind !== "product") return false;
  if (/^artifact\.plan\.route(?:\.|$)/.test(artifact.id.toLowerCase())) {
    return true;
  }
  if (artifact.id === sourceArtifactTypeId) {
    return false;
  }
  const forbiddenCustodyPaths = new Set([
    "/sourceFingerprint",
    "/nativeRasterId",
    "/provenanceChain",
    "/candidateIds",
    "/roleProvenance",
  ]);
  const forbiddenShellRoots = new Set([
    "/artifactId",
    "/branchId",
    "/closureId",
    "/custodyId",
    "/domainValues",
    "/handoffId",
    "/mintId",
    "/output",
    "/payload",
    "/provenanceId",
    "/result",
    "/routeId",
    "/token",
    "/value",
    "/witnessId",
  ]);
  const forbiddenGenericTerminals = new Set([
    "computationid",
    "computedvalues",
    "certificates",
    "entries",
    "measurements",
    "nodesandedges",
    "orderedentries",
    "results",
    "roletreatments",
    "selectedentries",
    "sourceids",
    "structure",
    "values",
  ]);
  const contractPaths = new Set([
    ...artifact.payloadShape.fields.map((field) => field.valuePath),
    ...artifact.valueInspection.paths.map((path) => path.valuePath),
  ]);
  const hasOnlyForbiddenContract = [...contractPaths].every((valuePath) => {
    if (forbiddenCustodyPaths.has(valuePath)) return true;
    const root = `/${valuePath.split("/").filter(Boolean)[0] ?? ""}`;
    const terminal = valuePath.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    return forbiddenShellRoots.has(root) || forbiddenGenericTerminals.has(terminal);
  });
  const semanticText = [
    artifact.id,
    artifact.label,
    artifact.description,
    artifact.payloadShape.description,
    ...artifact.valueInspection.notes,
  ].join(" ").toLowerCase();
  const namesForbiddenShimSemantics =
    /(?:^|[^a-z0-9])(?:branch|closure|custody|handoff|mint|minted|provenance|relay|route|routing|wrapper)(?:[^a-z0-9]|$)/.test(
      semanticText,
    );
  return contractPaths.size > 0 && hasOnlyForbiddenContract &&
    (namesForbiddenShimSemantics || artifact.kind === "product");
}

const GENERIC_PRODUCT_FIELD_TERMINALS = new Set([
  "computationid",
  "computedvalues",
  "certificates",
  "entries",
  "measurements",
  "nodesandedges",
  "orderedentries",
  "results",
  "roletreatments",
  "selectedentries",
  "sourceids",
  "structure",
  "values",
]);

function isComputationalInspectionPath(path: ProposedArtifact["valueInspection"]["paths"][number]): boolean {
  const identityRoles = new Set(["identity.source", "identity.custody"]);
  const terminal = path.valuePath.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
  return !identityRoles.has(path.semanticRole ?? "") &&
    !GENERIC_PRODUCT_FIELD_TERMINALS.has(terminal) &&
    ![
      "/sourceFingerprint",
      "/sourceImageId",
      "/nativeRasterId",
      "/provenanceChain",
    ].includes(path.valuePath);
}

function hasMechanismSpecificComputationalContract(
  artifact: ProposedArtifact,
  mechanismId: string,
): boolean {
  const fieldByPath = new Map(artifact.payloadShape.fields.map((field) => [field.valuePath, field]));
  const computational = artifact.valueInspection.paths.filter(
    (inspection) =>
      isComputationalInspectionPath(inspection) &&
      fieldByPath.get(inspection.valuePath)?.required === true,
  );
  return artifact.semanticRoles?.includes(`mechanism.${mechanismId}`) === true &&
    computational.length >= 2 &&
    computational.every((inspection) => {
      return typeof inspection.semanticRole === "string" &&
        !inspection.semanticRole.startsWith("mechanism.") &&
        inspection.permittedConstraints.some((constraint) => {
          if (constraint.comparator === "count-between-inclusive") {
            return Array.isArray(constraint.value) && constraint.value.length === 2 &&
              constraint.value.every((value) => typeof value === "number") &&
              constraint.value[0] >= 0 && constraint.value[1] >= constraint.value[0];
          }
          if (constraint.comparator === "count-equals") {
            return typeof constraint.value === "number" && constraint.value >= 0;
          }
          if (constraint.comparator === "matches") {
            return typeof constraint.value === "string" &&
              ![".+", "^.+$", ".*", "^.*$"].includes(constraint.value);
          }
          return constraint.value !== undefined;
        });
    });
}

function hasMeaningfulDomainInspection(artifact: ProposedArtifact): boolean {
  return artifact.valueInspection.paths.some((path) =>
    path.permittedConstraints.some((constraint) => {
      if (constraint.comparator === "matches") {
        return (
          typeof constraint.value === "string" &&
          ![".+", "^.+$", ".*", "^.*$"].includes(constraint.value)
        );
      }
      if (constraint.comparator === "count-equals") {
        return typeof constraint.value === "number" && constraint.value >= 0;
      }
      if (constraint.comparator === "count-between-inclusive") {
        return (
          Array.isArray(constraint.value) &&
          constraint.value.length === 2 &&
          constraint.value.every((value) => typeof value === "number") &&
          constraint.value[0] >= 0 &&
          constraint.value[1] >= constraint.value[0] &&
          (constraint.value[0] > 0 || constraint.value[1] <= 16)
        );
      }
      if (constraint.comparator === "equals") {
        return constraint.value !== "present";
      }
      return Array.isArray(constraint.value) && constraint.value.length > 0;
    }),
  );
}

function sidecars(
  manifest: BranchPlanManifest,
  mechanismId: string,
): MechanismSidecars {
  return {
    fixtureId: manifest.sidecarPolicy.fixtureIdTemplate.replace(
      "{mechanismId}",
      mechanismId,
    ),
    visualizationId: manifest.sidecarPolicy.visualizationIdTemplate.replace(
      "{mechanismId}",
      mechanismId,
    ),
    humanScoreId: manifest.sidecarPolicy.humanScoreIdTemplate.replace(
      "{mechanismId}",
      mechanismId,
    ),
  };
}

function expandRecipeModules(manifest: BranchPlanManifest): BranchPlanManifest {
  const recipeModules = manifest.recipeModules ?? [];
  const moduleIds = recipeModules.map((module) => module.id);
  if (new Set(moduleIds).size !== moduleIds.length) {
    formatHardFailures([
      failure("duplicate-recipe-module", "recipeModules", "IDs must be unique."),
    ]);
  }
  const modules = new Map(recipeModules.map((module) => [module.id, module]));
  const failures: BranchFailure[] = [];
  const recipes = manifest.recipes.map((recipe) => {
    const moduleSteps = (recipe.moduleRefs ?? []).flatMap((moduleId) => {
      const module = modules.get(moduleId);
      if (!module) {
        failures.push(
          failure("unknown-recipe-module", `recipes.${recipe.id}.moduleRefs`, moduleId),
        );
        return [];
      }
      return structuredClone(module.steps);
    });
    return {
      ...structuredClone(recipe),
      moduleRefs: recipe.moduleRefs ?? [],
      steps: [...moduleSteps, ...structuredClone(recipe.steps)],
    };
  });
  if (failures.length > 0) formatHardFailures(failures);
  return { ...manifest, recipes };
}

function cardinalityRange(cardinality: BranchCardinality): CardinalityRange {
  switch (cardinality) {
    case "exactly-one":
      return { min: 1, max: 1 };
    case "exactly-two":
      return { min: 2, max: 2 };
    case "zero-or-one":
      return { min: 0, max: 1 };
    case "zero-to-two":
      return { min: 0, max: 2 };
    case "zero-to-six":
      return { min: 0, max: 6 };
    case "one-to-two":
      return { min: 1, max: 2 };
    case "one-or-more":
      return { min: 1, max: Number.POSITIVE_INFINITY };
    case "zero-or-more":
      return { min: 0, max: Number.POSITIVE_INFINITY };
  }
}

function addRanges(ranges: readonly CardinalityRange[]): CardinalityRange {
  return ranges.reduce(
    (sum, range) => ({ min: sum.min + range.min, max: sum.max + range.max }),
    { min: 0, max: 0 },
  );
}

function rangeSatisfies(producer: CardinalityRange, consumer: CardinalityRange): boolean {
  return producer.min >= consumer.min && producer.max <= consumer.max;
}

function cardinalityCompatible(
  producer: BranchCardinality,
  consumer: BranchCardinality,
): boolean {
  return rangeSatisfies(cardinalityRange(producer), cardinalityRange(consumer));
}

function normalizedConstraint(constraint: {
  valuePath: string;
  comparator: string;
  value?: unknown;
}): string {
  return serializeCanonical({
    valuePath: constraint.valuePath,
    comparator: constraint.comparator,
    value: constraint.value,
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return serializeCanonical(left) === serializeCanonical(right);
}

function constraintImplies(
  producer: BranchConstraint,
  consumer: BranchConstraint,
): boolean {
  if (producer.valuePath !== consumer.valuePath) return false;
  if (normalizedConstraint(producer) === normalizedConstraint(consumer)) return true;
  if (consumer.comparator === "equals") {
    return (
      producer.comparator === "in" &&
      Array.isArray(producer.value) &&
      producer.value.length === 1 &&
      sameJson(producer.value[0], consumer.value)
    );
  }
  if (consumer.comparator === "in" && Array.isArray(consumer.value)) {
    if (producer.comparator === "equals") {
      return consumer.value.some((value) => sameJson(value, producer.value));
    }
    if (producer.comparator === "in" && Array.isArray(producer.value)) {
      return producer.value.every((value) =>
        (consumer.value as unknown[]).some((candidate) => sameJson(candidate, value)),
      );
    }
  }
  if (consumer.comparator === "matches" && typeof consumer.value === "string") {
    const producerValues = producer.comparator === "equals"
      ? [producer.value]
      : producer.comparator === "in" && Array.isArray(producer.value)
        ? producer.value
        : undefined;
    if (producerValues?.every((value) => typeof value === "string")) {
      try {
        const pattern = new RegExp(consumer.value);
        return producerValues.every((value) => pattern.test(value as string));
      } catch {
        return false;
      }
    }
  }
  if (
    producer.comparator === "count-between-inclusive" &&
    consumer.comparator === "count-between-inclusive" &&
    Array.isArray(producer.value) &&
    Array.isArray(consumer.value) &&
    producer.value.length === 2 &&
    consumer.value.length === 2 &&
    producer.value.every((value) => typeof value === "number") &&
    consumer.value.every((value) => typeof value === "number")
  ) {
    return producer.value[0] >= consumer.value[0] && producer.value[1] <= consumer.value[1];
  }
  if (
    producer.comparator === "count-equals" &&
    consumer.comparator === "count-between-inclusive" &&
    typeof producer.value === "number" &&
    Array.isArray(consumer.value) &&
    consumer.value.length === 2 &&
    consumer.value.every((value) => typeof value === "number")
  ) {
    return producer.value >= consumer.value[0] && producer.value <= consumer.value[1];
  }
  if (
    producer.comparator === "count-between-inclusive" &&
    consumer.comparator === "count-equals" &&
    Array.isArray(producer.value) &&
    producer.value.length === 2 &&
    producer.value.every((value) => typeof value === "number") &&
    typeof consumer.value === "number"
  ) {
    return producer.value[0] === consumer.value && producer.value[1] === consumer.value;
  }
  return false;
}

function equalityDomainsProvablyDisjoint(
  producer: BranchPort,
  consumer: BranchPort,
  producerPath: string,
  consumerPath: string,
  producerInspection: NonNullable<ReturnType<typeof inspectionPath>>,
  consumerInspection: NonNullable<ReturnType<typeof inspectionPath>>,
): boolean {
  const domain = (
    port: BranchPort,
    valuePath: string,
    inspection: NonNullable<ReturnType<typeof inspectionPath>>,
  ) => {
    const constrained = port.constraints.filter((constraint) => constraint.valuePath === valuePath);
    return constrained.length > 0 ? constrained : inspection.permittedConstraints;
  };
  const overlaps = (
    left: { comparator: string; value?: unknown },
    right: { comparator: string; value?: unknown },
  ): boolean | undefined => {
    const values = (constraint: { comparator: string; value?: unknown }): unknown[] | undefined =>
      constraint.comparator === "equals" ? [constraint.value]
        : constraint.comparator === "in" && Array.isArray(constraint.value) ? constraint.value
        : undefined;
    const leftValues = values(left);
    const rightValues = values(right);
    const matches = (value: unknown, pattern: unknown): boolean | undefined => {
      if (typeof value !== "string" || typeof pattern !== "string") return false;
      try {
        return new RegExp(pattern).test(value);
      } catch {
        return undefined;
      }
    };
    if (leftValues && rightValues) {
      return leftValues.some((leftValue) => rightValues.some((rightValue) => sameJson(leftValue, rightValue)));
    }
    if (leftValues && right.comparator === "matches") {
      const results = leftValues.map((value) => matches(value, right.value));
      return results.some((result) => result === true) ? true : results.every((result) => result === false) ? false : undefined;
    }
    if (rightValues && left.comparator === "matches") {
      const results = rightValues.map((value) => matches(value, left.value));
      return results.some((result) => result === true) ? true : results.every((result) => result === false) ? false : undefined;
    }
    return undefined;
  };
  const producerDomain = domain(producer, producerPath, producerInspection);
  const consumerDomain = domain(consumer, consumerPath, consumerInspection);
  return producerDomain.length > 0 && consumerDomain.length > 0 &&
    producerDomain.every((left) => consumerDomain.every((right) => overlaps(left, right) === false));
}

function allPorts(groups: readonly BranchInputGroup[]): BranchPort[] {
  return groups.flatMap((group) => group.ports);
}

function outputBranch(
  contract: PlannedContract,
  branchId: string,
): BranchOutputBranch | undefined {
  return contract.outputBranches.find((branch) => branch.id === branchId);
}

function branchConstraints(
  constraints: InputPort["valueConstraints"] | OutputPort["valueConstraints"],
): BranchConstraint[] {
  return (constraints ?? []).map(
    ({ notes: _, ...constraint }) => constraint as BranchConstraint,
  );
}

function currentProductContract(
  mechanism: MechanismRecord,
  artifacts: ReadonlyMap<string, ArtifactType>,
  demotions: ReadonlySet<string>,
  entry?: CurrentMechanismDisposition,
): PlannedContract {
  const excluded = new Set(entry?.excludedProductPorts ?? []);
  const productInput = (port: InputPort): boolean =>
    port.inputClass === "natural" &&
    artifacts.get(port.artifactTypeId)?.productFocus === "product-flow" &&
    !demotions.has(port.artifactTypeId);
  const requiredPorts = mechanism.inputPorts.filter(
    (port) =>
      productInput(port) &&
      port.requirement === "required" &&
      !excluded.has(`input:${port.id}`),
  );
  const productInputs: BranchInputGroup[] = requiredPorts.map((port) => ({
    id: `required-${port.id}`,
    mode: "all",
    ports: [
      {
        id: port.id,
        artifactTypeId: port.artifactTypeId,
        cardinality: port.cardinality,
        constraints: branchConstraints(port.valueConstraints),
        identityPaths: [],
      },
    ],
  }));
  for (const group of mechanism.alternativeGroups) {
    const ports = mechanism.inputPorts.filter(
      (port) =>
        port.alternativeGroupId === group.id &&
        productInput(port) &&
        !excluded.has(`input:${port.id}`),
    );
    if (ports.length === 0) continue;
    productInputs.push({
      id: group.id,
      mode: group.selectionCardinality,
      ports: ports.map((port) => ({
        id: port.id,
        artifactTypeId: port.artifactTypeId,
        cardinality: port.cardinality,
        constraints: branchConstraints(port.valueConstraints),
        identityPaths: [],
      })),
    });
  }
  const productOutputs: BranchPort[] = mechanism.outputPorts
    .filter(
      (port) =>
        artifacts.get(port.artifactTypeId)?.productFocus === "product-flow" &&
        !demotions.has(port.artifactTypeId) &&
        !excluded.has(`output:${port.id}`),
    )
    .map((port) => ({
      id: port.id,
      artifactTypeId: port.artifactTypeId,
      cardinality: entry?.outputCardinalityOverrides?.[port.id] ?? port.cardinality,
      constraints: branchConstraints(port.valueConstraints),
      identityPaths: [],
    }));
  const fixedConfigRefs = mechanism.inputPorts
    .filter((port) => port.requirement === "configuration")
    .map((port) => `${mechanism.id}:${port.id}:${port.artifactTypeId}`)
    .sort(compareCodeUnits);
  const requiredNonProductInputs = mechanism.inputPorts
    .filter((port) => port.requirement === "required" && !productInput(port))
    .map((port) => ({
      id: port.id,
      artifactTypeId: port.artifactTypeId,
      cardinality: port.cardinality,
      constraints: branchConstraints(port.valueConstraints),
      identityPaths: [],
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  return {
    id: mechanism.id,
    origin: "current",
    title: mechanism.title,
    operation: entry?.replacementContract?.reason ?? mechanism.title,
    productInputs: entry?.replacementContract?.productInputs ?? productInputs,
    outputBranches: entry?.replacementContract?.productOutputs ?? [{ id: "success", ports: productOutputs }],
    fixedConfigRefs,
    requiredNonProductInputs,
    implementationAvailable: mechanism.censusStatus.implementationStates.includes("live"),
    fixtureAvailable: false,
    visualizationAvailable: false,
    humanScoreAvailable: false,
  };
}

function proposedContract(mechanism: ProposedMechanism): PlannedContract {
  return {
    id: mechanism.id,
    origin: "proposed",
    title: mechanism.title,
    operation: mechanism.operation,
    productInputs: mechanism.productInputs,
    outputBranches: mechanism.productOutputs,
    fixedConfigRefs: mechanism.readiness.fixedConfigRefs,
    requiredNonProductInputs: mechanism.readiness.requiredNonProductInputs,
    implementationAvailable: mechanism.readiness.implementationAvailable,
    fixtureAvailable: mechanism.readiness.fixtureAvailable,
    visualizationAvailable: mechanism.readiness.visualizationAvailable,
    humanScoreAvailable: mechanism.readiness.humanScoreAvailable,
  };
}

function artifactContract(
  artifactId: string,
  built: ReadonlyMap<string, ArtifactType>,
  proposed: ReadonlyMap<string, ProposedArtifact>,
): ArtifactContract | undefined {
  return built.get(artifactId) ?? proposed.get(artifactId);
}

function inspectionPath(
  artifact: ArtifactContract | undefined,
  valuePath: string,
): { valueKind: string; permittedConstraints: Array<{ comparator: string; value?: unknown }> } | undefined {
  return artifact?.valueInspection?.paths.find((entry) => entry.valuePath === valuePath);
}

function validatePortDefinition(
  port: BranchPort,
  path: string,
  role: "product" | "readiness",
  builtArtifacts: ReadonlyMap<string, ArtifactType>,
  proposedArtifacts: ReadonlyMap<string, ProposedArtifact>,
  aliases: ReadonlySet<string>,
  demotions: ReadonlySet<string>,
  failures: BranchFailure[],
): void {
  if (aliases.has(port.artifactTypeId)) {
    failures.push(
      failure(
        "artifact-alias-forbidden",
        `${path}.artifactTypeId`,
        `Alias ${port.artifactTypeId} cannot participate in a typed handoff.`,
      ),
    );
    return;
  }
  const artifact = artifactContract(port.artifactTypeId, builtArtifacts, proposedArtifacts);
  if (!artifact) {
    failures.push(
      failure("unknown-branch-artifact", `${path}.artifactTypeId`, port.artifactTypeId),
    );
    return;
  }
  if (
    role === "product" &&
    (artifact.productFocus !== "product-flow" || demotions.has(port.artifactTypeId))
  ) {
    failures.push(
      failure(
        "non-product-artifact",
        `${path}.artifactTypeId`,
        `${port.artifactTypeId} is not available to product flow.`,
      ),
    );
  }
  const seenConstraints = new Set<string>();
  for (const [constraintIndex, constraint] of port.constraints.entries()) {
    const constraintPath = `${path}.constraints[${constraintIndex}]`;
    const identity = normalizedConstraint(constraint);
    if (seenConstraints.has(identity)) {
      failures.push(failure("duplicate-port-constraint", constraintPath, identity.trim()));
    }
    seenConstraints.add(identity);
    const inspection = inspectionPath(artifact, constraint.valuePath);
    if (!inspection) {
      failures.push(
        failure(
          "unanchored-value-constraint",
          constraintPath,
          `${port.artifactTypeId} does not declare ${constraint.valuePath}.`,
        ),
      );
      continue;
    }
    const permitted = inspection.permittedConstraints.some(
      (candidate) =>
        candidate.comparator === constraint.comparator &&
        sameJson(candidate.value, constraint.value),
    );
    if (!permitted) {
      failures.push(
        failure(
          "incompatible-artifact-constraint",
          constraintPath,
          `${constraint.comparator} ${JSON.stringify(constraint.value)} is not permitted at ${constraint.valuePath}.`,
        ),
      );
    }
  }
  for (const [identityIndex, valuePath] of port.identityPaths.entries()) {
    if (!inspectionPath(artifact, valuePath)) {
      failures.push(
        failure(
          "unanchored-identity-path",
          `${path}.identityPaths[${identityIndex}]`,
          `${port.artifactTypeId} does not declare ${valuePath}.`,
        ),
      );
    }
  }
}

function validateBindingCompatibility(
  producer: BranchPort,
  consumer: BranchPort,
  equalityConstraints: readonly EqualityConstraint[],
  path: string,
  builtArtifacts: ReadonlyMap<string, ArtifactType>,
  proposedArtifacts: ReadonlyMap<string, ProposedArtifact>,
  failures: BranchFailure[],
): void {
  if (producer.artifactTypeId !== consumer.artifactTypeId) {
    failures.push(
      failure(
        "artifact-type-mismatch",
        path,
        `${producer.artifactTypeId} does not satisfy ${consumer.artifactTypeId}.`,
      ),
    );
    return;
  }
  const producerByPath = new Map<string, BranchConstraint[]>();
  for (const constraint of producer.constraints) {
    const rows = producerByPath.get(constraint.valuePath) ?? [];
    rows.push(constraint);
    producerByPath.set(constraint.valuePath, rows);
  }
  for (const constraint of consumer.constraints) {
    const candidates = producerByPath.get(constraint.valuePath) ?? [];
    if (candidates.some((candidate) => constraintImplies(candidate, constraint))) continue;
    failures.push(
      failure(
        candidates.length > 0
          ? "incompatible-value-constraint"
          : "missing-value-constraint",
        path,
        `Producer does not guarantee ${normalizedConstraint(constraint).trim()}.`,
      ),
    );
  }
  const artifact = artifactContract(producer.artifactTypeId, builtArtifacts, proposedArtifacts);
  const equalityByConsumerPath = new Map(
    equalityConstraints.map((constraint) => [constraint.consumerValuePath, constraint]),
  );
  for (const [index, equality] of equalityConstraints.entries()) {
    const equalityPath = `${path}.equalityConstraints[${index}]`;
    const producerInspection = inspectionPath(artifact, equality.producerValuePath);
    const consumerInspection = inspectionPath(artifact, equality.consumerValuePath);
    if (!producerInspection || !consumerInspection) {
      failures.push(
        failure(
          "unanchored-equality-constraint",
          equalityPath,
          "Both equality paths must be declared by the artifact inspection contract.",
        ),
      );
    } else if (producerInspection.valueKind !== consumerInspection.valueKind) {
      failures.push(
        failure(
          "identity-kind-mismatch",
          equalityPath,
          `${producerInspection.valueKind} does not match ${consumerInspection.valueKind}.`,
        ),
      );
    } else if (
      equalityDomainsProvablyDisjoint(
        producer,
        consumer,
        equality.producerValuePath,
        equality.consumerValuePath,
        producerInspection,
        consumerInspection,
      )
    ) {
      failures.push(
        failure(
          "incompatible-equality-value-domain",
          equalityPath,
          "Equality endpoints have provably disjoint constrained value domains.",
        ),
      );
    }
  }
  for (const valuePath of consumer.identityPaths) {
    if (!equalityByConsumerPath.has(valuePath)) {
      failures.push(
        failure(
          "missing-identity-constraint",
          path,
          `Consumer identity path ${valuePath} is not bound.`,
        ),
      );
    }
  }
}

function groupCardinalityValid(
  group: BranchInputGroup,
  activePortIds: ReadonlySet<string>,
): boolean {
  const count = group.ports.filter((port) => activePortIds.has(port.id)).length;
  if (group.mode === "all") return count === group.ports.length;
  if (group.mode === "exactly-one") return count === 1;
  return count >= 1 && count <= group.ports.length;
}

function validateRecipeCycles(
  recipeId: string,
  dependencies: ReadonlyMap<string, ReadonlySet<string>>,
  failures: BranchFailure[],
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (instanceId: string): void => {
    if (visited.has(instanceId) || instanceId === "$source") return;
    if (visiting.has(instanceId)) {
      failures.push(
        failure(
          "recipe-cycle",
          `recipes.${recipeId}`,
          `Cycle includes ${instanceId}.`,
        ),
      );
      return;
    }
    visiting.add(instanceId);
    for (const dependency of dependencies.get(instanceId) ?? []) visit(dependency);
    visiting.delete(instanceId);
    visited.add(instanceId);
  };
  for (const instanceId of dependencies.keys()) visit(instanceId);
}

function analyzeRecipe(
  manifest: BranchPlanManifest,
  recipe: BranchPlanManifest["recipes"][number],
  contracts: ReadonlyMap<string, PlannedContract>,
  allCurrentContracts: ReadonlyMap<string, PlannedContract>,
  declaredDisposition: ReadonlyMap<string, string>,
  builtArtifacts: ReadonlyMap<string, ArtifactType>,
  proposedArtifacts: ReadonlyMap<string, ProposedArtifact>,
  fixedConfigurations: ReadonlyMap<string, BranchPlanManifest["fixedConfigurations"][number]>,
  readinessProviders: ReadonlyMap<string, BranchReadinessProvider>,
): RecipeAnalysis {
  const failures: BranchFailure[] = [];
  const readinessFailures: BranchFailure[] = [];
  const instanceContracts = new Map<string, PlannedContract>();
  const instanceSteps = new Map<string, (typeof recipe.steps)[number]>();
  const instanceIndexes = new Map<string, number>();
  const selectedBranches = new Map<string, BranchOutputBranch>();
  const selectedOutputs = new Map<string, ReadonlyMap<string, BranchPort>>();
  const sourcePort: BranchPort = {
    id: "encoded-artwork",
    artifactTypeId: manifest.sourceArtifactTypeId,
    cardinality: "exactly-one",
    constraints: [],
    identityPaths: [],
  };
  selectedOutputs.set("$source", new Map([[sourcePort.id, sourcePort]]));
  const dependencies = new Map<string, Set<string>>();
  const resolvedBindings: ResolvedBinding[] = [];
  // Reader tracking supports connectivity and witness checks. Emission
  // cardinality does not limit fan-out to independent readers.
  const productReaders = new Map<string, { port: BranchPort; paths: string[] }>();

  recipe.steps.forEach((step, stepIndex) => {
    const path = `recipes.${recipe.id}.steps[${stepIndex}]`;
    if (instanceSteps.has(step.instanceId) || step.instanceId === "$source") {
      failures.push(failure("duplicate-instance", `${path}.instanceId`, step.instanceId));
      return;
    }
    const contract = contracts.get(step.mechanismId);
    if (!contract) {
      failures.push(
        failure("unknown-mechanism", `${path}.mechanismId`, step.mechanismId),
      );
      return;
    }
    const disposition = declaredDisposition.get(step.mechanismId);
    if (disposition === "condemned" || disposition === "sidecar") {
      failures.push(
        failure(
          "non-product-step",
          `${path}.mechanismId`,
          `${step.mechanismId} is ${disposition}.`,
        ),
      );
    }
    const branch = outputBranch(contract, step.selectedOutputBranch);
    if (!branch) {
      failures.push(
        failure(
          "unknown-output-branch",
          `${path}.selectedOutputBranch`,
          step.selectedOutputBranch,
        ),
      );
      return;
    }
    if (branch.id !== "success") {
      failures.push(
        failure(
          "non-success-product-branch",
          `${path}.selectedOutputBranch`,
          `${branch.id} cannot contribute to successful product closure.`,
        ),
      );
    }
    instanceContracts.set(step.instanceId, contract);
    instanceSteps.set(step.instanceId, step);
    instanceIndexes.set(step.instanceId, stepIndex);
    selectedBranches.set(step.instanceId, branch);
    selectedOutputs.set(step.instanceId, new Map(branch.ports.map((port) => [port.id, port])));
    dependencies.set(step.instanceId, new Set());
    if (contract.productInputs.length === 0) {
      if (!recipe.declaredRootInstanceIds.includes(step.instanceId)) {
        failures.push(
          failure(
            "undeclared-zero-input-root",
            path,
            `${step.instanceId} has no product inputs and is not an explicit root.`,
          ),
        );
      }
    } else if (recipe.declaredRootInstanceIds.includes(step.instanceId)) {
      failures.push(
        failure(
          "invalid-declared-root",
          path,
          `${step.instanceId} has product inputs and cannot be declared as a root.`,
        ),
      );
    }
  });

  for (const rootId of recipe.declaredRootInstanceIds) {
    if (!instanceSteps.has(rootId)) {
      failures.push(
        failure("unknown-declared-root", `recipes.${recipe.id}.declaredRootInstanceIds`, rootId),
      );
    }
  }

  recipe.steps.forEach((step, stepIndex) => {
    const path = `recipes.${recipe.id}.steps[${stepIndex}]`;
    const contract = instanceContracts.get(step.instanceId);
    if (!contract) return;
    const inputById = new Map(allPorts(contract.productInputs).map((port) => [port.id, port]));
    const bindingsByPort = new Map<string, ResolvedBinding[]>();
    step.productBindings.forEach((binding, bindingIndex) => {
      const bindingPath = `${path}.productBindings[${bindingIndex}]`;
      const consumer = inputById.get(binding.consumerPortId);
      if (!consumer) {
        failures.push(
          failure("unknown-consumer-port", `${bindingPath}.consumerPortId`, binding.consumerPortId),
        );
        return;
      }
      if (binding.producerInstanceId === step.instanceId) {
        failures.push(
          failure("self-cycle", `${bindingPath}.producerInstanceId`, step.instanceId),
        );
        return;
      }
      const producerOutputs = selectedOutputs.get(binding.producerInstanceId);
      if (!producerOutputs) {
        failures.push(
          failure(
            "unknown-producer-instance",
            `${bindingPath}.producerInstanceId`,
            binding.producerInstanceId,
          ),
        );
        return;
      }
      const producerIndex =
        binding.producerInstanceId === "$source"
          ? -1
          : instanceIndexes.get(binding.producerInstanceId);
      if (producerIndex !== undefined && producerIndex >= stepIndex) {
        failures.push(
          failure(
            "forward-binding",
            `${bindingPath}.producerInstanceId`,
            `${binding.producerInstanceId} is not an earlier instance.`,
          ),
        );
      }
      const producer = producerOutputs.get(binding.producerPortId);
      if (!producer) {
        failures.push(
          failure("unknown-producer-port", `${bindingPath}.producerPortId`, binding.producerPortId),
        );
        return;
      }
      validateBindingCompatibility(
        producer,
        consumer,
        binding.equalityConstraints,
        bindingPath,
        builtArtifacts,
        proposedArtifacts,
        failures,
      );
      const resolved = {
        binding,
        path: bindingPath,
        consumerInstanceId: step.instanceId,
        consumer,
        producer,
      };
      resolvedBindings.push(resolved);
      const consumerRows = bindingsByPort.get(consumer.id) ?? [];
      consumerRows.push(resolved);
      bindingsByPort.set(consumer.id, consumerRows);
      dependencies.get(step.instanceId)?.add(binding.producerInstanceId);
      const producerKey = `${binding.producerInstanceId}\u0000${binding.producerPortId}`;
      const usage = productReaders.get(producerKey) ?? { port: producer, paths: [] };
      usage.paths.push(bindingPath);
      productReaders.set(producerKey, usage);
    });
    const activePortIds = new Set(
      [...bindingsByPort.entries()]
        .filter(([, rows]) => rows.length > 0)
        .map(([portId]) => portId),
    );
    for (const group of contract.productInputs) {
      if (!groupCardinalityValid(group, activePortIds)) {
        failures.push(
          failure(
            "input-group-cardinality",
            `${path}.productBindings`,
            `Input group ${group.id} (${group.mode}) selected ${group.ports.filter((port) => activePortIds.has(port.id)).length} of ${group.ports.length} ports.`,
          ),
        );
      }
      for (const port of group.ports) {
        const rows = bindingsByPort.get(port.id) ?? [];
        const aggregate = addRanges(rows.map((row) => cardinalityRange(row.producer.cardinality)));
        if (!rangeSatisfies(aggregate, cardinalityRange(port.cardinality))) {
          failures.push(
            failure(
              "consumer-input-cardinality",
              `${path}.productBindings`,
              `${port.id} receives aggregate [${aggregate.min}, ${aggregate.max}] but requires ${port.cardinality}.`,
            ),
          );
        }
      }
    }

    if (contract.id === "candidate.native-witness-redemption") {
      const completeOutputs = selectedBranches
        .get(step.instanceId)
        ?.ports.filter(hasTreatmentContentContract) ?? [];
      if (completeOutputs.length > 0) {
        const completeInputs = allPorts(contract.productInputs).filter(
          hasTreatmentContentContract,
        );
        for (const input of completeInputs) {
          const rows = bindingsByPort.get(input.id) ?? [];
          for (const row of rows) {
            if (!equalityPreserves(row.binding.equalityConstraints, PRODUCT_TREATMENT_IDENTITY_PATHS)) {
              failures.push(
                failure(
                  "native-witness-complete-treatment-equality",
                  row.path,
                  "Native-witness redemption cannot relay complete treatment content without preserving every source, role, candidate, and treatment identity path.",
                ),
              );
            }
          }
        }
      }
    }
    if (
      contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
      contract.id === SELECTED_DECISION_MECHANISM
    ) {
      const domainRows = bindingsByPort.get("swap-legal-domain") ?? [];
      if (
        domainRows.length !== 1 ||
        !equalityPreserves(
          domainRows[0]!.binding.equalityConstraints,
          [
            "/sourceImageId",
            "/nativeRasterId",
            "/provenanceChain",
            "/candidateDomainId",
            "/paletteDomainId",
            "/candidateIds",
            "/selectionObjectiveId",
            "/candidateTreatmentRecords",
          ],
        )
      ) {
        failures.push(
          failure(
            "selected-decision-domain-continuity-binding",
            path,
            "Every decision instance must bind the exact source, candidate domain, palette domain, objective, candidate IDs, and candidate treatment records.",
          ),
        );
      }
    }
    if (
      contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
      contract.id === SELECTED_TREATMENT_ROLE_REIFICATION
    ) {
      const decisionRows = bindingsByPort.get("selected-decision") ?? [];
      const domainRows = bindingsByPort.get("swap-legal-domain") ?? [];
      if (
        decisionRows.length !== 1 ||
        !equalityPreserves(decisionRows[0]!.binding.equalityConstraints, SELECTED_MEMBER_IDENTITY_PATHS) ||
        domainRows.length !== 1 ||
        !equalityPreserves(
          domainRows[0]!.binding.equalityConstraints,
          [
            "/sourceImageId",
            "/nativeRasterId",
            "/candidateDomainId",
            "/paletteDomainId",
            "/candidateIds",
            "/selectionObjectiveId",
            "/candidateTreatmentRecords",
          ],
        )
      ) {
        failures.push(
          failure(
            "selected-treatment-reification-continuity-binding",
            path,
            "Every role-reification instance must bind the complete selected decision and its exact candidate-domain record source.",
          ),
        );
      }
    }
    if (
      contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
      contract.id === ORDINARY_EXACT_SOURCE_ADMISSION
    ) {
      const treatmentRows = bindingsByPort.get("repaired-treatment") ?? [];
      const occupancyRows = bindingsByPort.get("native-color-occupancy") ?? [];
      if (
        treatmentRows.length !== 1 ||
        !equalityPreserves(
          treatmentRows[0]!.binding.equalityConstraints,
          PRODUCT_TREATMENT_IDENTITY_PATHS,
        ) ||
        occupancyRows.length !== 1 ||
        !equalityPreserves(
          occupancyRows[0]!.binding.equalityConstraints,
          ["/nativeRasterId", "/occupiedColorIds"],
        )
      ) {
        failures.push(
          failure(
            "admission-membership-source-binding",
            path,
            "Ordinary admission must consume exact treatment identity and the exact nativeRasterId/occupiedColorIds membership domain before issuing its per-color admission certificate.",
          ),
        );
      }
    }
    if (
      contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
      contract.id === EMERGENCY_EXACT_SOURCE_ADMISSION
    ) {
      const treatmentRows = bindingsByPort.get("repaired-flat-treatment") ?? [];
      const proofRows = bindingsByPort.get("infeasibility-proof") ?? [];
      const occupancyRows = bindingsByPort.get("native-color-occupancy") ?? [];
      if (
        treatmentRows.length !== 1 ||
        !equalityPreserves(
          treatmentRows[0]!.binding.equalityConstraints,
          EMERGENCY_FLAT_WITNESS_PATHS,
        ) ||
        proofRows.length !== 1 ||
        !equalityPreserves(
          proofRows[0]!.binding.equalityConstraints,
          [
            "/candidateDomainId",
            "/paletteDomainId",
            "/selectionObjectiveId",
            "/nativeRasterId",
            "/occupiedColorIds",
            "/repairedTreatmentId",
            "/proof/evaluatedCandidateIds",
            "/proof/zeroFeasibleCount",
            "/proof/predicate",
            "/proof/certificateKind",
            "/proof/ordinaryImpossibilityCertified",
            "/proof/proofId",
          ],
        ) ||
        occupancyRows.length !== 1 ||
        !equalityPreserves(
          occupancyRows[0]!.binding.equalityConstraints,
          ["/nativeRasterId", "/occupiedColorIds"],
        )
      ) {
        failures.push(
          failure(
            "emergency-admission-membership-source-binding",
            path,
            "Emergency admission must consume the exact repaired-flat role witnesses, proof certificate, and same native occupancy before issuing an emergency-flat admission certificate.",
          ),
        );
      }
    }
    if (
      contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
      contract.id === "publication.ui-palette-v3-materializer"
    ) {
      const admittedRows = bindingsByPort.get("admitted-treatment") ?? [];
      if (
        admittedRows.length !== 1 ||
        !equalityPreserves(
          admittedRows[0]!.binding.equalityConstraints,
          ADMITTED_UNION_IDENTITY_PATHS,
        )
      ) {
        failures.push(
          failure(
            "materializer-admission-certificate-binding",
            path,
            "The materializer must consume one admitted-final value and preserve every treatment, occupancy-membership, native-pixel-witness, and admission discriminant path.",
          ),
        );
      }
    }
  });

  if (
    contracts.has(JOINT_HYPOTHESIS_CONSTRUCTION) &&
    contracts.has(EXACT_SOURCE_INFEASIBILITY_PROOF)
  ) {
    const stepIndexByMechanism = new Map(
      recipe.steps.map((step, index) => [step.mechanismId, index]),
    );
    const ordinaryStages = [
      "candidate.native-witness-redemption",
      "evidence.native-color-occupancy-measurement",
      "publication.exact-native-pixel-admission",
      JOINT_HYPOTHESIS_CONSTRUCTION,
      FINITE_FACTOR_CONSTRUCTION,
      SWAPPED_CANDIDATE_DOMAIN_INSERTION,
      SELECTED_DECISION_MECHANISM,
      SELECTED_TREATMENT_ROLE_REIFICATION,
      REPAIR_WINNER_INPUT_CONSTRUCTION,
      REPAIR_MECHANISM,
      REPAIR_RESULT_ROLE_REIFICATION,
    ];
    let previousIndex = -1;
    for (const mechanismId of ordinaryStages) {
      const index = stepIndexByMechanism.get(mechanismId);
      if (index === undefined || index <= previousIndex) {
        failures.push(
          failure(
            "ordinary-treatment-stage-order",
            `recipes.${recipe.id}.steps`,
            `${mechanismId} must occur after the preceding progressive treatment stage.`,
          ),
        );
      } else {
        previousIndex = index;
      }
    }

    const instanceMechanism = (instanceId: string): string | undefined =>
      instanceSteps.get(instanceId)?.mechanismId;
    const directBinding = (
      consumerMechanismId: string,
      producerMechanismId: string,
      artifactTypeId: string,
    ): boolean => recipe.steps.some(
      (consumerStep) =>
        consumerStep.mechanismId === consumerMechanismId &&
        consumerStep.productBindings.some(
          (binding) =>
            instanceMechanism(binding.producerInstanceId) === producerMechanismId &&
            selectedOutputs
              .get(binding.producerInstanceId)
              ?.get(binding.producerPortId)?.artifactTypeId === artifactTypeId,
        ),
    );
    const requiredLinks = [
      [FINITE_FACTOR_CONSTRUCTION, JOINT_HYPOTHESIS_CONSTRUCTION, JOINT_HYPOTHESES],
      [SWAPPED_CANDIDATE_DOMAIN_INSERTION, FINITE_FACTOR_CONSTRUCTION, FINITE_FACTORS],
      [SELECTED_DECISION_MECHANISM, SWAPPED_CANDIDATE_DOMAIN_INSERTION, SWAP_LEGAL_DOMAIN],
      [SELECTED_TREATMENT_ROLE_REIFICATION, SELECTED_DECISION_MECHANISM, SELECTED_DECISION],
      [SELECTED_TREATMENT_ROLE_REIFICATION, SWAPPED_CANDIDATE_DOMAIN_INSERTION, SWAP_LEGAL_DOMAIN],
      [REPAIR_WINNER_INPUT_CONSTRUCTION, SELECTED_TREATMENT_ROLE_REIFICATION, SELECTED_TREATMENT],
      [REPAIR_WINNER_INPUT_CONSTRUCTION, "evidence.native-color-occupancy-measurement", NATIVE_OCCUPANCY],
      [REPAIR_MECHANISM, REPAIR_WINNER_INPUT_CONSTRUCTION, REPAIR_WINNER_INPUT],
      [REPAIR_RESULT_ROLE_REIFICATION, REPAIR_MECHANISM, REPAIR_RESULT],
    ] as const;
    for (const [consumerId, producerId, artifactTypeId] of requiredLinks) {
      if (!directBinding(consumerId, producerId, artifactTypeId)) {
        failures.push(
          failure(
            "ordinary-treatment-stage-binding",
            `recipes.${recipe.id}.steps`,
            `${consumerId} must consume ${artifactTypeId} directly from ${producerId}.`,
          ),
        );
      }
    }

    const emergency = stepIndexByMechanism.has(EMERGENCY_EXACT_SOURCE_ADMISSION);
    if (emergency) {
      const emergencyStages = [
        EXACT_SOURCE_INFEASIBILITY_PROOF,
        EMERGENCY_EXACT_SOURCE_ADMISSION,
      ];
      let emergencyIndex = previousIndex;
      for (const mechanismId of emergencyStages) {
        const index = stepIndexByMechanism.get(mechanismId);
        if (index === undefined || index <= emergencyIndex) {
          failures.push(
            failure(
              "emergency-treatment-stage-order",
              `recipes.${recipe.id}.steps`,
              `${mechanismId} must occur after repaired treatment construction.`,
            ),
          );
        } else {
          emergencyIndex = index;
        }
      }
      const emergencyLinks = [
        [EXACT_SOURCE_INFEASIBILITY_PROOF, SWAPPED_CANDIDATE_DOMAIN_INSERTION, SWAP_LEGAL_DOMAIN],
        [EXACT_SOURCE_INFEASIBILITY_PROOF, "evidence.native-color-occupancy-measurement", NATIVE_OCCUPANCY],
        [EXACT_SOURCE_INFEASIBILITY_PROOF, REPAIR_RESULT_ROLE_REIFICATION, REPAIRED_TREATMENT],
        [EMERGENCY_EXACT_SOURCE_ADMISSION, EXACT_SOURCE_INFEASIBILITY_PROOF, INFEASIBILITY_PROOF],
        [EMERGENCY_EXACT_SOURCE_ADMISSION, REPAIR_RESULT_ROLE_REIFICATION, REPAIRED_TREATMENT],
        [EMERGENCY_EXACT_SOURCE_ADMISSION, "evidence.native-color-occupancy-measurement", NATIVE_OCCUPANCY],
      ] as const;
      for (const [consumerId, producerId, artifactTypeId] of emergencyLinks) {
        if (!directBinding(consumerId, producerId, artifactTypeId)) {
          failures.push(
            failure(
              "emergency-typed-evidence-binding",
              `recipes.${recipe.id}.steps`,
              `${consumerId} must consume ${artifactTypeId} directly from ${producerId}.`,
            ),
          );
        }
      }
      if (stepIndexByMechanism.has(ORDINARY_EXACT_SOURCE_ADMISSION)) {
        failures.push(
          failure(
            "mixed-ordinary-emergency-admission",
            `recipes.${recipe.id}.steps`,
            "An emergency witness cannot also use ordinary exact-source admission.",
          ),
        );
      }
    } else {
      if (
        !directBinding(
          ORDINARY_EXACT_SOURCE_ADMISSION,
          REPAIR_RESULT_ROLE_REIFICATION,
          REPAIRED_TREATMENT,
        )
      ) {
        failures.push(
          failure(
            "ordinary-exact-source-admission-binding",
            `recipes.${recipe.id}.steps`,
            "Ordinary exact-source admission must consume the reified repair result.",
          ),
        );
      }
    }
  }

  const allGoalOutputs = recipe.steps.flatMap((step) => {
    const branch = selectedBranches.get(step.instanceId);
    if (!branch) return [];
    return branch.ports
      .filter((port) => port.artifactTypeId === manifest.goalArtifactTypeId)
      .map((port) => ({ step, branch, port }));
  });
  let exactGoal:
    | { step: (typeof recipe.steps)[number]; branch: BranchOutputBranch; port: BranchPort }
    | undefined;
  if (allGoalOutputs.length !== 1) {
    failures.push(
      failure(
        "goal-output-cardinality",
        `recipes.${recipe.id}.goalBinding`,
        `Expected exactly one selected goal output port; found ${allGoalOutputs.length}.`,
      ),
    );
  } else {
    const goal = allGoalOutputs[0]!;
    exactGoal = goal;
    if (goal.branch.id !== "success") {
      failures.push(
        failure(
          "goal-on-nonsuccess-branch",
          `recipes.${recipe.id}.goalBinding`,
          goal.branch.id,
        ),
      );
    }
    if (goal.port.cardinality !== "exactly-one") {
      failures.push(
        failure(
          "goal-port-cardinality",
          `recipes.${recipe.id}.goalBinding`,
          goal.port.cardinality,
        ),
      );
    }
    if (
      recipe.goalBinding.producerInstanceId !== goal.step.instanceId ||
      recipe.goalBinding.producerPortId !== goal.port.id
    ) {
      failures.push(
        failure(
          "goal-binding-mismatch",
          `recipes.${recipe.id}.goalBinding`,
          "Goal binding does not identify the sole selected goal producer port.",
        ),
      );
    }
    const goalUsageKey = `${goal.step.instanceId}\u0000${goal.port.id}`;
    const usage = productReaders.get(goalUsageKey) ?? { port: goal.port, paths: [] };
    usage.paths.push(`recipes.${recipe.id}.goalBinding`);
    productReaders.set(goalUsageKey, usage);
    if (
      resolvedBindings.some(
        ({ binding }) =>
          binding.producerInstanceId === goal.step.instanceId &&
          binding.producerPortId === goal.port.id,
      )
    ) {
      failures.push(
        failure(
          "product-after-goal",
          `recipes.${recipe.id}`,
          "The exact goal output may feed only declared post-goal sidecars.",
        ),
      );
    }
  }

  for (const [instanceId, outputs] of selectedOutputs) {
    for (const output of outputs.values()) {
      if (output.artifactTypeId !== "artifact.measurement.native-color-occupancy.v1") continue;
      const usage = productReaders.get(`${instanceId}\u0000${output.id}`);
      if (!usage || usage.paths.length === 0) {
        failures.push(
          failure(
            "unconsumed-native-occupancy",
            `recipes.${recipe.id}.steps`,
            `${instanceId}:${output.id} emits native occupancy without a product consumer.`,
          ),
        );
      }
    }
  }

  validateRecipeCycles(recipe.id, dependencies, failures);
  const contributing = new Set<string>();
  const visitContribution = (instanceId: string): void => {
    if (contributing.has(instanceId)) return;
    contributing.add(instanceId);
    for (const dependency of dependencies.get(instanceId) ?? []) visitContribution(dependency);
  };
  if (exactGoal) visitContribution(exactGoal.step.instanceId);
  const sourceReached = contributing.has("$source");
  if (!sourceReached) {
    failures.push(
      failure(
        "source-not-in-goal-ancestry",
        `recipes.${recipe.id}`,
        manifest.sourceArtifactTypeId,
      ),
    );
  }
  for (const step of recipe.steps) {
    if (!contributing.has(step.instanceId)) {
      failures.push(
        failure(
          "disconnected-product-step",
          `recipes.${recipe.id}.steps`,
          `${step.instanceId} is outside the goal ancestry.`,
        ),
      );
    }
  }

  const witnessedMechanismIds = new Set<string>();
  const typedStepSignatures: string[] = [];
  const consumedProductOutputs: RecipeAnalysis["consumedProductOutputs"] = [];
  for (const step of recipe.steps) {
    if (!contributing.has(step.instanceId)) continue;
    const contract = instanceContracts.get(step.instanceId);
    const branch = selectedBranches.get(step.instanceId);
    if (!contract || !branch) continue;
    const inputBindings = resolvedBindings.filter(
      (resolved) => resolved.consumerInstanceId === step.instanceId,
    );
    const consumedOutputs = branch.ports.filter((output) =>
      (productReaders.get(`${step.instanceId}\u0000${output.id}`)?.paths.length ?? 0) > 0,
    );
    for (const output of consumedOutputs) {
      consumedProductOutputs.push({
        instanceId: step.instanceId,
        portId: output.id,
        artifactTypeId: output.artifactTypeId,
      });
    }
    if (contract.productInputs.length === 0 || inputBindings.length === 0 || consumedOutputs.length === 0) {
      failures.push(
        failure(
          "contributor-only-mechanism-step",
          `recipes.${recipe.id}.steps.${step.instanceId}`,
          `${step.mechanismId} is in goal ancestry but lacks ${contract.productInputs.length === 0 || inputBindings.length === 0 ? "a consumed declared typed input" : "a consumed declared typed output"}.`,
        ),
      );
      continue;
    }
    witnessedMechanismIds.add(step.mechanismId);
    typedStepSignatures.push(
      serializeCanonical({
        selectedOutputBranch: step.selectedOutputBranch,
        inputEdges: inputBindings
          .map((resolved) => ({
            producerArtifactTypeId: resolved.producer.artifactTypeId,
            consumerArtifactTypeId: resolved.consumer.artifactTypeId,
            producerCardinality: resolved.producer.cardinality,
            consumerCardinality: resolved.consumer.cardinality,
            equalityPaths: resolved.binding.equalityConstraints
              .map((constraint) => [
                constraint.producerValuePath,
                constraint.consumerValuePath,
              ])
              .sort((left, right) => compareCodeUnits(left.join("\u0000"), right.join("\u0000"))),
          }))
          .sort((left, right) => compareCodeUnits(serializeCanonical(left), serializeCanonical(right))),
        consumedOutputs: consumedOutputs
          .map((output) => ({
            artifactTypeId: output.artifactTypeId,
            cardinality: output.cardinality,
            constraints: output.constraints,
          }))
          .sort((left, right) => compareCodeUnits(serializeCanonical(left), serializeCanonical(right))),
      }),
    );
  }
  typedStepSignatures.sort(compareCodeUnits);
  consumedProductOutputs.sort((left, right) =>
    compareCodeUnits(
      `${left.instanceId}\u0000${left.portId}`,
      `${right.instanceId}\u0000${right.portId}`,
    ),
  );

  const sidecarInstanceIds = new Set<string>();
  for (const [sidecarIndex, sidecar] of recipe.postGoalSidecars.entries()) {
    const path = `recipes.${recipe.id}.postGoalSidecars[${sidecarIndex}]`;
    if (
      sidecarInstanceIds.has(sidecar.instanceId) ||
      instanceSteps.has(sidecar.instanceId) ||
      sidecar.instanceId === "$source"
    ) {
      failures.push(failure("duplicate-sidecar-instance", `${path}.instanceId`, sidecar.instanceId));
      continue;
    }
    sidecarInstanceIds.add(sidecar.instanceId);
    if (declaredDisposition.get(sidecar.mechanismId) !== "sidecar") {
      failures.push(
        failure(
          "post-goal-mechanism-not-sidecar",
          `${path}.mechanismId`,
          sidecar.mechanismId,
        ),
      );
      continue;
    }
    const contract = allCurrentContracts.get(sidecar.mechanismId);
    const consumer = contract
      ? allPorts(contract.productInputs).find((port) => port.id === sidecar.consumerPortId)
      : undefined;
    if (!contract) {
      failures.push(failure("unknown-post-goal-sidecar", `${path}.mechanismId`, sidecar.mechanismId));
      continue;
    }
    if (!consumer) {
      failures.push(
        failure("unknown-sidecar-consumer-port", `${path}.consumerPortId`, sidecar.consumerPortId),
      );
      continue;
    }
    if (
      !exactGoal ||
      sidecar.producerInstanceId !== recipe.goalBinding.producerInstanceId ||
      sidecar.producerPortId !== recipe.goalBinding.producerPortId
    ) {
      failures.push(
        failure(
          "post-goal-sidecar-direction",
          path,
          "Post-goal sidecar must consume the exact declared goal producer port.",
        ),
      );
      continue;
    }
    if (
      exactGoal.port.artifactTypeId !== consumer.artifactTypeId ||
      !cardinalityCompatible(exactGoal.port.cardinality, consumer.cardinality)
    ) {
      failures.push(
        failure(
          "post-goal-sidecar-contract",
          path,
          `${exactGoal.port.artifactTypeId}/${exactGoal.port.cardinality} does not satisfy ${consumer.artifactTypeId}/${consumer.cardinality}.`,
        ),
      );
    }
    validateBindingCompatibility(
      exactGoal.port,
      consumer,
      sidecar.equalityConstraints,
      path,
      builtArtifacts,
      proposedArtifacts,
      failures,
    );
  }

  const contributingSteps = recipe.steps.filter((step) => contributing.has(step.instanceId));
  const contributingContracts = contributingSteps
    .map((step) => instanceContracts.get(step.instanceId))
    .filter((contract): contract is PlannedContract => Boolean(contract));
  const missingFixedConfigs: string[] = [];
  const missingNonProductInputs: string[] = [];
  for (const step of contributingSteps) {
    const contract = instanceContracts.get(step.instanceId);
    const stepIndex = instanceIndexes.get(step.instanceId) ?? 0;
    if (!contract) continue;
    const requiredConfigs = new Set(contract.fixedConfigRefs);
    for (const reference of step.readinessBindings.fixedConfigRefs) {
      const config = fixedConfigurations.get(reference);
      if (!requiredConfigs.has(reference)) {
        readinessFailures.push(
          failure(
            "unexpected-fixed-config",
            `recipes.${recipe.id}.steps[${stepIndex}].readinessBindings.fixedConfigRefs`,
            reference,
          ),
        );
      } else if (!config?.available) {
        readinessFailures.push(
          failure(
            config ? "unavailable-fixed-config" : "unknown-fixed-config",
            `recipes.${recipe.id}.steps[${stepIndex}].readinessBindings.fixedConfigRefs`,
            reference,
          ),
        );
        missingFixedConfigs.push(`${step.instanceId}:${reference}`);
      }
    }
    for (const reference of requiredConfigs) {
      if (!step.readinessBindings.fixedConfigRefs.includes(reference)) {
        missingFixedConfigs.push(`${step.instanceId}:${reference}`);
      }
    }

    const requiredInputs = new Map(
      contract.requiredNonProductInputs.map((port) => [port.id, port]),
    );
    const validReadinessByInput = new Map<string, Array<{ producer: BranchPort; path: string }>>();
    const unavailableReadinessInputs = new Set<string>();
    step.readinessBindings.nonProductInputs.forEach((binding, bindingIndex) => {
      const path = `recipes.${recipe.id}.steps[${stepIndex}].readinessBindings.nonProductInputs[${bindingIndex}]`;
      const consumer = requiredInputs.get(binding.consumerInputId);
      if (!consumer) {
        readinessFailures.push(
          failure("unknown-readiness-consumer", `${path}.consumerInputId`, binding.consumerInputId),
        );
        return;
      }
      let producer: BranchPort | undefined;
      let available = false;
      if (binding.producerKind === "external-provider") {
        const provider = readinessProviders.get(binding.producerId);
        if (!provider) {
          readinessFailures.push(
            failure("unknown-readiness-provider", `${path}.producerId`, binding.producerId),
          );
          return;
        }
        producer = provider.outputPorts.find((port) => port.id === binding.producerPortId);
        available = provider.available;
        if (!producer) {
          readinessFailures.push(
            failure("unknown-readiness-producer-port", `${path}.producerPortId`, binding.producerPortId),
          );
          return;
        }
      } else {
        const producerIndex = instanceIndexes.get(binding.producerId);
        if (producerIndex === undefined) {
          readinessFailures.push(
            failure("unknown-readiness-instance", `${path}.producerId`, binding.producerId),
          );
          return;
        }
        if (producerIndex >= stepIndex) {
          readinessFailures.push(
            failure("readiness-forward-binding", `${path}.producerId`, binding.producerId),
          );
        }
        producer = selectedOutputs.get(binding.producerId)?.get(binding.producerPortId);
        available = instanceContracts.get(binding.producerId)?.implementationAvailable ?? false;
        if (!producer) {
          readinessFailures.push(
            failure("unknown-readiness-producer-port", `${path}.producerPortId`, binding.producerPortId),
          );
          return;
        }
      }
      validateBindingCompatibility(
        producer,
        consumer,
        binding.equalityConstraints,
        path,
        builtArtifacts,
        proposedArtifacts,
        readinessFailures,
      );
      if (!available) {
        // A registered typed provider can be intentionally planned-unavailable;
        // report that state without misclassifying its absent allocation as a bad binding.
        unavailableReadinessInputs.add(consumer.id);
        readinessFailures.push(
          failure("unavailable-readiness-producer", path, binding.producerId),
        );
        return;
      }
      const rows = validReadinessByInput.get(consumer.id) ?? [];
      rows.push({ producer, path });
      validReadinessByInput.set(consumer.id, rows);
    });
    for (const input of requiredInputs.values()) {
      if (unavailableReadinessInputs.has(input.id)) continue;
      const rows = validReadinessByInput.get(input.id) ?? [];
      const aggregate = addRanges(rows.map((row) => cardinalityRange(row.producer.cardinality)));
      if (!rangeSatisfies(aggregate, cardinalityRange(input.cardinality))) {
        missingNonProductInputs.push(`${step.instanceId}:${input.id}:${input.artifactTypeId}`);
        readinessFailures.push(
          failure(
            "readiness-input-cardinality",
            `recipes.${recipe.id}.steps[${stepIndex}].readinessBindings.nonProductInputs`,
            `${input.id} receives aggregate [${aggregate.min}, ${aggregate.max}] but requires ${input.cardinality}.`,
          ),
        );
      }
    }
  }

  const unavailableMechanisms = contributingContracts
    .filter((contract) => !contract.implementationAvailable)
    .map((contract) => contract.id);
  const unavailableFixtures = contributingContracts
    .filter((contract) => !contract.fixtureAvailable)
    .map((contract) => sidecars(manifest, contract.id).fixtureId);
  const unavailableVisualizations = contributingContracts
    .filter((contract) => !contract.visualizationAvailable)
    .map((contract) => sidecars(manifest, contract.id).visualizationId);
  const unavailableHumanScores = contributingContracts
    .filter((contract) => !contract.humanScoreAvailable)
    .map((contract) => sidecars(manifest, contract.id).humanScoreId);
  const goalReached =
    exactGoal !== undefined &&
    exactGoal.branch.id === "success" &&
    exactGoal.port.cardinality === "exactly-one" &&
    recipe.goalBinding.producerInstanceId === exactGoal.step.instanceId &&
    recipe.goalBinding.producerPortId === exactGoal.port.id;
  const successful = failures.length === 0 && sourceReached && goalReached;
  const ready =
    successful &&
    readinessFailures.length === 0 &&
    missingFixedConfigs.length === 0 &&
    missingNonProductInputs.length === 0 &&
    unavailableMechanisms.length === 0 &&
    unavailableFixtures.length === 0 &&
    unavailableVisualizations.length === 0 &&
    unavailableHumanScores.length === 0;
  const contributingInstanceIds = [...contributing]
    .filter((instanceId) => instanceId !== "$source")
    .sort(compareCodeUnits);
  const contributingMechanismIds = [
    ...new Set(
      contributingSteps.map((step) => step.mechanismId),
    ),
  ].sort(compareCodeUnits);
  return {
    recipeId: recipe.id,
    family: recipe.family,
    successful,
    sourceReached,
    goalReached,
    contributingInstanceIds,
    contributingMechanismIds,
    witnessedMechanismIds: [...witnessedMechanismIds].sort(compareCodeUnits),
    essentialMechanismIds: [],
    typedStepSignatures,
    consumedProductOutputs,
    expandedSteps: structuredClone(recipe.steps),
    failures,
    executionReadiness: {
      ready,
      failures: readinessFailures,
      missingFixedConfigs: [...new Set(missingFixedConfigs)].sort(compareCodeUnits),
      missingNonProductInputs: [...new Set(missingNonProductInputs)].sort(compareCodeUnits),
      unavailableMechanisms: [...new Set(unavailableMechanisms)].sort(compareCodeUnits),
      unavailableFixtures: [...new Set(unavailableFixtures)].sort(compareCodeUnits),
      unavailableVisualizations: [...new Set(unavailableVisualizations)].sort(compareCodeUnits),
      unavailableHumanScores: [...new Set(unavailableHumanScores)].sort(compareCodeUnits),
    },
  };
}

function recipeWithoutMechanism(
  recipe: BranchRecipe,
  mechanismId: string,
): BranchRecipe {
  const removedInstanceIds = new Set(
    recipe.steps
      .filter((step) => step.mechanismId === mechanismId)
      .map((step) => step.instanceId),
  );
  const remainingSteps = recipe.steps
    .filter((step) => !removedInstanceIds.has(step.instanceId))
    .map((step) => ({
      ...structuredClone(step),
      productBindings: step.productBindings.filter(
        (binding) => !removedInstanceIds.has(binding.producerInstanceId),
      ),
      readinessBindings: {
        ...structuredClone(step.readinessBindings),
        nonProductInputs: step.readinessBindings.nonProductInputs.filter(
          (binding) =>
            binding.producerKind !== "recipe-instance" ||
            !removedInstanceIds.has(binding.producerId),
        ),
      },
    }));
  const stepByInstance = new Map(remainingSteps.map((step) => [step.instanceId, step]));
  const goalAncestors = new Set<string>();
  const visit = (instanceId: string): void => {
    if (instanceId === "$source" || goalAncestors.has(instanceId)) return;
    const step = stepByInstance.get(instanceId);
    if (!step) return;
    goalAncestors.add(instanceId);
    step.productBindings.forEach((binding) => visit(binding.producerInstanceId));
  };
  visit(recipe.goalBinding.producerInstanceId);

  return {
    ...structuredClone(recipe),
    declaredRootInstanceIds: recipe.declaredRootInstanceIds.filter((instanceId) =>
      goalAncestors.has(instanceId),
    ),
    steps: remainingSteps.filter((step) => goalAncestors.has(step.instanceId)),
    postGoalSidecars: recipe.postGoalSidecars.filter(
      (sidecar) =>
        goalAncestors.has(sidecar.producerInstanceId) &&
        !removedInstanceIds.has(sidecar.instanceId),
    ),
  };
}

function recipeProductClosureHolds(
  manifest: BranchPlanManifest,
  recipe: BranchRecipe,
  contracts: ReadonlyMap<string, PlannedContract>,
): boolean {
  const sourcePort: BranchPort = {
    id: "encoded-artwork",
    artifactTypeId: manifest.sourceArtifactTypeId,
    cardinality: "exactly-one",
    constraints: [],
    identityPaths: [],
  };
  const selectedOutputs = new Map<string, ReadonlyMap<string, BranchPort>>([
    ["$source", new Map([[sourcePort.id, sourcePort]])],
  ]);
  const stepIndexByInstance = new Map(
    recipe.steps.map((step, index) => [step.instanceId, index]),
  );
  const dependencies = new Map<string, Set<string>>();
  const selectedGoalOutputs: Array<{ instanceId: string; port: BranchPort }> = [];

  for (const [stepIndex, step] of recipe.steps.entries()) {
    const contract = contracts.get(step.mechanismId);
    const branch = contract ? outputBranch(contract, step.selectedOutputBranch) : undefined;
    if (!contract || !branch || branch.id !== "success") return false;
    const outputs = new Map(branch.ports.map((port) => [port.id, port]));
    selectedOutputs.set(step.instanceId, outputs);
    dependencies.set(step.instanceId, new Set());
    for (const port of branch.ports) {
      if (port.artifactTypeId === manifest.goalArtifactTypeId) {
        selectedGoalOutputs.push({ instanceId: step.instanceId, port });
      }
    }
    const inputById = new Map(allPorts(contract.productInputs).map((port) => [port.id, port]));
    const bindingsByPort = new Map<string, BranchPort[]>();
    for (const binding of step.productBindings) {
      const consumer = inputById.get(binding.consumerPortId);
      const producer = selectedOutputs
        .get(binding.producerInstanceId)
        ?.get(binding.producerPortId);
      const producerIndex = binding.producerInstanceId === "$source"
        ? -1
        : stepIndexByInstance.get(binding.producerInstanceId);
      if (
        !consumer ||
        !producer ||
        producerIndex === undefined ||
        producerIndex >= stepIndex ||
        producer.artifactTypeId !== consumer.artifactTypeId
      ) {
        return false;
      }
      const producers = bindingsByPort.get(consumer.id) ?? [];
      producers.push(producer);
      bindingsByPort.set(consumer.id, producers);
      dependencies.get(step.instanceId)!.add(binding.producerInstanceId);
    }
    const activePortIds = new Set(bindingsByPort.keys());
    for (const group of contract.productInputs) {
      if (!groupCardinalityValid(group, activePortIds)) return false;
      for (const port of group.ports) {
        const aggregate = addRanges(
          (bindingsByPort.get(port.id) ?? []).map((producer) =>
            cardinalityRange(producer.cardinality),
          ),
        );
        if (!rangeSatisfies(aggregate, cardinalityRange(port.cardinality))) return false;
      }
    }
  }

  if (selectedGoalOutputs.length !== 1) return false;
  const goal = selectedGoalOutputs[0]!;
  if (
    goal.port.cardinality !== "exactly-one" ||
    recipe.goalBinding.producerInstanceId !== goal.instanceId ||
    recipe.goalBinding.producerPortId !== goal.port.id
  ) {
    return false;
  }
  const ancestors = new Set<string>();
  const visit = (instanceId: string): void => {
    if (ancestors.has(instanceId)) return;
    ancestors.add(instanceId);
    for (const dependency of dependencies.get(instanceId) ?? []) visit(dependency);
  };
  visit(goal.instanceId);
  return ancestors.has("$source") && recipe.steps.every((step) => ancestors.has(step.instanceId));
}

function normalizedRecipeWithExclusions(
  recipe: BranchRecipe,
  excluded: ReadonlySet<string>,
): string {
  const retainedSteps = recipe.steps.filter((step) => !excluded.has(step.instanceId));
  const occurrenceByMechanism = new Map<string, number>();
  const instanceLabel = new Map<string, string>();
  for (const step of retainedSteps) {
    const occurrence = occurrenceByMechanism.get(step.mechanismId) ?? 0;
    occurrenceByMechanism.set(step.mechanismId, occurrence + 1);
    instanceLabel.set(step.instanceId, `${step.mechanismId}#${occurrence}`);
  }
  return serializeCanonical({
    steps: retainedSteps.map((step) => ({
      instance: instanceLabel.get(step.instanceId),
      mechanismId: step.mechanismId,
      selectedOutputBranch: step.selectedOutputBranch,
      productBindings: step.productBindings
        .filter(
          (binding) =>
            binding.producerInstanceId === "$source" ||
            instanceLabel.has(binding.producerInstanceId),
        )
        .map((binding) => ({
          consumerPortId: binding.consumerPortId,
          producerInstance:
            binding.producerInstanceId === "$source"
              ? "$source"
              : instanceLabel.get(binding.producerInstanceId),
          producerPortId: binding.producerPortId,
          equalityConstraints: binding.equalityConstraints,
        }))
        .sort((left, right) => compareCodeUnits(serializeCanonical(left), serializeCanonical(right))),
    })),
    goalBinding: {
      producerInstance: instanceLabel.get(recipe.goalBinding.producerInstanceId),
      producerPortId: recipe.goalBinding.producerPortId,
    },
  });
}

function normalizedRecipeSurroundingPair(
  leftRecipe: BranchRecipe,
  rightRecipe: BranchRecipe,
  slotMechanismIds: ReadonlySet<string>,
): string | undefined {
  const counts = (recipe: BranchRecipe): Map<string, number> => {
    const result = new Map<string, number>();
    for (const step of recipe.steps) {
      result.set(step.mechanismId, (result.get(step.mechanismId) ?? 0) + 1);
    }
    return result;
  };
  const leftCounts = counts(leftRecipe);
  const rightCounts = counts(rightRecipe);
  const commonCounts = new Map<string, number>();
  for (const mechanismId of new Set([...leftCounts.keys(), ...rightCounts.keys()])) {
    commonCounts.set(
      mechanismId,
      Math.min(leftCounts.get(mechanismId) ?? 0, rightCounts.get(mechanismId) ?? 0),
    );
  }
  const deriveExclusions = (recipe: BranchRecipe): Set<string> => {
    const excluded = new Set<string>();
    const unique = new Set<string>();
    const occurrenceByMechanism = new Map<string, number>();
    for (const step of recipe.steps) {
      const occurrence = occurrenceByMechanism.get(step.mechanismId) ?? 0;
      occurrenceByMechanism.set(step.mechanismId, occurrence + 1);
      if (slotMechanismIds.has(step.mechanismId)) {
        excluded.add(step.instanceId);
      } else if (occurrence >= (commonCounts.get(step.mechanismId) ?? 0)) {
        unique.add(step.instanceId);
      }
    }
    const consumers = new Map<string, Set<string>>();
    for (const step of recipe.steps) {
      for (const binding of step.productBindings) {
        if (binding.producerInstanceId === "$source") continue;
        const rows = consumers.get(binding.producerInstanceId) ?? new Set<string>();
        rows.add(step.instanceId);
        consumers.set(binding.producerInstanceId, rows);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const step of recipe.steps) {
        if (excluded.has(step.instanceId) || !unique.has(step.instanceId)) continue;
        const readers = consumers.get(step.instanceId) ?? new Set<string>();
        const isExclusiveProvider =
          readers.size > 0 && [...readers].every((instanceId) => excluded.has(instanceId));
        const isExclusiveConsumer =
          step.productBindings.length > 0 &&
          step.productBindings.every(
            (binding) =>
              binding.producerInstanceId !== "$source" &&
              excluded.has(binding.producerInstanceId),
          );
        if (isExclusiveProvider || isExclusiveConsumer) {
          excluded.add(step.instanceId);
          changed = true;
        }
      }
    }
    return excluded;
  };
  const leftNormalized = normalizedRecipeWithExclusions(
    leftRecipe,
    deriveExclusions(leftRecipe),
  );
  const rightNormalized = normalizedRecipeWithExclusions(
    rightRecipe,
    deriveExclusions(rightRecipe),
  );
  return leftNormalized === rightNormalized ? sha256(leftNormalized) : undefined;
}

function deriveBuiltSourceReachable(graph: CapabilityGraph): number {
  const primary = graph.mechanisms.filter(
    (mechanism) =>
      mechanism.focusClass === "product-transformation" ||
      mechanism.focusClass === "product-admission",
  );
  const artifacts = new Set(
    graph.artifactTypes
      .filter(
        (artifact) =>
          artifact.category === "encoded-source" &&
          artifact.plane === "runtime" &&
          artifact.productFocus === "product-flow" &&
          artifact.boundaryClassification === "expected-external",
      )
      .map((artifact) => artifact.id),
  );
  const reached = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const mechanism of primary) {
      if (reached.has(mechanism.id)) continue;
      const required = mechanism.inputPorts.filter(
        (port) => port.requirement === "required" && port.inputClass === "natural",
      );
      const alternativesReady = mechanism.alternativeGroups.every((group) =>
        mechanism.inputPorts.some(
          (port) =>
            port.alternativeGroupId === group.id &&
            port.inputClass === "natural" &&
            artifacts.has(port.artifactTypeId),
        ),
      );
      if (!required.every((port) => artifacts.has(port.artifactTypeId)) || !alternativesReady) {
        continue;
      }
      reached.add(mechanism.id);
      mechanism.outputPorts.forEach((port) => artifacts.add(port.artifactTypeId));
      changed = true;
    }
  }
  return reached.size;
}

function deriveBuiltGoalReachable(
  graph: CapabilityGraph,
  goalArtifactTypeId: string,
): number {
  const primary = graph.mechanisms.filter(
    (mechanism) =>
      mechanism.focusClass === "product-transformation" ||
      mechanism.focusClass === "product-admission",
  );
  const artifacts = new Set([goalArtifactTypeId]);
  const reached = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const mechanism of primary) {
      if (
        reached.has(mechanism.id) ||
        !mechanism.outputPorts.some((port) => artifacts.has(port.artifactTypeId))
      ) {
        continue;
      }
      reached.add(mechanism.id);
      mechanism.inputPorts
        .filter((port) => port.inputClass === "natural")
        .forEach((port) => artifacts.add(port.artifactTypeId));
      changed = true;
    }
  }
  return reached.size;
}

function formatHardFailures(failures: readonly BranchFailure[]): never {
  throw new Error(
    `Branch plan semantic validation failed:\n${failures
      .map((row) => `  ${row.code}\t${row.path}\t${row.message}`)
      .join("\n")}`,
  );
}

export function validateAndAnalyzeBranchPlan(
  rawManifest: BranchPlanManifest,
  graph: CapabilityGraph,
  capabilityGraphSerialization = serializeCanonical(graph),
): BranchAnalysis {
  const canonicalCapabilityGraph = serializeCanonical(graph);
  if (capabilityGraphSerialization !== canonicalCapabilityGraph) {
    throw new Error(
      "Capability graph serialization must be canonical JSON with sorted keys, two-space indentation, UTF-8 encoding, and one trailing newline.",
    );
  }
  const manifest = expandRecipeModules(rawManifest);
  const hardFailures: BranchFailure[] = [];
  const currentById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const currentDispositionById = new Map(
    manifest.currentMechanisms.map((entry) => [entry.mechanismId, entry]),
  );
  const workbenchLayerVocabulary = new Set<string>(WORKBENCH_LAYERS);
  const workbenchLayerAssignmentCounts = new Map<string, number>();
  const registerWorkbenchLayer = (
    mechanismId: string,
    workbenchLayer: WorkbenchLayer | undefined,
    path: string,
  ): void => {
    workbenchLayerAssignmentCounts.set(
      mechanismId,
      (workbenchLayerAssignmentCounts.get(mechanismId) ?? 0) + 1,
    );
    if (!workbenchLayer) {
      hardFailures.push(
        failure(
          "missing-workbench-layer-assignment",
          path,
          `${mechanismId} requires one explicit workbenchLayer.`,
        ),
      );
    } else if (!workbenchLayerVocabulary.has(workbenchLayer)) {
      hardFailures.push(
        failure(
          "unknown-workbench-layer-assignment",
          path,
          `${mechanismId} declares unknown workbenchLayer ${workbenchLayer}.`,
        ),
      );
    }
  };
  for (const entry of manifest.currentMechanisms) {
    if (entry.disposition === "retained") {
      registerWorkbenchLayer(
        entry.mechanismId,
        entry.workbenchLayer,
        `currentMechanisms.${entry.mechanismId}.workbenchLayer`,
      );
    } else if (entry.workbenchLayer !== undefined) {
      hardFailures.push(
        failure(
          "inactive-workbench-layer-assignment",
          `currentMechanisms.${entry.mechanismId}.workbenchLayer`,
          "Only retained current mechanisms may have a workbench layer.",
        ),
      );
    }
  }
  for (const mechanism of manifest.proposedMechanisms) {
    registerWorkbenchLayer(
      mechanism.id,
      mechanism.workbenchLayer,
      `proposedMechanisms.${mechanism.id}.workbenchLayer`,
    );
  }
  for (const [mechanismId, count] of workbenchLayerAssignmentCounts) {
    if (count > 1) {
      hardFailures.push(
        failure(
          "duplicate-workbench-layer-assignment",
          `workbenchLayers.${mechanismId}`,
          `${mechanismId} has ${count} workbench layer assignments; exactly one is required.`,
        ),
      );
    }
  }
  const currentIds = [...currentById.keys()].sort(compareCodeUnits);
  const dispositionIds = [...currentDispositionById.keys()].sort(compareCodeUnits);
  if (
    currentDispositionById.size !== manifest.currentMechanisms.length ||
    serializeCanonical(currentIds) !== serializeCanonical(dispositionIds)
  ) {
    hardFailures.push(
      failure(
        "current-disposition-coverage",
        "currentMechanisms",
        "Current mechanism dispositions must exactly cover the built mechanism census.",
      ),
    );
  }

  const proposedIds = manifest.proposedMechanisms.map((mechanism) => mechanism.id);
  const progressiveBranch =
    proposedIds.includes(JOINT_HYPOTHESIS_CONSTRUCTION) &&
    proposedIds.includes(EXACT_SOURCE_INFEASIBILITY_PROOF);
  if (new Set(proposedIds).size !== proposedIds.length) {
    hardFailures.push(failure("duplicate-proposed-mechanism", "proposedMechanisms", "IDs must be unique."));
  }
  const proposedMaterializers = manifest.proposedMechanisms.filter(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  );
  if (proposedMaterializers.length !== 1) {
    hardFailures.push(
      failure(
        "ui-palette-v3-materializer-cardinality",
        "proposedMechanisms",
        "The branch plan must declare exactly one publication.ui-palette-v3-materializer.",
      ),
    );
  }
  const currentV3Producers = graph.mechanisms.filter((mechanism) =>
    mechanism.outputPorts.some((port) => port.artifactTypeId === manifest.goalArtifactTypeId),
  );
  if (currentV3Producers.length > 0) {
    hardFailures.push(
      failure(
        "current-ui-palette-v3-producer-forbidden",
        "currentMechanisms",
        `Only publication.ui-palette-v3-materializer may produce v3; current producers: ${currentV3Producers.map((mechanism) => mechanism.id).join(", ")}.`,
      ),
    );
  }
  if (proposedIds.some((id) => currentById.has(id))) {
    hardFailures.push(failure("proposed-current-id-collision", "proposedMechanisms", "Proposal IDs must be new."));
  }
  const proposedArtifactIds = manifest.proposedArtifacts.map((artifact) => artifact.id);
  if (new Set(proposedArtifactIds).size !== proposedArtifactIds.length) {
    hardFailures.push(failure("duplicate-proposed-artifact", "proposedArtifacts", "IDs must be unique."));
  }
  if (proposedArtifactIds.some((id) => artifactById.has(id))) {
    hardFailures.push(failure("proposed-current-artifact-collision", "proposedArtifacts", "Proposed artifact IDs must be new."));
  }
  const proposedArtifactById = new Map(
    manifest.proposedArtifacts.map((artifact) => [artifact.id, artifact]),
  );
  for (const artifact of manifest.proposedArtifacts) {
    if (isSemanticClosureShim(artifact, manifest.sourceArtifactTypeId)) {
      hardFailures.push(
        failure(
          "generic-closure-artifact",
          `proposedArtifacts.${artifact.id}`,
          "Closure artifacts must carry mechanism-specific domain fields; generic route, witness, or renamed custody wrappers are forbidden.",
        ),
      );
    }
  }
  for (const artifact of manifest.proposedArtifacts) {
    if (
      (artifact.kind === "product") !== (artifact.productFocus === "product-flow")
    ) {
      hardFailures.push(
        failure(
          "proposed-artifact-focus",
          `proposedArtifacts.${artifact.id}`,
          `${artifact.kind} cannot have focus ${artifact.productFocus}.`,
        ),
      );
    }
    const fieldByPath = new Map(
      artifact.payloadShape.fields.map((field) => [field.valuePath, field]),
    );
    if (fieldByPath.size !== artifact.payloadShape.fields.length) {
      hardFailures.push(
        failure("duplicate-payload-field", `proposedArtifacts.${artifact.id}.payloadShape`, artifact.id),
      );
    }
    if (artifact.kind === "product" && artifact.payloadShape.fields.length === 0) {
      hardFailures.push(
        failure(
          "empty-product-payload-shape",
          `proposedArtifacts.${artifact.id}.payloadShape.fields`,
          "A product handoff must declare inspectable domain payload fields.",
        ),
      );
    }
    const pathIds = artifact.valueInspection.paths.map((path) => path.valuePath);
    if (new Set(pathIds).size !== pathIds.length) {
      hardFailures.push(
        failure("duplicate-inspection-path", `proposedArtifacts.${artifact.id}.valueInspection`, artifact.id),
      );
    }
    if (artifact.kind === "product" && artifact.valueInspection.paths.length === 0) {
      hardFailures.push(
        failure(
          "empty-product-value-inspection",
          `proposedArtifacts.${artifact.id}.valueInspection.paths`,
          "A product handoff must expose inspectable domain values.",
        ),
      );
    }
    if (artifact.kind === "product" && !hasMeaningfulDomainInspection(artifact)) {
      hardFailures.push(
        failure(
          "missing-meaningful-domain-constraint",
          `proposedArtifacts.${artifact.id}.valueInspection.paths`,
          "A product handoff must constrain at least one payload value with a domain enum, exact value, specific format, or substantive domain cardinality.",
        ),
      );
    }
    for (const path of artifact.valueInspection.paths) {
      const field = fieldByPath.get(path.valuePath);
      if (!field || field.valueKind !== path.valueKind) {
        hardFailures.push(
          failure(
            "inspection-shape-mismatch",
            `proposedArtifacts.${artifact.id}.valueInspection`,
            `${path.valuePath} is not declared with matching kind in payloadShape.fields.`,
          ),
        );
      }
    }
    if (progressiveBranch && artifact.kind === "product") {
      const semanticPathRoles = new Set(
        artifact.valueInspection.paths
          .map((path) => path.semanticRole)
          .filter((role): role is string => Boolean(role)),
      );
      if (
        !artifact.semanticRoles ||
        artifact.semanticRoles.length === 0 ||
        (artifact.id !== manifest.sourceArtifactTypeId &&
          ![...semanticPathRoles].some((role) => role !== "identity.source"))
      ) {
        hardFailures.push(
          failure(
            "missing-artifact-domain-semantics",
            `proposedArtifacts.${artifact.id}`,
            "Product contracts must declare semantic roles and tag at least one inspected domain value; renamed value envelopes are not domain contracts.",
          ),
        );
      }
      for (const role of semanticPathRoles) {
        if (!artifact.semanticRoles?.includes(role)) {
          hardFailures.push(
            failure(
              "undeclared-inspection-semantic-role",
              `proposedArtifacts.${artifact.id}.valueInspection.paths`,
              `${role} is not declared by the artifact semantic-role contract.`,
            ),
          );
        }
      }
    }
    const relationIds = new Set<string>();
    for (const relation of artifact.valueInspection.relations ?? []) {
      const relationPath = `proposedArtifacts.${artifact.id}.valueInspection.relations.${relation.id}`;
      if (relationIds.has(relation.id)) {
        hardFailures.push(failure("duplicate-inspection-relation", relationPath, relation.id));
      }
      relationIds.add(relation.id);
      const subject = fieldByPath.get(relation.subjectPath);
      const object = fieldByPath.get(relation.objectPath);
      if (!subject || !object) {
        hardFailures.push(
          failure(
            "unanchored-inspection-relation",
            relationPath,
            `${relation.subjectPath} and ${relation.objectPath} must both be declared payload fields.`,
          ),
        );
        continue;
      }
      const compatible = relation.kind === "equals"
        ? subject.valueKind === object.valueKind
        : relation.kind === "member-of"
          ? object.valueKind === "collection" && subject.valueKind !== "collection"
          : relation.kind === "subset-of" || relation.kind === "aligned-equals"
            ? subject.valueKind === "collection" && object.valueKind === "collection"
            : relation.kind === "aligned-witness"
              ? (subject.valueKind === "scalar" || subject.valueKind === "collection") &&
                object.valueKind === "collection"
              : relation.kind === "rgb-hex-equivalent"
                ? subject.valueKind === "collection" && object.valueKind === "scalar"
                : relation.kind === "variant-semantics"
                  ? subject.valueKind === "scalar" && object.valueKind === "state"
                  : relation.kind === "collapse-equivalence"
                    ? subject.valueKind === "scalar" && object.valueKind === "scalar"
                    : false;
      if (!compatible) {
        hardFailures.push(
          failure(
            "inspection-relation-kind-mismatch",
            relationPath,
            `${relation.kind} cannot relate ${subject.valueKind} to ${object.valueKind}.`,
          ),
        );
      }
    }
    if (progressiveBranch && artifact.id === ADMITTED_TREATMENT) {
      const expectedRelations = new Map<string, readonly [string, string, string, string?]>();
      for (const role of ["background", "surface", "foreground", "accent"]) {
        expectedRelations.set(`${role}-color-id`, ["equals", `/roles/${role}/color`, `/roles/${role}/occupiedColorId`]);
        expectedRelations.set(`${role}-occupied`, ["member-of", `/roles/${role}/occupiedColorId`, "/occupiedColorIds"]);
        expectedRelations.set(`${role}-witness`, ["aligned-witness", `/roles/${role}/occupiedColorId`, `/roles/${role}/nativePixelWitness`]);
      }
      expectedRelations.set("gradient-colors-occupied", ["subset-of", "/gradient/stopColorIds", "/occupiedColorIds", "gradient"]);
      expectedRelations.set("gradient-occupied-aligned", ["aligned-equals", "/gradient/stopColorIds", "/gradient/stopOccupiedColorIds", "gradient"]);
      expectedRelations.set("gradient-witnesses-aligned", ["aligned-witness", "/gradient/stopOccupiedColorIds", "/gradient/stopNativePixelWitnesses", "gradient"]);
      expectedRelations.set("gradient-endpoint-colors-occupied", ["subset-of", "/gradient/endpointColorIds", "/occupiedColorIds", "gradient"]);
      expectedRelations.set("gradient-endpoint-occupied-aligned", ["aligned-equals", "/gradient/endpointColorIds", "/gradient/endpointOccupiedColorIds", "gradient"]);
      expectedRelations.set("gradient-endpoint-witnesses-aligned", ["aligned-witness", "/gradient/endpointOccupiedColorIds", "/gradient/endpointNativePixelWitnesses", "gradient"]);
      const actualRelations = new Map((artifact.valueInspection.relations ?? []).map((relation) => [relation.id, relation]));
      for (const [id, [kind, subjectPath, objectPath, whenVariant]] of expectedRelations) {
        const actual = actualRelations.get(id);
        if (
          !actual ||
          actual.kind !== kind ||
          actual.subjectPath !== subjectPath ||
          actual.objectPath !== objectPath ||
          actual.whenVariant !== whenVariant
        ) {
          hardFailures.push(
            failure(
              "missing-admission-membership-relation",
              `proposedArtifacts.${artifact.id}.valueInspection.relations`,
              `${id} must declare the exact occupancy-membership or aligned-witness predicate.`,
            ),
          );
        }
      }
      const variants = artifact.payloadShape.variants ?? [];
      const variantById = new Map(variants.map((variant) => [variant.id, variant]));
      const gradientPaths = [
        "/gradient/stops",
        "/gradient/path",
        "/gradient/endpoints",
        "/gradient/stopColorIds",
        "/gradient/stopOccupiedColorIds",
        "/gradient/stopNativePixelWitnesses",
        "/gradient/endpointColorIds",
        "/gradient/endpointOccupiedColorIds",
        "/gradient/endpointNativePixelWitnesses",
      ];
      for (const [id, treatmentKind, admissionKind] of [
        ["flat", "flat", "ordinary"],
        ["gradient", "gradient", "ordinary"],
        ["emergency-flat", "flat", "emergency-flat"],
      ] as const) {
        const variant = variantById.get(id);
        const expectedDiscriminators = [
          { valuePath: "/treatmentVariant", comparator: "equals", value: id },
          { valuePath: "/treatmentKind", comparator: "equals", value: treatmentKind },
          { valuePath: "/admission/kind", comparator: "equals", value: admissionKind },
        ];
        const required = new Set(variant?.requiredPaths ?? []);
        const forbidden = new Set(variant?.forbiddenPaths ?? []);
        const commonPaths = ADMITTED_TREATMENT_IDENTITY_PATHS.filter(
          (path) => !gradientPaths.includes(path),
        );
        const validGradientShape = id === "gradient"
          ? gradientPaths.every((path) => required.has(path) && !forbidden.has(path))
          : gradientPaths.every((path) => forbidden.has(path) && !required.has(path));
        if (
          !variant ||
          !sameJson(variant.discriminatorConstraints, expectedDiscriminators) ||
          !commonPaths.every((path) => required.has(path) && !forbidden.has(path)) ||
          !validGradientShape ||
          (id === "emergency-flat" && !required.has("/admission/infeasibilityProofId"))
        ) {
          hardFailures.push(
            failure(
              "invalid-admitted-treatment-union-variant",
              `proposedArtifacts.${artifact.id}.payloadShape.variants`,
              `${id} must be explicitly discriminated with its exact required and forbidden treatment payload.`,
            ),
          );
        }
      }
      for (const id of ["flat", "gradient"] as const) {
        const variant = variantById.get(id);
        if (
          !variant ||
          EMERGENCY_ADMISSION_IDENTITY_PATHS.some((path) =>
            variant.requiredPaths.includes(path) || !variant.forbiddenPaths.includes(path),
          )
        ) {
          hardFailures.push(
            failure(
              "ordinary-admission-emergency-fields",
              `proposedArtifacts.${artifact.id}.payloadShape.variants`,
              `${id} must forbid emergency-only admission evidence.`,
            ),
          );
        }
      }
      const emergencyVariant = variantById.get("emergency-flat");
      if (
        !emergencyVariant ||
        !EMERGENCY_ADMISSION_IDENTITY_PATHS.every((path) => emergencyVariant.requiredPaths.includes(path))
      ) {
        hardFailures.push(
          failure(
            "emergency-admission-evidence-fields",
            `proposedArtifacts.${artifact.id}.payloadShape.variants`,
            "Emergency-flat must require evaluated candidates and exact numeric zero feasibility.",
          ),
        );
      }
      if (variants.length !== 3) {
        hardFailures.push(
          failure(
            "invalid-admitted-treatment-union-cardinality",
            `proposedArtifacts.${artifact.id}.payloadShape.variants`,
            "The admitted treatment must declare exactly flat, gradient, and emergency-flat variants.",
          ),
        );
      }
    }
  }
  const declaredArtifacts = new Set([...artifactById.keys(), ...proposedArtifactIds]);
  for (const [aliasId, targetId] of Object.entries(manifest.artifactTypeAliases)) {
    if (declaredArtifacts.has(aliasId)) {
      hardFailures.push(failure("artifact-alias-collision", `artifactTypeAliases.${aliasId}`, aliasId));
    }
    if (!declaredArtifacts.has(targetId)) {
      hardFailures.push(failure("unknown-artifact-alias-target", `artifactTypeAliases.${aliasId}`, targetId));
    }
  }
  const aliases = new Set(Object.keys(manifest.artifactTypeAliases));
  const demotions = new Set(manifest.productArtifactDemotions);
  for (const artifactId of demotions) {
    if (!artifactById.has(artifactId)) {
      hardFailures.push(failure("unknown-product-demotion", "productArtifactDemotions", artifactId));
    }
  }
  const builtSource = artifactById.get(manifest.sourceArtifactTypeId);
  const proposedSource = proposedArtifactById.get(manifest.sourceArtifactTypeId);
  if (
    !(
      (builtSource?.productFocus === "product-flow" &&
        builtSource.boundaryClassification === "expected-external" &&
        !demotions.has(builtSource.id)) ||
      (proposedSource?.kind === "product" &&
        proposedSource.productFocus === "product-flow")
    )
  ) {
    hardFailures.push(
      failure(
        "invalid-source-artifact",
        "sourceArtifactTypeId",
        `${manifest.sourceArtifactTypeId} must be a declared product-flow external source artifact.`,
      ),
    );
  }
  for (const artifactId of [
    manifest.sidecarPolicy.fixtureArtifactTypeId,
    manifest.sidecarPolicy.visualizationArtifactTypeId,
    manifest.sidecarPolicy.humanScoreArtifactTypeId,
  ]) {
    const artifact = artifactContract(artifactId, artifactById, proposedArtifactById);
    if (!artifact || artifact.productFocus === "product-flow") {
      hardFailures.push(failure("invalid-sidecar-artifact", "sidecarPolicy", artifactId));
    }
  }

  const fixedConfigById = new Map(
    manifest.fixedConfigurations.map((config) => [config.id, config]),
  );
  if (fixedConfigById.size !== manifest.fixedConfigurations.length) {
    hardFailures.push(failure("duplicate-fixed-configuration", "fixedConfigurations", "IDs must be unique."));
  }
  const readinessProviderById = new Map(
    manifest.readinessProviders.map((provider) => [provider.id, provider]),
  );
  if (readinessProviderById.size !== manifest.readinessProviders.length) {
    hardFailures.push(failure("duplicate-readiness-provider", "readinessProviders", "IDs must be unique."));
  }
  for (const provider of manifest.readinessProviders) {
    const portIds = provider.outputPorts.map((port) => port.id);
    if (new Set(portIds).size !== portIds.length) {
      hardFailures.push(failure("duplicate-readiness-provider-port", `readinessProviders.${provider.id}`, provider.id));
    }
    provider.outputPorts.forEach((port, index) =>
      validatePortDefinition(
        port,
        `readinessProviders.${provider.id}.outputPorts[${index}]`,
        "readiness",
        artifactById,
        proposedArtifactById,
        aliases,
        demotions,
        hardFailures,
      ),
    );
  }

  for (const entry of manifest.currentMechanisms) {
    const mechanism = currentById.get(entry.mechanismId);
    if (!mechanism) continue;
    const validPortRefs = new Set([
      ...mechanism.inputPorts.map((port) => `input:${port.id}`),
      ...mechanism.outputPorts.map((port) => `output:${port.id}`),
    ]);
    for (const portRef of entry.excludedProductPorts) {
      if (!validPortRefs.has(portRef)) {
        hardFailures.push(
          failure("unknown-current-contract-port", `currentMechanisms.${entry.mechanismId}.excludedProductPorts`, portRef),
        );
      }
    }
    const outputIds = new Set(mechanism.outputPorts.map((port) => port.id));
    for (const portId of Object.keys(entry.outputCardinalityOverrides ?? {})) {
      if (!outputIds.has(portId)) {
        hardFailures.push(
          failure("unknown-current-output-override", `currentMechanisms.${entry.mechanismId}.outputCardinalityOverrides`, portId),
        );
      }
    }
    if (
      (entry.excludedProductPorts.length > 0 ||
        Object.keys(entry.outputCardinalityOverrides ?? {}).length > 0) &&
      !entry.replacementContract
    ) {
      hardFailures.push(
        failure(
          "implicit-current-contract-rewrite",
          `currentMechanisms.${entry.mechanismId}`,
          "Port exclusions and output-cardinality overrides require an explicit replacementContract and reason.",
        ),
      );
    }
    if (entry.replacementContract) {
      const builtContract = currentProductContract(mechanism, artifactById, demotions, {
        ...entry,
        replacementContract: undefined,
      });
      const replacementContract = {
        productInputs: entry.replacementContract.productInputs,
        outputBranches: entry.replacementContract.productOutputs,
      };
      const expectedContract = {
        productInputs: builtContract.productInputs,
        outputBranches: builtContract.outputBranches,
      };
      if (!sameJson(replacementContract, expectedContract)) {
        hardFailures.push(
          failure(
            "replacement-contract-mismatch",
            `currentMechanisms.${entry.mechanismId}.replacementContract`,
            "A replacement contract must exactly correspond to the built product contract after its declared port exclusions and cardinality overrides; no scope waiver is permitted.",
          ),
        );
      }
      const replacementConsumesSource = allPorts(entry.replacementContract.productInputs).some(
        (port) => port.artifactTypeId === manifest.sourceArtifactTypeId,
      );
      const replacementEmitsFinalTreatment = entry.replacementContract.productOutputs.some(
        (branch) =>
          branch.ports.some(
            (port) => port.artifactTypeId === "artifact.treatment.final-exact-source-ordinary.v1",
          ),
      );
      if (replacementConsumesSource && replacementEmitsFinalTreatment) {
        hardFailures.push(
          failure(
            "raw-source-final-treatment-bypass",
            `currentMechanisms.${entry.mechanismId}.replacementContract`,
            "A replacement contract cannot bypass mechanism-specific product handoffs from raw artwork source to final treatment.",
          ),
        );
      }
      const ports = [
        ...allPorts(entry.replacementContract.productInputs),
        ...entry.replacementContract.productOutputs.flatMap((branch) => branch.ports),
      ];
      ports.forEach((port, index) =>
        validatePortDefinition(
          port,
          `currentMechanisms.${entry.mechanismId}.replacementContract.ports[${index}]`,
          "product",
          artifactById,
          proposedArtifactById,
          aliases,
          demotions,
          hardFailures,
        ),
      );
      const replacementInputs = new Set(
        allPorts(entry.replacementContract.productInputs).map((port) => port.id),
      );
      const replacementOutputs = new Map(
        entry.replacementContract.productOutputs
          .flatMap((branch) => branch.ports)
          .map((port) => [port.id, port]),
      );
      for (const portRef of entry.excludedProductPorts) {
        const [direction, portId] = portRef.split(":", 2);
        if (
          (direction === "input" && replacementInputs.has(portId ?? "")) ||
          (direction === "output" && replacementOutputs.has(portId ?? ""))
        ) {
          hardFailures.push(
            failure(
              "replacement-retains-excluded-port",
              `currentMechanisms.${entry.mechanismId}.replacementContract`,
              portRef,
            ),
          );
        }
      }
      for (const [portId, cardinality] of Object.entries(
        entry.outputCardinalityOverrides ?? {},
      )) {
        if (replacementOutputs.get(portId)?.cardinality !== cardinality) {
          hardFailures.push(
            failure(
              "replacement-override-mismatch",
              `currentMechanisms.${entry.mechanismId}.replacementContract`,
              `${portId} must explicitly declare ${cardinality}.`,
            ),
          );
        }
      }
    } else {
      const contract = currentProductContract(mechanism, artifactById, demotions, entry);
      const ports = [
        ...allPorts(contract.productInputs),
        ...contract.outputBranches.flatMap((branch) => branch.ports),
      ];
      ports.forEach((port, index) =>
        validatePortDefinition(
          port,
          `currentMechanisms.${entry.mechanismId}.productPorts[${index}]`,
          "product",
          artifactById,
          proposedArtifactById,
          aliases,
          demotions,
          hardFailures,
        ),
      );
    }
  }

  for (const mechanism of manifest.proposedMechanisms) {
    const inputGroups = mechanism.productInputs.map((group) => group.id);
    const branches = mechanism.productOutputs.map((branch) => branch.id);
    const productPorts = [
      ...allPorts(mechanism.productInputs),
      ...mechanism.productOutputs.flatMap((branch) => branch.ports),
    ];
    const portIds = productPorts.map((port) => port.id);
    const productPortById = new Map(productPorts.map((port) => [port.id, port]));
    if (new Set(inputGroups).size !== inputGroups.length) {
      hardFailures.push(failure("duplicate-proposed-input-group", `proposedMechanisms.${mechanism.id}`, mechanism.id));
    }
    if (new Set(branches).size !== branches.length) {
      hardFailures.push(failure("duplicate-proposed-output-branch", `proposedMechanisms.${mechanism.id}`, mechanism.id));
    }
    if (new Set(portIds).size !== portIds.length) {
      hardFailures.push(failure("duplicate-proposed-port", `proposedMechanisms.${mechanism.id}`, mechanism.id));
    }
    const crossPortConstraintIds = new Set<string>();
    for (const [constraintIndex, constraint] of mechanism.crossPortConstraints.entries()) {
      const constraintPath = `proposedMechanisms.${mechanism.id}.crossPortConstraints[${constraintIndex}]`;
      const constraintId = serializeCanonical(constraint);
      if (crossPortConstraintIds.has(constraintId)) {
        hardFailures.push(failure("duplicate-cross-port-constraint", constraintPath, constraintId));
      }
      crossPortConstraintIds.add(constraintId);
      const leftPort = productPortById.get(constraint.leftPortId);
      const rightPort = productPortById.get(constraint.rightPortId);
      const leftInspection = leftPort
        ? inspectionPath(
            artifactContract(leftPort.artifactTypeId, artifactById, proposedArtifactById),
            constraint.leftValuePath,
          )
        : undefined;
      const rightInspection = rightPort
        ? inspectionPath(
            artifactContract(rightPort.artifactTypeId, artifactById, proposedArtifactById),
            constraint.rightValuePath,
          )
        : undefined;
      if (!leftPort || !rightPort || !leftInspection || !rightInspection) {
        hardFailures.push(
          failure(
            "invalid-cross-port-constraint-endpoint",
            constraintPath,
            "Cross-port constraints must reference declared product ports and inspected payload paths.",
          ),
        );
        continue;
      }
      const validKinds =
        constraint.relation === "member-of"
          ? (leftInspection.valueKind === "scalar" || leftInspection.valueKind === "object") &&
            rightInspection.valueKind === "collection"
          : constraint.relation === "subset-of"
            ? leftInspection.valueKind === "collection" && rightInspection.valueKind === "collection"
            : leftInspection.valueKind === rightInspection.valueKind;
      if (!validKinds) {
        hardFailures.push(
          failure(
            "cross-port-constraint-kind-mismatch",
            constraintPath,
            `${constraint.relation} cannot relate ${leftInspection.valueKind} to ${rightInspection.valueKind}.`,
          ),
        );
      }
    }
    if (branches.filter((branch) => branch === "success").length !== 1) {
      hardFailures.push(failure("success-branch-cardinality", `proposedMechanisms.${mechanism.id}`, mechanism.id));
    }
    const consumesRawSource = allPorts(mechanism.productInputs).some(
      (port) => port.artifactTypeId === manifest.sourceArtifactTypeId,
    );
    const consumesNativeRaster = allPorts(mechanism.productInputs).some(
      (port) => port.artifactTypeId === "artifact.raster.native-srgb8-opaque.v1",
    );
    const successPorts = mechanism.productOutputs.find(
      (branch) => branch.id === "success",
    )?.ports ?? [];
    if (progressiveBranch) {
      const computationalPort = successPorts[0];
      const computationalArtifact = computationalPort
        ? proposedArtifactById.get(computationalPort.artifactTypeId)
        : undefined;
      const builtSemanticException =
        mechanism.id === "raster.native-artwork-decode" ||
        mechanism.id === "publication.ui-palette-v3-materializer";
      if (
        !computationalPort ||
        (!builtSemanticException &&
          (!computationalArtifact ||
            !hasMechanismSpecificComputationalContract(computationalArtifact, mechanism.id))) ||
        /\b(?:compute|produce) the typed\b|\bdomain product\b|\bcomputed values\b/i.test(
          mechanism.operation,
        )
      ) {
        hardFailures.push(
          failure(
            "mechanism-specific-computational-contract",
            `proposedMechanisms.${mechanism.id}`,
            "Each proposal must name a concrete operation and expose at least two required, constrained computational fields with mechanism-specific semantic roles; generic envelopes are forbidden.",
          ),
        );
      }
    }
    if (
      progressiveBranch &&
      !new Set<string>([
        ORDINARY_EXACT_SOURCE_ADMISSION,
        EMERGENCY_EXACT_SOURCE_ADMISSION,
      ]).has(mechanism.id) &&
      successPorts.some((port) => port.artifactTypeId === ADMITTED_TREATMENT)
    ) {
      hardFailures.push(
        failure(
          "unauthorized-admitted-treatment-admission",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          "Only ordinary exact-source admission or typed-proof emergency admission may emit the admitted treatment contract.",
        ),
      );
    }
    if (
      progressiveBranch &&
      !mechanism.id.startsWith("test.") &&
      !COMPLETE_TREATMENT_EMITTERS.has(mechanism.id) &&
      successPorts.some(
        (port) =>
          hasTreatmentContentContract(port) ||
          treatmentContentPathCount(port) >= PRODUCT_TREATMENT_IDENTITY_PATHS.length - 2,
      )
    ) {
      hardFailures.push(
        failure(
          "near-complete-treatment-mint",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          "Pre-reification mechanisms may emit domain evidence only; they cannot mint a complete or near-complete treatment payload.",
        ),
      );
    }
    if (
      consumesNativeRaster &&
      mechanism.id !== "evidence.native-raster-primitives"
    ) {
      hardFailures.push(
        failure(
          "omniscient-native-raster-fanout",
          `proposedMechanisms.${mechanism.id}.productInputs`,
          "Only native primitive measurement may consume the decoded raster directly; later proposals require local computational products.",
        ),
      );
    }
    if (successPorts.length > 16) {
      hardFailures.push(
        failure(
          "packed-proposed-mechanism",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          `A single success branch exposes ${successPorts.length} products instead of one bounded mechanism-local contract family.`,
        ),
      );
    }
    const boundedOutputFamily = BOUNDED_PROPOSED_OUTPUT_FAMILIES.get(mechanism.id);
    const unrelatedOutputs = boundedOutputFamily
      ? successPorts.filter((port) => !boundedOutputFamily.has(port.artifactTypeId))
      : [];
    if (unrelatedOutputs.length > 0) {
      hardFailures.push(
        failure(
          "unrelated-proposed-output",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          `Outputs are outside this mechanism's bounded domain contract: ${unrelatedOutputs.map((port) => `${port.id}:${port.artifactTypeId}`).join(", ")}.`,
        ),
      );
    }
    if (
      successPorts.some(
        (port) => port.artifactTypeId === "artifact.treatment.final-exact-source-ordinary.v1",
      ) &&
      !consumesRawSource &&
      mechanism.id !== ORDINARY_EXACT_SOURCE_ADMISSION
    ) {
      hardFailures.push(
        failure(
          "unauthorized-final-treatment-admission",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          "Only exact-source treatment admission may emit the admitted ordinary full treatment.",
        ),
      );
    }
    if (
      successPorts.some(
        (port) => port.artifactTypeId === "artifact.treatment.admitted-emergency-flat.v1",
      ) &&
      mechanism.id !== EMERGENCY_EXACT_SOURCE_ADMISSION
    ) {
      hardFailures.push(
        failure(
          "unauthorized-emergency-treatment-admission",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          "Only infeasibility-proven emergency ladder materialization may emit the admitted emergency treatment.",
        ),
      );
    }
    if (mechanism.id === "raster.native-artwork-decode") {
      const sourceInput = allPorts(mechanism.productInputs)[0];
      const alphaBranch = mechanism.productOutputs.find((branch) => branch.id === "alpha");
      const nativeRaster = successPorts[0];
      if (
        allPorts(mechanism.productInputs).length !== 1 ||
        sourceInput?.artifactTypeId !== manifest.sourceArtifactTypeId ||
        !sourceInput.identityPaths.includes("/sourceImageId") ||
        sourceInput.identityPaths.includes("/sourceFingerprint") ||
        successPorts.length !== 1 ||
        nativeRaster?.artifactTypeId !== "artifact.raster.native-srgb8-opaque.v1" ||
        nativeRaster.cardinality !== "exactly-one" ||
        !["/sourceImageId", "/nativeRasterId"].every((path) =>
          nativeRaster.identityPaths.includes(path),
        ) ||
        nativeRaster.identityPaths.includes("/sourceFingerprint") ||
        !nativeRaster.constraints.some(
          (constraint) =>
            constraint.valuePath === "/allPixelsOpaque" &&
            constraint.comparator === "equals" &&
            constraint.value === true,
        ) ||
        alphaBranch?.ports.length !== 1 ||
        alphaBranch.ports[0]?.artifactTypeId !==
          "artifact.decision.alpha-not-opaque-refusal.v1" ||
        !alphaBranch.ports[0]?.identityPaths.includes("/sourceImageId")
      ) {
        hardFailures.push(
          failure(
            "decode-source-identity-alpha-contract",
            `proposedMechanisms.${mechanism.id}`,
            "Decode must preserve sourceImageId from encoded artwork, emit only an all-pixels-opaque native raster on success, and expose an explicit source-identified alpha refusal branch; sourceFingerprint is custody, not product identity.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === "evidence.native-color-occupancy-measurement") {
      const nativeRasterInput = allPorts(mechanism.productInputs).find(
        (port) => port.id === "from-evidence-native-family-evidence-construction",
      );
      const occupancyOutput = successPorts.find(
        (port) => port.id === "native-color-occupancy",
      );
      if (
        nativeRasterInput?.artifactTypeId !== "artifact.evidence.evidence-native-family-evidence-construction.v1" ||
        !nativeRasterInput.identityPaths.includes("/nativeRasterId") ||
        occupancyOutput?.artifactTypeId !== NATIVE_OCCUPANCY ||
        occupancyOutput.cardinality !== "exactly-one" ||
        !["/nativeRasterId", "/occupiedColorIds"].every((valuePath) =>
          occupancyOutput.identityPaths.includes(valuePath),
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "from-evidence-native-family-evidence-construction",
          "/nativeRasterId",
          "equals",
          "native-color-occupancy",
          "/nativeRasterId",
        )
      ) {
        hardFailures.push(
          failure(
            "native-occupancy-producer-contract",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "Native-color occupancy must be emitted from the exact native-raster identity carried by native raster primitives.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === ORDINARY_EXACT_SOURCE_ADMISSION) {
      const admittedInputs = allPorts(mechanism.productInputs).filter(hasTreatmentContentContract);
      const occupancyInput = allPorts(mechanism.productInputs).find(
        (port) => port.artifactTypeId === "artifact.measurement.native-color-occupancy.v1",
      );
      const admittedTreatments = mechanism.productOutputs
        .find((branch) => branch.id === "success")?.ports
        .filter((port) =>
          progressiveBranch
            ? hasAdmittedTreatmentContract(port, "ordinary")
            : hasTreatmentContentContract(port),
        ) ?? [];
      if (
        admittedInputs.length !== 1 ||
        admittedInputs[0]?.cardinality !== "exactly-one" ||
        admittedTreatments.length !== 1 ||
        admittedTreatments[0]?.cardinality !== "exactly-one" ||
        (progressiveBranch &&
          (!admittedTreatments[0]?.identityPaths.includes("/treatmentVariant") ||
            !admittedTreatments[0]?.constraints.some(
              (constraint) =>
                constraint.valuePath === "/treatmentVariant" &&
                constraint.comparator === "in" &&
                sameJson(constraint.value, ["flat", "gradient"]),
            ))) ||
        !occupancyInput ||
        occupancyInput.cardinality !== "exactly-one" ||
        !["/nativeRasterId", "/occupiedColorIds"].every((path) =>
          occupancyInput.identityPaths.includes(path),
        ) ||
        !["/nativeRasterId", "/occupiedColorIds"].every((path) =>
          admittedInputs[0]?.identityPaths.includes(path),
        ) ||
        !preservesAcrossPorts(mechanism, "native-color-occupancy", "repaired-treatment", ["/nativeRasterId", "/occupiedColorIds"]) ||
        !preservesAcrossPorts(mechanism, "native-color-occupancy", "admitted-treatment", ["/nativeRasterId", "/occupiedColorIds"]) ||
        !hasCrossPortConstraint(mechanism, "repaired-treatment", "/candidateDomainId", "equals", "admitted-treatment", "/admission/candidateDomainId")
      ) {
        hardFailures.push(
          failure(
            "admission-must-preserve-complete-treatment-content",
            `proposedMechanisms.${mechanism.id}`,
            "Exact-source admission must consume one complete treatment, bind exact native occupancy, and emit one ordinary admitted treatment with role and gradient-stop membership witnesses.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === "candidate.native-witness-redemption") {
      const inputTypes = productArtifactTypes(mechanism.productInputs);
      const candidateGroup = mechanism.productInputs.find(
        (group) => group.id === "candidate-colors",
      );
      const candidateInputFamilyClosed = inputTypes.every((artifactTypeId) =>
        artifactTypeId.startsWith("artifact.candidate.") ||
        artifactTypeId.startsWith("artifact.candidates.") ||
        artifactTypeId.startsWith("artifact.hypothesis.field.") ||
        artifactTypeId.startsWith("artifact.roles."),
      );
      if (
        !inputTypes.includes("artifact.candidates.candidate-archetypoid-observation-construction.v1") ||
        !inputTypes.includes("artifact.roles.role-artwork-family-relation-measurement.v1") ||
        !candidateInputFamilyClosed ||
        candidateGroup?.mode !== "exactly-one" ||
        !successPorts.some((port) => port.artifactTypeId === "artifact.candidate.native-witness-redemption.v1") ||
        !preservesAcrossPorts(
          mechanism,
          "candidate-observations",
          "native-witnesses",
          ["/sourceImageId", "/nativeRasterId", "/candidateIds"],
        )
      ) {
        hardFailures.push(
          failure(
            "native-witness-redemption-contract",
            `proposedMechanisms.${mechanism.id}`,
            "Native-witness redemption must consume candidate observations plus measured family relations and preserve source and candidate identities.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === ORDINARY_EXACT_SOURCE_ADMISSION) {
      const relationallyComplete = ["background", "surface", "foreground", "accent"].every((role) =>
        hasCrossPortConstraint(mechanism, "repaired-treatment", `/roles/${role}/color`, "member-of", "native-color-occupancy", "/occupiedColorIds") &&
        hasCrossPortConstraint(mechanism, "admitted-treatment", `/roles/${role}/occupiedColorId`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
      ) &&
        hasCrossPortConstraint(mechanism, "repaired-treatment", "/gradient/stops", "subset-of", "native-color-occupancy", "/occupiedColorIds") &&
        hasCrossPortConstraint(mechanism, "repaired-treatment", "/gradient/endpoints", "subset-of", "native-color-occupancy", "/occupiedColorIds") &&
        hasCrossPortConstraint(mechanism, "admitted-treatment", "/gradient/stopOccupiedColorIds", "subset-of", "native-color-occupancy", "/occupiedColorIds") &&
        hasCrossPortConstraint(mechanism, "admitted-treatment", "/gradient/endpointOccupiedColorIds", "subset-of", "native-color-occupancy", "/occupiedColorIds");
      if (!relationallyComplete) {
        hardFailures.push(
          failure(
            "ordinary-admission-relational-membership-contract",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "Ordinary admission must declare role and conditional gradient membership against the exact native occupied-color set.",
          ),
        );
      }
      const ordinaryOutput = successPorts.find((port) => hasAdmittedTreatmentContract(port, "ordinary"));
      if (
        !ordinaryOutput ||
        EMERGENCY_ADMISSION_IDENTITY_PATHS.some((path) =>
          ordinaryOutput.identityPaths.includes(path) ||
          ordinaryOutput.constraints.some((constraint) => constraint.valuePath === path),
        )
      ) {
        hardFailures.push(
          failure(
            "ordinary-admission-emergency-output",
            `proposedMechanisms.${mechanism.id}`,
            "Ordinary admission must not bind or fabricate emergency-only evidence.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === EMERGENCY_EXACT_SOURCE_ADMISSION) {
      const relationallyComplete = ["background", "surface", "foreground", "accent"].every((role) =>
        hasCrossPortConstraint(mechanism, "repaired-flat-treatment", `/roles/${role}/color`, "member-of", "native-color-occupancy", "/occupiedColorIds") &&
        hasCrossPortConstraint(mechanism, "admitted-treatment", `/roles/${role}/occupiedColorId`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
      );
      if (!relationallyComplete) {
        hardFailures.push(
          failure(
            "emergency-admission-relational-membership-contract",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "Emergency-flat admission must declare every role color membership against the same direct native-occupancy input bound into its proof.",
          ),
        );
      }
    }
    const progressiveContracts = new Map<string, { inputs: string[]; outputs: string[] }>([
      [
        JOINT_HYPOTHESIS_CONSTRUCTION,
        {
          inputs: [
            "artifact.candidate.exact-native-pixel-admission.v1",
            "artifact.roles.role-artwork-family-relation-measurement.v1",
            "artifact.roles.role-treatment-swap-legality-measurement.v1",
          ],
          outputs: [JOINT_HYPOTHESES],
        },
      ],
      [FINITE_FACTOR_CONSTRUCTION, { inputs: [JOINT_HYPOTHESES], outputs: [FINITE_FACTORS] }],
      [SWAPPED_CANDIDATE_DOMAIN_INSERTION, { inputs: [FINITE_FACTORS], outputs: [SWAP_LEGAL_DOMAIN] }],
      [SELECTED_DECISION_MECHANISM, { inputs: [SWAP_LEGAL_DOMAIN], outputs: [SELECTED_DECISION] }],
      [
        SELECTED_TREATMENT_ROLE_REIFICATION,
        { inputs: [SELECTED_DECISION, SWAP_LEGAL_DOMAIN], outputs: [SELECTED_TREATMENT] },
      ],
      [
        REPAIR_WINNER_INPUT_CONSTRUCTION,
        { inputs: [SELECTED_TREATMENT, NATIVE_OCCUPANCY], outputs: [REPAIR_WINNER_INPUT] },
      ],
      [REPAIR_MECHANISM, { inputs: [REPAIR_WINNER_INPUT], outputs: [REPAIR_RESULT] }],
    ]);
    const progressive = progressiveContracts.get(mechanism.id);
    if (progressive) {
      const actualInputs = productArtifactTypes(mechanism.productInputs);
      const actualOutputs = successArtifactTypes(mechanism);
      if (
        !progressive.inputs.every((artifactTypeId) => actualInputs.includes(artifactTypeId)) ||
        !progressive.outputs.every((artifactTypeId) => actualOutputs.includes(artifactTypeId)) ||
        successPorts.some((port) =>
          mechanism.id !== SELECTED_TREATMENT_ROLE_REIFICATION &&
          mechanism.id !== REPAIR_WINNER_INPUT_CONSTRUCTION &&
          mechanism.id !== REPAIR_MECHANISM &&
          hasTreatmentContentContract(port)
        )
      ) {
        hardFailures.push(
          failure(
            "progressive-treatment-stage-contract",
            `proposedMechanisms.${mechanism.id}`,
            "The progressive ordinary-treatment stage must consume its typed predecessor evidence and emit only its declared domain product.",
          ),
        );
      }
    }
    if (mechanism.id === SELECTED_DECISION_MECHANISM) {
      if (
        !preservesAcrossPorts(
          mechanism,
          "swap-legal-domain",
          "selected-decision",
          [
            "/sourceImageId",
            "/nativeRasterId",
            "/provenanceChain",
            "/candidateDomainId",
            "/paletteDomainId",
            "/candidateIds",
            "/selectionObjectiveId",
          ],
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedCandidateId",
          "member-of",
          "swap-legal-domain",
          "/candidateIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/candidateDomainId",
          "equals",
          "swap-legal-domain",
          "/candidateDomainId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/paletteDomainId",
          "equals",
          "swap-legal-domain",
          "/paletteDomainId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectionObjectiveId",
          "equals",
          "swap-legal-domain",
          "/selectionObjectiveId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedHypothesisId",
          "member-of",
          "swap-legal-domain",
          "/jointHypothesisIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedCandidateIds",
          "subset-of",
          "swap-legal-domain",
          "/candidateIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedTreatmentRecord",
          "member-of",
          "swap-legal-domain",
          "/candidateTreatmentRecords",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedTreatmentRecords",
          "subset-of",
          "swap-legal-domain",
          "/candidateTreatmentRecords",
        ) ||
        SELECTED_DECISION_DOMAIN_IDENTITY_PATHS.some((valuePath) =>
          !hasCrossPortConstraint(
            mechanism,
            "selected-decision",
            `/selectedTreatmentRecord${valuePath}`,
            "equals",
            "selected-decision",
            valuePath,
          )
        )
      ) {
        hardFailures.push(
          failure(
            "selected-decision-domain-membership-contract",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "The decision must preserve source, candidate-domain, palette-domain, and objective identity and select one complete candidate treatment record without minting content.",
          ),
        );
      }
    }
    if (mechanism.id === SELECTED_TREATMENT_ROLE_REIFICATION) {
      if (
        !preservesAcrossPorts(
          mechanism,
          "selected-decision",
          "selected-treatment",
          SELECTED_MEMBER_IDENTITY_PATHS,
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/candidateDomainId",
          "equals",
          "swap-legal-domain",
          "/candidateDomainId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/paletteDomainId",
          "equals",
          "swap-legal-domain",
          "/paletteDomainId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectionObjectiveId",
          "equals",
          "swap-legal-domain",
          "/selectionObjectiveId",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedHypothesisId",
          "member-of",
          "swap-legal-domain",
          "/jointHypothesisIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedCandidateIds",
          "subset-of",
          "swap-legal-domain",
          "/candidateIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedTreatmentRecord",
          "member-of",
          "swap-legal-domain",
          "/candidateTreatmentRecords",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedCandidateId",
          "member-of",
          "swap-legal-domain",
          "/candidateIds",
        ) ||
        !hasCrossPortConstraint(
          mechanism,
          "selected-decision",
          "/selectedTreatmentRecords",
          "subset-of",
          "swap-legal-domain",
          "/candidateTreatmentRecords",
        ) ||
        SELECTED_TREATMENT_RECORD_CONTENT_PATHS.some((valuePath) =>
          !hasCrossPortConstraint(
            mechanism,
            "selected-decision",
            `/selectedTreatmentRecord${valuePath}`,
            "equals",
            "selected-treatment",
            valuePath,
          )
        )
      ) {
        hardFailures.push(
          failure(
            "selected-treatment-exact-member-reification",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "Role reification must preserve the selected decision identities and bind its selected treatment-record reference to the candidate domain before reifying role content.",
          ),
        );
      }
    }
    const treatmentPreservationStages = new Map<string, Array<[string, string]>>([
      [REPAIR_WINNER_INPUT_CONSTRUCTION, [["selected-treatment", "repair-winner-input"]]],
      [REPAIR_MECHANISM, [["repair-winner-input", "repair-result"]]],
      [REPAIR_RESULT_ROLE_REIFICATION, [
        ["repair-result", "repaired-treatment"],
        ["repair-result", "repaired-flat-treatment"],
      ]],
      [ORDINARY_EXACT_SOURCE_ADMISSION, [["repaired-treatment", "admitted-treatment"]]],
      [EMERGENCY_EXACT_SOURCE_ADMISSION, [["repaired-flat-treatment", "admitted-treatment"]]],
    ]);
    const preservationPairs = treatmentPreservationStages.get(mechanism.id);
    if (
      progressiveBranch &&
      preservationPairs &&
      preservationPairs.some(([inputPortId, outputPortId]) =>
        !preservesAcrossPorts(
          mechanism,
          inputPortId,
          outputPortId,
          PRODUCT_TREATMENT_IDENTITY_PATHS,
        )
      )
    ) {
      hardFailures.push(
        failure(
          "treatment-selected-member-preservation",
          `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
          "Selection, repair, reification, and admission stages must preserve every complete treatment identity field exactly.",
        ),
      );
    }
    if (progressiveBranch && mechanism.id === REPAIR_WINNER_INPUT_CONSTRUCTION) {
      if (
        !hasCrossPortConstraint(
          mechanism,
          "native-color-occupancy",
          "/nativeRasterId",
          "equals",
          "selected-treatment",
          "/nativeRasterId",
        ) ||
        !preservesAcrossPorts(
          mechanism,
          "native-color-occupancy",
          "repair-winner-input",
          ["/nativeRasterId", "/occupiedColorIds"],
        )
      ) {
        hardFailures.push(
          failure(
            "repair-native-occupancy-continuity-contract",
            `proposedMechanisms.${mechanism.id}.crossPortConstraints`,
            "Repair winner construction must bind selected treatment and repair output to the exact native occupancy raster and occupied-color domain.",
          ),
        );
      }
    }
    if (mechanism.id === REPAIR_RESULT_ROLE_REIFICATION) {
      const actualInputs = productArtifactTypes(mechanism.productInputs);
      const outputs = mechanism.productOutputs.find((branch) => branch.id === "success")?.ports ?? [];
      if (
        !sameMembers(actualInputs, [REPAIR_RESULT]) ||
        outputs.length !== 2 ||
        outputs.some(
          (port) =>
            port.artifactTypeId !== REPAIRED_TREATMENT ||
            !hasTreatmentContentContract(port),
        ) ||
        !outputs.some(
          (port) =>
            port.id === "repaired-flat-treatment" &&
            EMERGENCY_FLAT_WITNESS_PATHS.every((valuePath) =>
              port.identityPaths.includes(valuePath),
            ),
        ) ||
        !outputs.some((port) =>
          port.constraints.some(
            (constraint) =>
              constraint.valuePath === "/treatmentKind" &&
              constraint.comparator === "equals" &&
              constraint.value === "flat",
          ),
        )
      ) {
        hardFailures.push(
          failure(
            "repair-result-reification-contract",
            `proposedMechanisms.${mechanism.id}`,
            "Repair result reification must consume the typed repair result and expose ordinary and explicitly flat repaired treatments with complete identity.",
          ),
        );
      }
    }
    if (mechanism.id === EXACT_SOURCE_INFEASIBILITY_PROOF) {
      const inputTypes = productArtifactTypes(mechanism.productInputs);
      const domainInput = allPorts(mechanism.productInputs).find(
        (port) => port.artifactTypeId === SWAP_LEGAL_DOMAIN,
      );
      const output = successPorts[0];
      const proofArtifact = proposedArtifactById.get(INFEASIBILITY_PROOF);
      const requiredProofPaths = [
        "/candidateDomainId",
        "/paletteDomainId",
        "/selectionObjectiveId",
        "/occupiedColorIds",
        "/repairedTreatmentId",
        "/proof/evaluatedCandidateIds",
        "/proof/zeroFeasibleCount",
        "/proof/exhaustedConstraintWitnesses",
        "/proof/predicate",
        "/proof/certificateKind",
        "/proof/ordinaryImpossibilityCertified",
      ];
      if (
        !sameMembers(inputTypes, [SWAP_LEGAL_DOMAIN, NATIVE_OCCUPANCY, REPAIRED_TREATMENT]) ||
        !domainInput?.identityPaths.includes("/candidateDomainId") ||
        successPorts.length !== 1 ||
        output?.artifactTypeId !== INFEASIBILITY_PROOF ||
        !output.identityPaths.includes("/proof/zeroFeasibleCount") ||
        !output.constraints.some(
          (constraint) =>
            constraint.valuePath === "/proof/zeroFeasibleCount" &&
            constraint.comparator === "equals" &&
            constraint.value === 0,
        ) ||
        !output.constraints.some(
          (constraint) =>
            constraint.valuePath === "/proof/predicate" &&
            constraint.comparator === "equals" &&
            constraint.value === "ordinary-exact-source-impossible",
        ) ||
        !output.constraints.some(
          (constraint) =>
            constraint.valuePath === "/proof/certificateKind" &&
            constraint.comparator === "equals" &&
            constraint.value === "exhaustive-domain-native-occupancy",
        ) ||
        !output.constraints.some(
          (constraint) =>
            constraint.valuePath === "/proof/ordinaryImpossibilityCertified" &&
            constraint.comparator === "equals" &&
            constraint.value === true,
        ) ||
        !requiredProofPaths.every((valuePath) =>
          proofArtifact?.payloadShape.fields.some((field) => field.valuePath === valuePath),
        ) ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/candidateDomainId", "equals", "swap-legal-domain", "/candidateDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/paletteDomainId", "equals", "swap-legal-domain", "/paletteDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/selectionObjectiveId", "equals", "swap-legal-domain", "/selectionObjectiveId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/proof/evaluatedCandidateIds", "equals", "swap-legal-domain", "/candidateIds") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/sourceImageId", "equals", "swap-legal-domain", "/sourceImageId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/nativeRasterId", "equals", "swap-legal-domain", "/nativeRasterId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/nativeRasterId", "equals", "native-color-occupancy", "/nativeRasterId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/occupiedColorIds", "equals", "native-color-occupancy", "/occupiedColorIds") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/candidateDomainId", "equals", "repaired-flat-treatment", "/candidateDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/paletteDomainId", "equals", "repaired-flat-treatment", "/paletteDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/selectionObjectiveId", "equals", "repaired-flat-treatment", "/selectionObjectiveId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/sourceImageId", "equals", "repaired-flat-treatment", "/sourceImageId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/nativeRasterId", "equals", "repaired-flat-treatment", "/nativeRasterId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/repairedTreatmentId", "equals", "repaired-flat-treatment", "/treatmentId")
      ) {
        hardFailures.push(
          failure(
            "emergency-infeasibility-proof-contract",
            `proposedMechanisms.${mechanism.id}`,
            "The infeasibility proof must be domain-specific evidence over the evaluated candidate domain, native occupancy, and zero-feasible selection result; metadata-only proof is forbidden.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === EMERGENCY_EXACT_SOURCE_ADMISSION) {
      const inputTypes = productArtifactTypes(mechanism.productInputs);
      if (
        !sameMembers(inputTypes, [INFEASIBILITY_PROOF, REPAIRED_TREATMENT, NATIVE_OCCUPANCY]) ||
        successPorts.length !== 1 ||
        !successPorts[0] ||
        !hasAdmittedTreatmentContract(successPorts[0], "emergency-flat") ||
        !successPorts[0].identityPaths.includes("/treatmentVariant") ||
        !successPorts[0].constraints.some(
          (constraint) =>
            constraint.valuePath === "/treatmentVariant" &&
            constraint.comparator === "equals" &&
            constraint.value === "emergency-flat",
        ) ||
        !successPorts[0].constraints.some(
          (constraint) =>
            constraint.valuePath === "/admission/zeroFeasibleCount" &&
            constraint.comparator === "equals" &&
            constraint.value === 0,
        ) ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/candidateDomainId", "equals", "repaired-flat-treatment", "/candidateDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/paletteDomainId", "equals", "repaired-flat-treatment", "/paletteDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/selectionObjectiveId", "equals", "repaired-flat-treatment", "/selectionObjectiveId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/sourceImageId", "equals", "repaired-flat-treatment", "/sourceImageId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/nativeRasterId", "equals", "native-color-occupancy", "/nativeRasterId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/nativeRasterId", "equals", "repaired-flat-treatment", "/nativeRasterId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/occupiedColorIds", "equals", "native-color-occupancy", "/occupiedColorIds") ||
        !preservesAcrossPorts(mechanism, "native-color-occupancy", "repaired-flat-treatment", ["/nativeRasterId", "/occupiedColorIds"]) ||
        !preservesAcrossPorts(mechanism, "native-color-occupancy", "admitted-treatment", ["/nativeRasterId", "/occupiedColorIds"]) ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/repairedTreatmentId", "equals", "repaired-flat-treatment", "/treatmentId") ||
        !preservesAcrossPorts(mechanism, "repaired-flat-treatment", "admitted-treatment", EMERGENCY_FLAT_WITNESS_PATHS) ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/candidateDomainId", "equals", "admitted-treatment", "/admission/candidateDomainId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/proof/proofId", "equals", "admitted-treatment", "/admission/infeasibilityProofId") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/proof/evaluatedCandidateIds", "equals", "admitted-treatment", "/admission/evaluatedCandidateIds") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/proof/exhaustedConstraintWitnesses", "equals", "admitted-treatment", "/admission/exhaustedConstraintWitnesses") ||
        !hasCrossPortConstraint(mechanism, "infeasibility-proof", "/proof/zeroFeasibleCount", "equals", "admitted-treatment", "/admission/zeroFeasibleCount")
      ) {
        hardFailures.push(
          failure(
            "emergency-exact-source-admission-contract",
            `proposedMechanisms.${mechanism.id}`,
            "Emergency admission must consume the typed domain infeasibility proof together with a repaired flat treatment and preserve complete treatment content.",
          ),
        );
      }
    }
    if (mechanism.id === "candidate.native-witness-redemption") {
      const completeInputs = allPorts(mechanism.productInputs).filter(
        hasTreatmentContentContract,
      );
      const completeOutputs = mechanism.productOutputs
        .flatMap((branch) => branch.ports)
        .filter(hasTreatmentContentContract);
      if (
        completeOutputs.length > 0 &&
        (completeInputs.length !== 1 ||
          completeOutputs.length !== 1 ||
          completeInputs[0]?.artifactTypeId !== completeOutputs[0]?.artifactTypeId)
      ) {
        hardFailures.push(
          failure(
            "native-witness-complete-treatment-identity",
            `proposedMechanisms.${mechanism.id}`,
            "Native-witness redemption cannot mint complete treatment identity from candidate evidence.",
          ),
        );
      }
    }
    if (progressiveBranch && mechanism.id === "publication.ui-palette-v3-materializer") {
      const admittedInputGroup = mechanism.productInputs[0];
      const successPorts = mechanism.productOutputs.find((branch) => branch.id === "success")?.ports ?? [];
      const uiPalette = successPorts[0];
      const v3Outputs = mechanism.productOutputs.flatMap((branch) =>
        branch.ports.filter((port) => port.artifactTypeId === "artifact.product.ui-palette.v3"),
      );
      const unifiedAdmission =
        admittedInputGroup?.id === "admitted-final-treatment" &&
        admittedInputGroup.mode === "all" &&
        admittedInputGroup.ports.length === 1 &&
        admittedInputGroup.ports[0]?.id === "admitted-treatment" &&
        admittedInputGroup.ports[0]?.artifactTypeId === ADMITTED_TREATMENT &&
        admittedInputGroup.ports[0]?.cardinality === "exactly-one" &&
        hasAdmittedTreatmentContract(admittedInputGroup.ports[0]) &&
        admittedInputGroup.ports[0].identityPaths.includes("/treatmentVariant") &&
        !EMERGENCY_ADMISSION_IDENTITY_PATHS.some((path) =>
          admittedInputGroup.ports[0].identityPaths.includes(path) ||
          admittedInputGroup.ports[0].constraints.some((constraint) => constraint.valuePath === path),
        ) &&
        admittedInputGroup.ports[0].constraints.some(
          (constraint) =>
            constraint.valuePath === "/treatmentVariant" &&
            constraint.comparator === "in" &&
            sameJson(constraint.value, ["flat", "gradient", "emergency-flat"]),
        );
      const validOutput =
        V3_PALETTE_REQUIRED_PATHS.every((valuePath) =>
          uiPalette?.identityPaths.includes(valuePath),
        ) &&
        uiPalette?.constraints.some(
          (constraint) =>
            constraint.valuePath === "/contractVersion" &&
            constraint.comparator === "equals" &&
            constraint.value === "v3-contract-0.1.0",
        ) &&
        ["background", "surface", "foreground", "accent"].every((role) =>
          hasCrossPortConstraint(
            mechanism,
            "admitted-treatment",
            `/roles/${role}/color`,
            "equals",
            "ui-palette",
            `/roles/${role}/hex`,
          ),
        ) &&
        hasCrossPortConstraint(
          mechanism,
          "admitted-treatment",
          "/gradient/stops",
          "equals-when-present",
          "ui-palette",
          "/gradient/stops",
        );
      if (
        mechanism.productInputs.length !== 1 ||
        !unifiedAdmission ||
        successPorts.length !== 1 ||
        !uiPalette ||
        uiPalette?.id !== "ui-palette" ||
        uiPalette?.artifactTypeId !== "artifact.product.ui-palette.v3" ||
        uiPalette.cardinality !== "exactly-one" ||
        !validOutput
        || v3Outputs.length !== 1
      ) {
        hardFailures.push(
          failure(
            "materializer-must-preserve-admitted-treatment-content",
            `proposedMechanisms.${mechanism.id}`,
            "The materializer must consume one unified admitted treatment and emit exactly the typed v3 Palette roles, optional gradient, collapse, contrast, and metadata contract while preserving admitted role and gradient values.",
          ),
        );
      }
    }
    const producesV3Output = mechanism.productOutputs.some((branch) =>
      branch.ports.some((port) => port.artifactTypeId === "artifact.product.ui-palette.v3"),
    );
    if (
      mechanism.id !== "publication.ui-palette-v3-materializer" &&
      producesV3Output
    ) {
      hardFailures.push(
        failure(
          "unauthorized-ui-palette-v3-success-output",
          `proposedMechanisms.${mechanism.id}.productOutputs`,
          "Only publication.ui-palette-v3-materializer may emit artifact.product.ui-palette.v3.",
        ),
      );
    }
    const emitsFinalTreatment = mechanism.productOutputs.some((branch) =>
      branch.ports.some(
        (port) => port.artifactTypeId === "artifact.treatment.final-exact-source-ordinary.v1",
      ),
    );
    if (consumesRawSource && emitsFinalTreatment) {
      hardFailures.push(
        failure(
          "raw-source-final-treatment-bypass",
          `proposedMechanisms.${mechanism.id}`,
          "A proposed mechanism cannot bypass mechanism-specific product handoffs from raw artwork source to final treatment.",
        ),
      );
    }
    const successProductPorts = [
      ...allPorts(mechanism.productInputs),
      ...mechanism.productOutputs
        .filter((branch) => branch.id === "success")
        .flatMap((branch) => branch.ports),
    ];
    successProductPorts.forEach((port, index) =>
      validatePortDefinition(
        port,
        `proposedMechanisms.${mechanism.id}.productPorts[${index}]`,
        "product",
        artifactById,
        proposedArtifactById,
        aliases,
        demotions,
        hardFailures,
      ),
    );
    mechanism.productOutputs
      .filter((branch) => branch.id !== "success")
      .flatMap((branch) => branch.ports)
      .forEach((port, index) =>
        validatePortDefinition(
          port,
          `proposedMechanisms.${mechanism.id}.nonSuccessPorts[${index}]`,
          "readiness",
          artifactById,
          proposedArtifactById,
          aliases,
          demotions,
          hardFailures,
        ),
      );
    for (const configRef of mechanism.readiness.fixedConfigRefs) {
      if (!fixedConfigById.has(configRef)) {
        hardFailures.push(
          failure("unknown-required-fixed-config", `proposedMechanisms.${mechanism.id}.readiness.fixedConfigRefs`, configRef),
        );
      }
    }
    mechanism.readiness.requiredNonProductInputs.forEach((port, index) =>
      validatePortDefinition(
        port,
        `proposedMechanisms.${mechanism.id}.readiness.requiredNonProductInputs[${index}]`,
        "readiness",
        artifactById,
        proposedArtifactById,
        aliases,
        demotions,
        hardFailures,
      ),
    );
    const readinessInputIds = mechanism.readiness.requiredNonProductInputs.map((port) => port.id);
    if (new Set(readinessInputIds).size !== readinessInputIds.length) {
      hardFailures.push(
        failure(
          "duplicate-proposed-readiness-input",
          `proposedMechanisms.${mechanism.id}.readiness.requiredNonProductInputs`,
          mechanism.id,
        ),
      );
    }
    const plannedSidecars = sidecars(manifest, mechanism.id);
    if (
      mechanism.sidecars.fixtureId !== plannedSidecars.fixtureId ||
      mechanism.sidecars.visualizationId !== plannedSidecars.visualizationId ||
      mechanism.sidecars.humanScoreId !== plannedSidecars.humanScoreId ||
      mechanism.sidecars.availability !== "planned-unavailable" ||
      mechanism.readiness.implementationAvailable ||
      mechanism.readiness.fixtureAvailable ||
      mechanism.readiness.visualizationAvailable ||
      mechanism.readiness.humanScoreAvailable
    ) {
      hardFailures.push(
        failure(
          "invalid-proposed-sidecar-plan",
          `proposedMechanisms.${mechanism.id}.sidecars`,
          "Planned sidecar IDs and availability must match policy; implementation and evidence must remain unavailable.",
        ),
      );
    }
  }
  const moduleIds = (manifest.recipeModules ?? []).map((module) => module.id);
  if (new Set(moduleIds).size !== moduleIds.length) {
    hardFailures.push(failure("duplicate-recipe-module", "recipeModules", "IDs must be unique."));
  }
  const recipeIds = manifest.recipes.map((recipe) => recipe.id);
  if (new Set(recipeIds).size !== recipeIds.length) {
    hardFailures.push(failure("duplicate-recipe", "recipes", "Recipe IDs must be unique."));
  }
  if (hardFailures.length > 0) formatHardFailures(hardFailures);

  const allCurrentContracts = new Map<string, PlannedContract>();
  for (const entry of manifest.currentMechanisms) {
    const mechanism = currentById.get(entry.mechanismId);
    if (!mechanism) continue;
    allCurrentContracts.set(
      mechanism.id,
        currentProductContract(mechanism, artifactById, demotions, entry),
    );
  }
  const contracts = new Map<string, PlannedContract>();
  for (const entry of manifest.currentMechanisms) {
    if (entry.disposition !== "retained") continue;
    const contract = allCurrentContracts.get(entry.mechanismId);
    if (contract) contracts.set(entry.mechanismId, contract);
  }
  manifest.proposedMechanisms.forEach((mechanism) =>
    contracts.set(mechanism.id, proposedContract(mechanism)),
  );
  const declaredDisposition = new Map<string, string>([
    ...manifest.currentMechanisms.map(
      (entry) => [entry.mechanismId, entry.disposition] as const,
    ),
    ...manifest.proposedMechanisms.map((mechanism) => [mechanism.id, "proposed"] as const),
  ]);
  const recipeAnalyses = manifest.recipes.map((recipe) =>
    analyzeRecipe(
      manifest,
      recipe,
      contracts,
      allCurrentContracts,
      declaredDisposition,
      artifactById,
      proposedArtifactById,
      fixedConfigById,
      readinessProviderById,
    ),
  );
  const recipeById = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
  for (const recipeAnalysis of recipeAnalyses) {
    if (!recipeAnalysis.successful) continue;
    const recipe = recipeById.get(recipeAnalysis.recipeId)!;
    const mechanismIds = [...new Set(recipe.steps.map((step) => step.mechanismId))];
    recipeAnalysis.essentialMechanismIds = mechanismIds
      .filter((mechanismId) => {
        const reduced = recipeWithoutMechanism(recipe, mechanismId);
        return !recipeProductClosureHolds(manifest, reduced, contracts);
      })
      .sort(compareCodeUnits);
  }
  const successful = recipeAnalyses.filter((recipe) => recipe.successful);

  const slotByMechanism = new Map<string, string>();
  const slotMembers = new Map<string, string[]>();
  const routeSemanticFailures: BranchFailure[] = [];
  const addSlotMember = (mechanismId: string, slotId: string): void => {
    slotByMechanism.set(mechanismId, slotId);
    const members = slotMembers.get(slotId) ?? [];
    members.push(mechanismId);
    slotMembers.set(slotId, members);
  };
  for (const entry of manifest.currentMechanisms) {
    if (!entry.interchangeabilitySlot) continue;
    if (entry.disposition !== "retained") {
      routeSemanticFailures.push(
        failure(
          "inactive-interchangeability-member",
          `currentMechanisms.${entry.mechanismId}.interchangeabilitySlot`,
          "Only retained current mechanisms may be declared as interchangeable product alternatives.",
        ),
      );
      continue;
    }
    addSlotMember(entry.mechanismId, entry.interchangeabilitySlot);
  }
  for (const mechanism of manifest.proposedMechanisms) {
    if (mechanism.interchangeabilitySlot) {
      addSlotMember(mechanism.id, mechanism.interchangeabilitySlot);
    }
  }

  const interchangeabilitySlots: BranchAnalysis["interchangeabilitySlots"] = [];
  const substitutionRecipePairs = new Set<string>();
  for (const [slotId, unsortedMemberIds] of [...slotMembers.entries()].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    const mechanismIds = [...new Set(unsortedMemberIds)].sort(compareCodeUnits);
    if (mechanismIds.length < 2) {
      routeSemanticFailures.push(
        failure(
          "underspecified-interchangeability-slot",
          `interchangeabilitySlots.${slotId}`,
          `${slotId} declares ${mechanismIds.length} active member; at least two genuine alternatives are required.`,
        ),
      );
    }
    const memberSet = new Set(mechanismIds);
    const cleanCandidates = successful.flatMap((recipeAnalysis) => {
      const present = recipeAnalysis.contributingMechanismIds.filter((mechanismId) =>
        memberSet.has(mechanismId),
      );
      if (
        present.length !== 1 ||
        !recipeAnalysis.essentialMechanismIds.includes(present[0]!)
      ) {
        return [];
      }
      const recipe = recipeById.get(recipeAnalysis.recipeId)!;
      return [{
        mechanismId: present[0]!,
        recipeId: recipeAnalysis.recipeId,
        recipe,
      }];
    });
    const cleanWitnesses = mechanismIds.map((mechanismId) => ({
      mechanismId,
      recipeIds: cleanCandidates
        .filter((candidate) => candidate.mechanismId === mechanismId)
        .map((candidate) => candidate.recipeId)
        .sort(compareCodeUnits),
    }));
    const comparisons: BranchAnalysis["interchangeabilitySlots"][number]["comparisons"] = [];
    const candidatesByMechanism = new Map(
      mechanismIds.map((mechanismId) => [
        mechanismId,
        cleanCandidates
          .filter((candidate) => candidate.mechanismId === mechanismId)
          .sort((left, right) =>
            left.recipe.steps.length - right.recipe.steps.length ||
            compareCodeUnits(left.recipeId, right.recipeId),
          ),
      ]),
    );
    for (let leftIndex = 0; leftIndex < mechanismIds.length; leftIndex += 1) {
      const leftMechanismId = mechanismIds[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < mechanismIds.length; rightIndex += 1) {
        const rightMechanismId = mechanismIds[rightIndex]!;
        let matched:
          | {
              left: (typeof cleanCandidates)[number];
              right: (typeof cleanCandidates)[number];
              normalizedSurroundingSha256: string;
            }
          | undefined;
        for (const left of candidatesByMechanism.get(leftMechanismId) ?? []) {
          for (const right of candidatesByMechanism.get(rightMechanismId) ?? []) {
            const normalizedSurroundingSha256 = normalizedRecipeSurroundingPair(
              left.recipe,
              right.recipe,
              memberSet,
            );
            if (normalizedSurroundingSha256) {
              matched = { left, right, normalizedSurroundingSha256 };
              break;
            }
          }
          if (matched) break;
        }
        if (!matched) continue;
        comparisons.push({
          leftMechanismId,
          leftRecipeId: matched.left.recipeId,
          rightMechanismId,
          rightRecipeId: matched.right.recipeId,
          normalizedSurroundingSha256: matched.normalizedSurroundingSha256,
        });
        substitutionRecipePairs.add(
          [matched.left.recipeId, matched.right.recipeId].sort(compareCodeUnits).join("\u0000"),
        );
      }
    }
    comparisons.sort((left, right) =>
      compareCodeUnits(
        `${left.leftMechanismId}\u0000${left.leftRecipeId}\u0000${left.rightMechanismId}\u0000${left.rightRecipeId}`,
        `${right.leftMechanismId}\u0000${right.leftRecipeId}\u0000${right.rightMechanismId}\u0000${right.rightRecipeId}`,
      ),
    );
    const comparedMembers = new Set(
      comparisons.flatMap((comparison) => [comparison.leftMechanismId, comparison.rightMechanismId]),
    );
    for (const mechanismId of mechanismIds) {
      if (!comparedMembers.has(mechanismId)) {
        routeSemanticFailures.push(
          failure(
            "missing-clean-substitution-comparison",
            `interchangeabilitySlots.${slotId}.${mechanismId}`,
            `${mechanismId} has no sibling route with the same normalized surroundings and a different ${slotId} alternative.`,
          ),
        );
      }
    }
    interchangeabilitySlots.push({ slotId, mechanismIds, cleanWitnesses, comparisons });
  }

  for (const recipeAnalysis of successful) {
    const recipe = recipeById.get(recipeAnalysis.recipeId)!;
    const declaredCompositionSlots = new Set(recipe.compositionTestSlots ?? []);
    for (const slotId of declaredCompositionSlots) {
      if (!slotMembers.has(slotId)) {
        routeSemanticFailures.push(
          failure(
            "unknown-composition-test-slot",
            `recipes.${recipe.id}.compositionTestSlots`,
            slotId,
          ),
        );
      }
    }
    for (const [slotId, members] of slotMembers) {
      const present = [...new Set(
        recipeAnalysis.contributingMechanismIds.filter((mechanismId) => members.includes(mechanismId)),
      )];
      if (present.length > 1 && !declaredCompositionSlots.has(slotId)) {
        routeSemanticFailures.push(
          failure(
            "bundled-interchangeability-competitors",
            `recipes.${recipe.id}`,
            `${present.join(", ")} share ${slotId}; a substitution witness may contain only one unless the route explicitly tests composition.`,
          ),
        );
      }
      if (declaredCompositionSlots.has(slotId) && present.length < 2) {
        routeSemanticFailures.push(
          failure(
            "invalid-composition-test-slot",
            `recipes.${recipe.id}.compositionTestSlots`,
            `${slotId} composition requires at least two members in the route.`,
          ),
        );
      }
      if (declaredCompositionSlots.has(slotId)) {
        const slotAnalysis = interchangeabilitySlots.find((entry) => entry.slotId === slotId);
        const compared = new Set(
          slotAnalysis?.comparisons.flatMap((comparison) => [
            comparison.leftMechanismId,
            comparison.rightMechanismId,
          ]) ?? [],
        );
        for (const mechanismId of present) {
          if (!compared.has(mechanismId)) {
            routeSemanticFailures.push(
              failure(
                "composition-without-clean-substitution",
                `recipes.${recipe.id}.compositionTestSlots`,
                `${mechanismId} lacks a separate clean ${slotId} substitution comparison.`,
              ),
            );
          }
        }
      }
    }
  }
  if (routeSemanticFailures.length > 0) formatHardFailures(routeSemanticFailures);

  const isCompositionSiblingPair = (
    left: RecipeAnalysis,
    right: RecipeAnalysis,
  ): boolean => {
    for (const [composition, sibling] of [[left, right], [right, left]] as const) {
      const compositionRecipe = recipeById.get(composition.recipeId)!;
      const siblingRecipe = recipeById.get(sibling.recipeId)!;
      for (const slotId of compositionRecipe.compositionTestSlots ?? []) {
        const members = new Set(slotMembers.get(slotId) ?? []);
        const compositionMembers = composition.contributingMechanismIds.filter((mechanismId) =>
          members.has(mechanismId),
        );
        const siblingMembers = sibling.contributingMechanismIds.filter((mechanismId) =>
          members.has(mechanismId),
        );
        if (
          new Set(compositionMembers).size > 1 &&
          new Set(siblingMembers).size === 1 &&
          normalizedRecipeSurroundingPair(compositionRecipe, siblingRecipe, members)
        ) {
          return true;
        }
      }
    }
    return false;
  };
  const cloneFailures: BranchFailure[] = [];
  for (let leftIndex = 0; leftIndex < recipeAnalyses.length; leftIndex += 1) {
    const left = recipeAnalyses[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < recipeAnalyses.length; rightIndex += 1) {
      const right = recipeAnalyses[rightIndex]!;
      const leftCounts = new Map<string, number>();
      const rightCounts = new Map<string, number>();
      left.typedStepSignatures.forEach((signature) =>
        leftCounts.set(signature, (leftCounts.get(signature) ?? 0) + 1),
      );
      right.typedStepSignatures.forEach((signature) =>
        rightCounts.set(signature, (rightCounts.get(signature) ?? 0) + 1),
      );
      const signatures = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
      const intersection = [...signatures].reduce(
        (count, signature) =>
          count + Math.min(leftCounts.get(signature) ?? 0, rightCounts.get(signature) ?? 0),
        0,
      );
      const symmetricDifference = [...signatures].reduce(
        (count, signature) =>
          count + Math.abs((leftCounts.get(signature) ?? 0) - (rightCounts.get(signature) ?? 0)),
        0,
      );
      const recipePair = [left.recipeId, right.recipeId].sort(compareCodeUnits).join("\u0000");
      if (
        intersection >= 3 &&
        symmetricDifference <= 2 &&
        !substitutionRecipePairs.has(recipePair) &&
        !isCompositionSiblingPair(left, right)
      ) {
        cloneFailures.push(
          failure(
            "clone-recipe-family",
            `recipes.${right.recipeId}`,
            `${left.recipeId} and ${right.recipeId} differ by only ${symmetricDifference} normalized consumed typed step signatures.`,
          ),
        );
      }
    }
  }
  if (cloneFailures.length > 0) formatHardFailures(cloneFailures);
  const activeMechanismCount =
    manifest.currentMechanisms.filter((entry) => entry.disposition === "retained").length +
    manifest.proposedMechanisms.length;
  if (activeMechanismCount >= 10) {
    const packed = successful.filter(
      (recipe) => recipe.essentialMechanismIds.length >= Math.ceil(activeMechanismCount * 0.8),
    );
    if (packed.length > 0) {
      formatHardFailures(
        packed.map((recipe) =>
          failure(
            "packed-recipe-family",
            `recipes.${recipe.recipeId}`,
            `${recipe.essentialMechanismIds.length} of ${activeMechanismCount} active mechanisms are essential in one route; independent mechanism witnesses must use narrower permutations.`,
          ),
        ),
      );
    }
  }

  if (manifest.requireCompleteActiveWitnesses) {
    const consumedProposedOutputs = new Set<string>();
    const witnessedProposedMechanisms = new Set(
      successful.flatMap((recipe) => recipe.essentialMechanismIds),
    );
    for (const recipe of successful) {
      const mechanismByInstance = new Map(
        recipe.expandedSteps.map((step) => [step.instanceId, step.mechanismId]),
      );
      for (const output of recipe.consumedProductOutputs) {
        const mechanismId = mechanismByInstance.get(output.instanceId);
        if (mechanismId) consumedProposedOutputs.add(`${mechanismId}\u0000${output.portId}`);
      }
    }
    const unusedOutputs = manifest.proposedMechanisms.flatMap((mechanism) =>
      (mechanism.productOutputs.find((branch) => branch.id === "success")?.ports ?? [])
        .filter(
          (port) =>
            witnessedProposedMechanisms.has(mechanism.id) &&
            !consumedProposedOutputs.has(`${mechanism.id}\u0000${port.id}`),
        )
        .map((port) => ({ mechanismId: mechanism.id, port })),
    );
    if (unusedOutputs.length > 0) {
      formatHardFailures(
        unusedOutputs.map(({ mechanismId, port }) =>
          failure(
            "unconsumed-proposed-product-output",
            `proposedMechanisms.${mechanismId}.productOutputs.${port.id}`,
            `${mechanismId}:${port.id}:${port.artifactTypeId} is not consumed by any type-closed planned recipe.`,
          ),
        ),
      );
    }
  }
  const witnesses = new Map<string, string[]>();
  for (const recipe of successful) {
    for (const mechanismId of recipe.essentialMechanismIds) {
      const rows = witnesses.get(mechanismId) ?? [];
      rows.push(recipe.recipeId);
      witnesses.set(mechanismId, rows);
    }
  }
  const effectiveDispositions: BranchAnalysis["effectiveDispositions"] = [];
  for (const entry of manifest.currentMechanisms) {
    const witnessRecipeIds = (witnesses.get(entry.mechanismId) ?? []).sort(compareCodeUnits);
    const effectiveDisposition =
      entry.disposition === "retained" && witnessRecipeIds.length === 0
        ? "unrouted"
        : entry.disposition;
    effectiveDispositions.push({
      mechanismId: entry.mechanismId,
      origin: "current",
      declaredDisposition: entry.disposition,
      effectiveDisposition,
      reason:
        effectiveDisposition === "unrouted"
          ? "Unrouted: no type-closed planned recipe requires this active mechanism for source-to-goal closure."
          : entry.reason,
      witnessRecipeIds,
      ...(entry.workbenchLayer ? { workbenchLayer: entry.workbenchLayer } : {}),
      sidecars: sidecars(manifest, entry.mechanismId),
    });
  }
  for (const mechanism of manifest.proposedMechanisms) {
    const witnessRecipeIds = (witnesses.get(mechanism.id) ?? []).sort(compareCodeUnits);
    effectiveDispositions.push({
      mechanismId: mechanism.id,
      origin: "proposed",
      declaredDisposition: "proposed",
      effectiveDisposition: witnessRecipeIds.length > 0 ? "proposed" : "unrouted",
      reason:
        witnessRecipeIds.length > 0
          ? "Removing every instance of this proposal breaks source-to-goal closure in at least one type-closed planned recipe."
          : "Unrouted: removing this proposal from every containing route does not break source-to-goal closure.",
      witnessRecipeIds,
      workbenchLayer: mechanism.workbenchLayer,
      sidecars: sidecars(manifest, mechanism.id),
    });
  }
  effectiveDispositions.sort((left, right) => compareCodeUnits(left.mechanismId, right.mechanismId));
  const unrouted = effectiveDispositions.filter(
    (entry) => entry.effectiveDisposition === "unrouted",
  );
  const unresolvedActiveContracts = unrouted.map((entry) => {
    const contract = contracts.get(entry.mechanismId);
    return {
      mechanismId: entry.mechanismId,
      inputPortIds: contract
        ? allPorts(contract.productInputs).map((port) => port.id).sort(compareCodeUnits)
        : [],
      outputPortIds: contract
        ? (outputBranch(contract, "success")?.ports ?? [])
            .map((port) => port.id)
            .sort(compareCodeUnits)
        : [],
    };
  });
  if (manifest.requireCompleteActiveWitnesses && unrouted.length > 0) {
    formatHardFailures(
      unresolvedActiveContracts.map((entry) =>
        failure(
          "unrouted-active-mechanism",
          `mechanisms.${entry.mechanismId}`,
          `${entry.mechanismId} has no essential source-to-goal witness; unresolved input ports: [${entry.inputPortIds.join(", ")}]; unresolved success output ports: [${entry.outputPortIds.join(", ")}].`,
        ),
      ),
    );
  }
  const currentConnected = effectiveDispositions
    .filter(
      (entry) =>
        entry.origin === "current" &&
        entry.effectiveDisposition === "retained" &&
        entry.witnessRecipeIds.length > 0,
    )
    .map((entry) => entry.mechanismId);
  const proposedConnected = effectiveDispositions
    .filter(
      (entry) =>
        entry.origin === "proposed" &&
        entry.effectiveDisposition === "proposed" &&
        entry.witnessRecipeIds.length > 0,
    )
    .map((entry) => entry.mechanismId);
  const workbenchMechanisms: BranchAnalysis["workbenchMechanisms"] = [
    ...manifest.currentMechanisms
      .filter((entry) => entry.disposition === "retained")
      .map((entry) => ({
        mechanismId: entry.mechanismId,
        origin: "current" as const,
        workbenchLayer: entry.workbenchLayer!,
      })),
    ...manifest.proposedMechanisms.map((mechanism) => ({
      mechanismId: mechanism.id,
      origin: "proposed" as const,
      workbenchLayer: mechanism.workbenchLayer,
    })),
  ].sort((left, right) => compareCodeUnits(left.mechanismId, right.mechanismId));
  const workbenchLayers: BranchAnalysis["workbenchLayers"] = WORKBENCH_LAYERS.map(
    (workbenchLayer) => ({
      workbenchLayer,
      currentMechanismIds: workbenchMechanisms
        .filter((entry) =>
          entry.origin === "current" && entry.workbenchLayer === workbenchLayer,
        )
        .map((entry) => entry.mechanismId),
      proposedMechanismIds: workbenchMechanisms
        .filter((entry) =>
          entry.origin === "proposed" && entry.workbenchLayer === workbenchLayer,
        )
        .map((entry) => entry.mechanismId),
    }),
  );
  const sidecarEntries = manifest.currentMechanisms.filter(
    (entry) => entry.disposition === "sidecar",
  );
  const currentDemoted = sidecarEntries.filter((entry) => {
    const mechanism = currentById.get(entry.mechanismId);
    return (
      mechanism?.focusClass === "product-transformation" ||
      mechanism?.focusClass === "product-admission"
    );
  }).length;
  const materializers = graph.mechanisms.filter((mechanism) =>
    mechanism.outputPorts.some((port) => port.artifactTypeId === manifest.goalArtifactTypeId),
  );
  const proposedProductArtifacts = manifest.proposedArtifacts.filter(
    (artifact) => artifact.kind === "product",
  ).length;
  return {
    documentKind: "capability-branch-analysis",
    schemaVersion: "1.0.0",
    generatedFrom: "research/v4/capability-graph/data/branch-plan.json",
    branchPlanDigest: {
      algorithm: "sha256",
      basis: "canonical-json",
      sha256: sha256(serializeCanonical(rawManifest)),
    },
    capabilityGraphDigest: {
      algorithm: "sha256",
      basis: "canonical-json-utf8",
      sha256: sha256(capabilityGraphSerialization),
    },
    builtMetrics: {
      currentMechanisms: graph.mechanisms.length,
      primaryMechanisms: graph.analysis.productFocus.primaryMechanismIds.length,
      primaryProductArtifacts: graph.analysis.productFocus.primaryArtifactIds.length,
      primaryIncidences: graph.analysis.productFocus.primaryIncidences.length,
      sourceReachablePrimaryMechanisms: deriveBuiltSourceReachable(graph),
      goalReachablePrimaryMechanisms: deriveBuiltGoalReachable(
        graph,
        manifest.goalArtifactTypeId,
      ),
      materializers: materializers.length,
    },
    inventoryCounts: {
      currentRetained: manifest.currentMechanisms.filter(
        (entry) => entry.disposition === "retained",
      ).length,
      currentCondemned: manifest.currentMechanisms.filter(
        (entry) => entry.disposition === "condemned",
      ).length,
      currentDemoted,
      existingSidecars: sidecarEntries.length - currentDemoted,
      totalSidecarInspectors: sidecarEntries.length,
      proposedMechanisms: manifest.proposedMechanisms.length,
      fullPlannedRegistry: graph.mechanisms.length + manifest.proposedMechanisms.length,
      proposedProductArtifacts,
      proposedSidecarArtifacts: manifest.proposedArtifacts.length - proposedProductArtifacts,
    },
    recipeCounts: {
      declared: manifest.recipes.length,
      successful: successful.length,
      executionReady: successful.filter((recipe) => recipe.executionReadiness.ready).length,
    },
    plannedConnected: {
      currentMechanismIds: currentConnected,
      proposedMechanismIds: proposedConnected,
    },
    workbenchMechanisms,
    workbenchLayers,
    unresolvedActiveContracts,
    essentialWitnesses: [...witnesses.entries()]
      .map(([mechanismId, recipeIds]) => ({
        mechanismId,
        recipeIds: [...recipeIds].sort(compareCodeUnits),
      }))
      .sort((left, right) => compareCodeUnits(left.mechanismId, right.mechanismId)),
    interchangeabilitySlots,
    effectiveDispositions,
    recipes: recipeAnalyses,
    warnings: [
      "The branch plan is planned data, not the built graph or a selected architecture.",
      "A mechanism is included only when removing every instance and pruning its dead branch breaks source-to-goal closure in at least one type-closed recipe.",
      "Interchangeability comparisons are derived from clean sibling routes with equal normalized surroundings; recipe labels do not establish substitution.",
      "Execution readiness requires registered, available, typed configuration and non-product producers in addition to implementation and sidecar availability.",
    ],
  };
}

function list(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "None";
}

export function buildBranchResearchMarkdown(
  manifest: BranchPlanManifest,
  analysis: BranchAnalysis,
  graph: CapabilityGraph,
): string {
  const proposedById = new Map(manifest.proposedMechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const currentById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const currentEntryById = new Map(
    manifest.currentMechanisms.map((entry) => [entry.mechanismId, entry]),
  );
  const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
  const connected = analysis.effectiveDispositions.filter(
    (entry) => entry.effectiveDisposition === "retained" || entry.effectiveDisposition === "proposed",
  );
  const condemned = analysis.effectiveDispositions.filter(
    (entry) => entry.effectiveDisposition === "condemned",
  );
  const unrouted = analysis.effectiveDispositions.filter(
    (entry) => entry.effectiveDisposition === "unrouted",
  );
  const demotions = new Set(manifest.productArtifactDemotions);
  const contractById = new Map<string, PlannedContract>();
  for (const entry of connected) {
    const proposed = proposedById.get(entry.mechanismId);
    const current = currentById.get(entry.mechanismId);
    if (proposed) {
      contractById.set(entry.mechanismId, proposedContract(proposed));
    } else if (current) {
      contractById.set(
        entry.mechanismId,
        currentProductContract(
          current,
          artifactById,
          demotions,
          currentEntryById.get(entry.mechanismId),
        ),
      );
    }
  }

  const cell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const inputText = (contract: PlannedContract): string =>
    contract.productInputs.length === 0
      ? "None"
      : contract.productInputs
          .map(
            (group) =>
              `group \`${group.id}\` [${group.mode}]: ${group.ports
                .map(
                  (port) =>
                    `\`${port.id}\` -> \`${port.artifactTypeId}\` [${port.cardinality}]`,
                )
                .join(" / ")}`,
          )
          .join("<br>");
  const outputText = (
    contract: PlannedContract,
    branchFilter?: BranchOutputBranch["id"],
  ): string => {
    const branches = branchFilter
      ? contract.outputBranches.filter((branch) => branch.id === branchFilter)
      : contract.outputBranches;
    return branches.length === 0
      ? "None"
      : branches
          .map(
            (branch) =>
              `branch \`${branch.id}\`: ${branch.ports
                .map(
                  (port) =>
                    `\`${port.id}\` -> \`${port.artifactTypeId}\` [${port.cardinality}]`,
                )
                .join(" / ")}`,
          )
          .join("<br>");
  };
  const implementationStatus = (mechanismId: string): string => {
    if (proposedById.has(mechanismId)) return "Proposed; implementation unavailable";
    const states = currentById.get(mechanismId)?.censusStatus.implementationStates ?? [];
    return `Existing repository state: ${states.length > 0 ? states.join(", ") : "unspecified"}`;
  };
  const originLabel = (mechanismId: string): "Existing" | "Proposed" =>
    proposedById.has(mechanismId) ? "Proposed" : "Existing";

  interface ReportProductEdge {
    producerMechanismId: string;
    producerOrigin: "Declared source" | "Existing" | "Proposed";
    producerPortId: string;
    artifactTypeId: string;
    consumerMechanismId: string;
    consumerPortId: string;
  }
  const productEdgeByKey = new Map<string, ReportProductEdge>();
  for (const recipe of analysis.recipes.filter((entry) => entry.successful)) {
    const stepByInstance = new Map(recipe.expandedSteps.map((step) => [step.instanceId, step]));
    for (const consumerStep of recipe.expandedSteps) {
      const consumerContract = contractById.get(consumerStep.mechanismId);
      if (!consumerContract) continue;
      for (const binding of consumerStep.productBindings) {
        const consumerPort = allPorts(consumerContract.productInputs).find(
          (port) => port.id === binding.consumerPortId,
        );
        if (!consumerPort) continue;
        const producerStep = stepByInstance.get(binding.producerInstanceId);
        const edge: ReportProductEdge = {
          producerMechanismId: producerStep?.mechanismId ?? "$source",
          producerOrigin: producerStep
            ? originLabel(producerStep.mechanismId)
            : "Declared source",
          producerPortId: binding.producerPortId,
          artifactTypeId: consumerPort.artifactTypeId,
          consumerMechanismId: consumerStep.mechanismId,
          consumerPortId: binding.consumerPortId,
        };
        const key = [
          edge.producerMechanismId,
          edge.producerPortId,
          edge.artifactTypeId,
          edge.consumerMechanismId,
          edge.consumerPortId,
        ].join("\u0000");
        productEdgeByKey.set(key, edge);
      }
    }
  }
  const productEdges = [...productEdgeByKey.values()].sort((left, right) =>
    compareCodeUnits(
      `${left.producerMechanismId}:${left.producerPortId}:${left.consumerMechanismId}:${left.consumerPortId}`,
      `${right.producerMechanismId}:${right.producerPortId}:${right.consumerMechanismId}:${right.consumerPortId}`,
    ),
  );
  const downstreamText = (mechanismId: string): string => {
    const edges = productEdges.filter((edge) => edge.producerMechanismId === mechanismId);
    if (edges.length > 0) {
      return edges
        .map(
          (edge) =>
            `\`${edge.producerPortId}\` -> \`${edge.artifactTypeId}\` -> \`${edge.consumerMechanismId}:${edge.consumerPortId}\``,
        )
        .join("<br>");
    }
    const contract = contractById.get(mechanismId);
    const goalPort = contract?.outputBranches
      .flatMap((branch) => branch.ports)
      .find((port) => port.artifactTypeId === manifest.goalArtifactTypeId);
    return goalPort
      ? `\`${goalPort.id}\` -> \`${goalPort.artifactTypeId}\` -> terminal product goal (no downstream mechanism)`
      : "No direct downstream product consumer in a type-closed planned recipe";
  };
  const upstreamText = (mechanismId: string): string => {
    const edges = productEdges.filter((edge) => edge.consumerMechanismId === mechanismId);
    return edges.length === 0
      ? "None"
      : edges
          .map(
            (edge) =>
              `\`${edge.producerMechanismId}:${edge.producerPortId}\` (${edge.producerOrigin}) -> \`${edge.artifactTypeId}\` -> \`${edge.consumerMechanismId}:${edge.consumerPortId}\``,
          )
          .join("<br>");
  };

  const missingMechanismRows = manifest.proposedMechanisms.map((mechanism) => {
    const contract = contractById.get(mechanism.id)!;
    return `| \`${mechanism.id}\` | ${cell(mechanism.workbenchLayer)} | ${cell(inputText(contract))} | ${cell(mechanism.operation)} | ${cell(outputText(contract, "success"))} | ${cell(downstreamText(mechanism.id))} | Proposed; implementation unavailable |`;
  });
  const missingHandoffRows = manifest.proposedMechanisms.map(
    (mechanism) =>
      `| ${cell(upstreamText(mechanism.id))} | \`${mechanism.id}\`: ${cell(mechanism.operation)} | ${cell(downstreamText(mechanism.id))} |`,
  );
  const mechanismRows = connected.map((entry) => {
    const contract = contractById.get(entry.mechanismId)!;
    return `| \`${entry.mechanismId}\` | ${originLabel(entry.mechanismId)} | ${entry.workbenchLayer} | ${implementationStatus(entry.mechanismId)} | ${cell(inputText(contract))} | ${cell(contract.operation)} | ${cell(outputText(contract))} | ${cell(downstreamText(entry.mechanismId))} | ${cell(list(entry.witnessRecipeIds))} | \`${entry.sidecars.fixtureId}\` (planned, unavailable) | \`${entry.sidecars.visualizationId}\` (planned, unavailable) | \`${entry.sidecars.humanScoreId}\` (planned, unavailable) |`;
  });
  const workbenchLayerRows = analysis.workbenchLayers.map((layer) => {
    const mechanismIds = [...layer.currentMechanismIds, ...layer.proposedMechanismIds]
      .sort(compareCodeUnits);
    return `| \`${layer.workbenchLayer}\` | ${layer.currentMechanismIds.length} | ${layer.proposedMechanismIds.length} | ${mechanismIds.length} | ${list(mechanismIds)} |`;
  });

  const successfulRecipes = analysis.recipes.filter((recipe) => recipe.successful);
  const declaredRecipeById = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
  const comparisonsByRecipe = new Map<string, string[]>();
  for (const slot of analysis.interchangeabilitySlots) {
    for (const comparison of slot.comparisons) {
      const description = `\`${slot.slotId}\`: \`${comparison.leftMechanismId}\` in \`${comparison.leftRecipeId}\` <-> \`${comparison.rightMechanismId}\` in \`${comparison.rightRecipeId}\` (normalized surroundings \`${comparison.normalizedSurroundingSha256}\`)`;
      for (const recipeId of [comparison.leftRecipeId, comparison.rightRecipeId]) {
        const rows = comparisonsByRecipe.get(recipeId) ?? [];
        rows.push(description);
        comparisonsByRecipe.set(recipeId, rows);
      }
    }
  }
  const recipeDetails = successfulRecipes.flatMap((recipe) => {
    const declaredRecipe = declaredRecipeById.get(recipe.recipeId)!;
    const comparisons = [...new Set(comparisonsByRecipe.get(recipe.recipeId) ?? [])];
    return [
      "<details>",
      `<summary><code>${recipe.recipeId}</code> (${recipe.family})</summary>`,
      "",
      `- Implementation status: planned; execution readiness ${recipe.executionReadiness.ready ? "ready" : "unavailable"}.`,
      `- Essential by removal test: ${list(recipe.essentialMechanismIds)}.`,
      `- Explicit composition tests: ${list(declaredRecipe.compositionTestSlots ?? [])}.`,
      `- Analyzer-derived clean substitutions: ${comparisons.length > 0 ? comparisons.join("<br>") : "None"}.`,
      "- Ordered route sequence:",
      "",
      ...recipe.expandedSteps.map(
        (step, index) =>
          `${index + 1}. \`${step.mechanismId}\` (instance \`${step.instanceId}\`; branch \`${step.selectedOutputBranch}\`)`,
      ),
      "",
      "</details>",
      "",
    ];
  });

  const condemnedRows = condemned.map((entry) => {
    const mechanism = currentById.get(entry.mechanismId)!;
    const disposition = currentEntryById.get(entry.mechanismId)!;
    const inputs = mechanism.inputPorts
      .map(
        (port) =>
          `\`${port.id}\` -> \`${port.artifactTypeId}\` [${port.requirement}; ${port.cardinality}]`,
      )
      .join("<br>");
    const outputs = mechanism.outputPorts
      .map(
        (port) =>
          `branch \`success\`: \`${port.id}\` -> \`${port.artifactTypeId}\` [${port.cardinality}]`,
      )
      .join("<br>");
    const sources = (disposition.evidenceRefs ?? [
      `${mechanism.source.path}:${mechanism.source.headingLine}`,
    ])
      .map((source) => `\`${source}\``)
      .join("<br>");
    return `| \`${entry.mechanismId}\` | Existing | ${cell(inputs)} | ${cell(outputs)} | ${cell(entry.reason)} | ${sources} |`;
  });
  const demotedRows = manifest.currentMechanisms
    .filter((entry) => {
      const mechanism = currentById.get(entry.mechanismId);
      return entry.disposition === "sidecar" && (
        mechanism?.focusClass === "product-transformation" ||
        mechanism?.focusClass === "product-admission"
      );
    })
    .map((entry) => `| \`${entry.mechanismId}\` | ${cell(entry.reason)} |`);
  const slotRows = analysis.interchangeabilitySlots.map((slot) => {
    const cleanRoutes = slot.cleanWitnesses
      .map((witness) => `\`${witness.mechanismId}\`: ${list(witness.recipeIds)}`)
      .join("<br>");
    const comparisons = slot.comparisons
      .map((comparison) => `\`${comparison.leftMechanismId}\` / \`${comparison.leftRecipeId}\` <-> \`${comparison.rightMechanismId}\` / \`${comparison.rightRecipeId}\` [\`${comparison.normalizedSurroundingSha256}\`]`)
      .join("<br>");
    return `| \`${slot.slotId}\` | ${list(slot.mechanismIds)} | ${cell(cleanRoutes)} | ${cell(comparisons)} |`;
  });
  return [
    "# Branch Research",
    "",
    "This file is generated by `research/v4/capability-graph/src/build.ts`. Do not edit it manually.",
    "",
    "## What We Are Doing",
    "",
    "We are recording explicit alternative raw-artwork-to-v3 product routes. A type-closed planned recipe means all declared product ports connect on paper; code and evidence do not yet exist. No recipe is a default or preference, and this report does not change the built census graph.",
    "",
    "## Inventory Counts",
    "",
    `- Current retained mechanisms: ${analysis.inventoryCounts.currentRetained}.`,
    `- Proposed mechanisms to build: ${analysis.inventoryCounts.proposedMechanisms}.`,
    `- Condemned current formulations: ${analysis.inventoryCounts.currentCondemned}.`,
    `- Existing non-primary sidecars: ${analysis.inventoryCounts.existingSidecars}.`,
    `- Total current sidecar/inspector mechanisms: ${analysis.inventoryCounts.totalSidecarInspectors}.`,
    `- Type-closed planned recipes: ${analysis.recipeCounts.successful}.`,
    `- Execution-ready recipes: ${analysis.recipeCounts.executionReady}.`,
    `- Current retained mechanisms essential in at least one planned route: ${analysis.plannedConnected.currentMechanismIds.length}.`,
    `- Proposed mechanisms essential in at least one planned route: ${analysis.plannedConnected.proposedMechanismIds.length}.`,
    `- Active mechanisms without an essential route: ${unrouted.length}.`,
    `- Canonical branch-plan SHA-256: \`${analysis.branchPlanDigest.sha256}\`.`,
    `- Exact canonical capability-graph JSON SHA-256: \`${analysis.capabilityGraphDigest.sha256}\`.`,
    "",
    "## Workbench Layers",
    "",
    "The 14-layer vocabulary and every retained/proposed assignment are explicit generated data. Counts are not inferred from mechanism IDs, recipe families, or route order.",
    "",
    "| Workbench layer | Retained current | Proposed | Total | Mechanisms |",
    "| --- | ---: | ---: | ---: | --- |",
    ...workbenchLayerRows,
    "",
    `## ${manifest.proposedMechanisms.length} Missing Mechanisms To Build`,
    "",
    "These are proposed algorithmic mechanisms, separate from the existing mechanism inventory. Every implementation, fixture, visualization, and human score remains planned and unavailable.",
    "",
    "| Missing mechanism | Workbench layer | Planned product inputs (group; port -> type [cardinality]) | Operation | Success outputs (branch; port -> type [cardinality]) | First downstream product consumer(s) | Implementation status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...missingMechanismRows,
    "",
    "## Exact Missing Handoffs",
    "",
    "Product bindings only are shown below. Configuration, custody, reports, and sidecar registrations are excluded. Producer origin is stated explicitly; the middle column is always a proposed missing mechanism.",
    "",
    "| Product producer output -> proposed input | Missing mechanism operation | Proposed output -> first downstream product input |",
    "| --- | --- | --- |",
    ...missingHandoffRows,
    "",
    "## Type-Closed Planned Recipe Routes",
    "",
    `All ${analysis.recipeCounts.successful} routes are optional workbench permutations. None is default, preferred, selected, or execution-ready. Essential mechanisms and clean substitutions below are analyzer results, not authored recipe labels.`,
    "",
    ...recipeDetails,
    "## Interchangeability Slots",
    "",
    "Slots name only genuine mechanism alternatives. Every comparison below uses two clean routes and equal analyzer-normalized surrounding bindings after removing the alternative and strictly alternative-specific adapters. No comparison selects a winner.",
    "",
    "| Slot | Genuine alternatives | Clean essential witness routes | Derived sibling comparisons |",
    "| --- | --- | --- | --- |",
    ...slotRows,
    "",
    `## ${connected.length} Active Mechanisms`,
    "",
    "Every row below is essential in at least one type-closed planned route: removing all of its instances and pruning the dead branch breaks source-to-goal closure. Product ports and immediate consumers come from exact recipe bindings. Fixture, visualization, and score registrations are planned and unavailable; they are not product handoffs or completed review material.",
    "",
    "| Mechanism | Origin | Workbench layer | Implementation status | Planned product inputs (group; port -> type [cardinality]) | Operation | Product outputs (branch; port -> type [cardinality]) | First downstream product consumer(s) | Essential witness recipes | Planned fixture | Planned visualization | Planned human score |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...mechanismRows,
    "",
    "## Demoted Product Mechanisms",
    "",
    "These three current formulations remain inspectable sidecars but are not active product transformations.",
    "",
    "| Mechanism | Exact demotion reason |",
    "| --- | --- |",
    ...demotedRows,
    "",
    "## Condemned Formulations",
    "",
    "| Mechanism | Origin | Exact current inputs | Exact current outputs | Researched failure | Repository source |",
    "| --- | --- | --- | --- | --- | --- |",
    ...condemnedRows,
    "",
    "## Unrouted Active Mechanisms",
    "",
    `- Count: ${unrouted.length}. Each entry lacks a route whose closure fails after all of its instances are removed.`,
    "",
    "| Mechanism | Origin | Route inclusion status |",
    "| --- | --- | --- |",
    ...unrouted.map(
      (entry) => `| \`${entry.mechanismId}\` | ${entry.origin} | ${entry.reason} |`,
    ),
    "",
    "## Product Closure And Readiness",
    "",
    `Product-port closure holds on paper for ${analysis.recipeCounts.successful} of ${analysis.recipeCounts.declared} planned recipes. This is not runtime validation: each route starts at \`${manifest.sourceArtifactTypeId}\` and ends only at \`${manifest.goalArtifactTypeId}\`.`,
    "",
    `Execution readiness holds for ${analysis.recipeCounts.executionReady} recipes. Required fixed configurations and non-product providers are unavailable. Proposed implementations and all registered fixtures, visualizations, and human scores are also unavailable; registrations do not constitute evidence.`,
    "",
    "## Built Status",
    "",
    `The unchanged built graph still contains ${analysis.builtMetrics.currentMechanisms} mechanisms, ${analysis.builtMetrics.primaryMechanisms} primary mechanisms, ${analysis.builtMetrics.sourceReachablePrimaryMechanisms} source-reachable primary mechanisms, ${analysis.builtMetrics.goalReachablePrimaryMechanisms} goal-reaching primary mechanisms, and ${analysis.builtMetrics.materializers} materializers.`,
    "",
    "## Recipe Failures",
    "",
    ...analysis.recipes.flatMap((recipe) => {
      const rows = [...recipe.failures, ...recipe.executionReadiness.failures];
      return rows.length === 0
        ? []
        : [
            `### \`${recipe.recipeId}\``,
            "",
            ...rows.map((row) => `- \`${row.code}\` at \`${row.path}\`: ${row.message}`),
            "",
          ];
    }),
    "## Planned Sidecar Registrations",
    "",
    "These registrations are planned and unavailable. They are not product handoffs and do not constitute fixtures, visual review, scores, or evidence.",
    "",
    `- Planned fixture registration type: \`${manifest.sidecarPolicy.fixtureArtifactTypeId}\` (unavailable).`,
    `- Planned visualization registration type: \`${manifest.sidecarPolicy.visualizationArtifactTypeId}\` (unavailable).`,
    `- Planned human-score registration type: \`${manifest.sidecarPolicy.humanScoreArtifactTypeId}\` (unavailable).`,
    "",
  ].join("\n");
}

export function assertBranchAnalysisPlanDigest(
  manifest: BranchPlanManifest,
  analysis: BranchAnalysis,
): void {
  const expected = sha256(serializeCanonical(manifest));
  if (
    analysis.branchPlanDigest.algorithm !== "sha256" ||
    analysis.branchPlanDigest.basis !== "canonical-json" ||
    analysis.branchPlanDigest.sha256 !== expected
  ) {
    throw new Error(
      `Branch analysis plan digest mismatch: expected ${expected}, received ${analysis.branchPlanDigest.sha256}.`,
    );
  }
}

export function serializeCapabilityGraphForBranchDigest(graph: CapabilityGraph): string {
  return serializeCanonical(graph);
}

export function assertBranchAnalysisCapabilityGraphDigest(
  graph: CapabilityGraph,
  analysis: BranchAnalysis,
  capabilityGraphSerialization = serializeCapabilityGraphForBranchDigest(graph),
): void {
  const canonical = serializeCapabilityGraphForBranchDigest(graph);
  if (capabilityGraphSerialization !== canonical) {
    throw new Error("Capability graph digest input is not the canonical serialized graph bytes.");
  }
  const expected = sha256(capabilityGraphSerialization);
  if (
    analysis.capabilityGraphDigest.algorithm !== "sha256" ||
    analysis.capabilityGraphDigest.basis !== "canonical-json-utf8" ||
    analysis.capabilityGraphDigest.sha256 !== expected
  ) {
    throw new Error(
      `Branch analysis capability graph digest mismatch: expected ${expected}, received ${analysis.capabilityGraphDigest.sha256}.`,
    );
  }
}

export async function loadValidateAndAnalyzeBranchPlan(
  graph: CapabilityGraph,
  capabilityGraphSerialization = serializeCapabilityGraphForBranchDigest(graph),
): Promise<{ manifest: BranchPlanManifest; analysis: BranchAnalysis; markdown: string }> {
  const [manifestFile, schemaFile] = await Promise.all([
    readStrictJson<BranchPlanManifest>(BRANCH_PLAN_PATH),
    readStrictJson<Record<string, unknown>>(BRANCH_SCHEMA_PATH),
  ]);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: false,
  });
  const validate = ajv.compile(schemaFile.value);
  if (!validate(manifestFile.value)) {
    throw new Error(
      `branch-plan.json: JSON Schema validation failed:\n${ajv.errorsText(validate.errors, {
        separator: "\n",
      })}`,
    );
  }
  const analysis = validateAndAnalyzeBranchPlan(
    manifestFile.value,
    graph,
    capabilityGraphSerialization,
  );
  assertBranchAnalysisPlanDigest(manifestFile.value, analysis);
  assertBranchAnalysisCapabilityGraphDigest(
    graph,
    analysis,
    capabilityGraphSerialization,
  );
  const manifest = expandRecipeModules(manifestFile.value);
  return {
    manifest,
    analysis,
    markdown: buildBranchResearchMarkdown(manifestFile.value, analysis, graph),
  };
}
