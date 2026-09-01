import type {
  ArtifactInspectionValueKind,
  ArtifactProductFocus,
  JsonValue,
} from "./types.ts";

export type BranchDisposition = "retained" | "condemned" | "sidecar";
export type EffectiveBranchDisposition =
  | "retained"
  | "proposed"
  | "unrouted"
  | "condemned"
  | "sidecar";
export const WORKBENCH_LAYERS = [
  "raster",
  "evidence",
  "literature",
  "saliency",
  "field",
  "candidate",
  "role",
  "color",
  "gradient",
  "treatment",
  "search",
  "selection",
  "repair",
  "publication",
] as const;
export type WorkbenchLayer = (typeof WORKBENCH_LAYERS)[number];

// Cardinality describes artifacts emitted or accepted, not how many readers may
// reference one emitted immutable artifact instance.
export type BranchCardinality =
  | "exactly-one"
  | "exactly-two"
  | "zero-or-one"
  | "zero-to-two"
  | "zero-to-six"
  | "one-to-two"
  | "one-or-more"
  | "zero-or-more";

export interface BranchConstraint {
  valuePath: string;
  comparator:
    | "equals"
    | "in"
    | "matches"
    | "count-equals"
    | "count-between-inclusive";
  value: JsonValue;
}

export interface BranchInspectionPath {
  valuePath: string;
  valueKind: ArtifactInspectionValueKind;
  permittedConstraints: Array<{
    comparator: BranchConstraint["comparator"] | "matches";
    value: JsonValue;
  }>;
  notes: string[];
  semanticRole?: string;
}

export interface BranchValueInspection {
  paths: BranchInspectionPath[];
  relations?: BranchInspectionRelation[];
  notes: string[];
}

export interface BranchInspectionRelation {
  id: string;
  kind:
    | "equals"
    | "member-of"
    | "subset-of"
    | "aligned-equals"
    | "aligned-witness"
    | "rgb-hex-equivalent"
    | "collapse-equivalence"
    | "variant-semantics";
  subjectPath: string;
  objectPath: string;
  whenVariant?: "flat" | "gradient" | "emergency-flat";
}

export interface BranchPayloadVariant {
  id: "flat" | "gradient" | "emergency-flat";
  discriminatorConstraints: BranchConstraint[];
  requiredPaths: string[];
  forbiddenPaths: string[];
}

export interface BranchPayloadShape {
  kind: "object" | "array" | "scalar" | "opaque";
  schemaRef: string;
  description: string;
  fields: Array<{
    valuePath: string;
    valueKind: ArtifactInspectionValueKind;
    required: boolean;
  }>;
  variants?: BranchPayloadVariant[];
}

export interface BranchPort {
  id: string;
  artifactTypeId: string;
  cardinality: BranchCardinality;
  constraints: BranchConstraint[];
  identityPaths: string[];
}

export interface BranchInputGroup {
  id: string;
  mode: "all" | "exactly-one" | "one-or-more";
  ports: BranchPort[];
}

export interface BranchOutputBranch {
  id: "success" | "abstention" | "refusal" | "alpha";
  ports: BranchPort[];
}

export interface ReplacementPlannedContract {
  reason: string;
  productInputs: BranchInputGroup[];
  productOutputs: BranchOutputBranch[];
}

export interface CurrentMechanismDisposition {
  mechanismId: string;
  disposition: BranchDisposition;
  reason: string;
  workbenchLayer?: WorkbenchLayer;
  interchangeabilitySlot?: string;
  evidenceRefs?: string[];
  condemnedScope?: string[];
  excludedProductPorts: string[];
  outputCardinalityOverrides?: Record<string, BranchCardinality>;
  replacementContract?: ReplacementPlannedContract;
}

export interface ProposedArtifact {
  id: string;
  kind: "product" | "sidecar";
  productFocus: ArtifactProductFocus;
  label: string;
  description: string;
  payloadShape: BranchPayloadShape;
  valueInspection: BranchValueInspection;
  semanticRoles?: string[];
}

export interface BranchReadiness {
  fixedConfigRefs: string[];
  requiredNonProductInputs: BranchPort[];
  implementationAvailable: boolean;
  fixtureAvailable: boolean;
  visualizationAvailable: boolean;
  humanScoreAvailable: boolean;
}

export interface ProposedMechanism {
  id: string;
  title: string;
  layer: string;
  workbenchLayer: WorkbenchLayer;
  sourceRef: string;
  operation: string;
  interchangeabilitySlot?: string;
  productInputs: BranchInputGroup[];
  productOutputs: BranchOutputBranch[];
  crossPortConstraints: Array<{
    leftPortId: string;
    leftValuePath: string;
    relation:
      | "equals"
      | "member-of"
      | "subset-of"
      | "equals-when-present"
      | "aligned-record-member-of"
      | "derived-from";
    rightPortId: string;
    rightValuePath: string;
  }>;
  readiness: BranchReadiness;
  sidecars: {
    fixtureId: string;
    visualizationId: string;
    humanScoreId: string;
    availability: "planned-unavailable";
  };
}

export interface BranchFixedConfiguration {
  id: string;
  available: boolean;
}

export interface BranchReadinessProvider {
  id: string;
  available: boolean;
  outputPorts: BranchPort[];
}

export interface EqualityConstraint {
  producerValuePath: string;
  consumerValuePath: string;
}

export interface RecipeBinding {
  consumerPortId: string;
  producerInstanceId: string;
  producerPortId: string;
  equalityConstraints: EqualityConstraint[];
}

export interface ReadinessBinding {
  consumerInputId: string;
  producerKind: "recipe-instance" | "external-provider";
  producerId: string;
  producerPortId: string;
  equalityConstraints: EqualityConstraint[];
}

export interface RecipeStep {
  instanceId: string;
  mechanismId: string;
  selectedOutputBranch: BranchOutputBranch["id"];
  productBindings: RecipeBinding[];
  readinessBindings: {
    fixedConfigRefs: string[];
    nonProductInputs: ReadinessBinding[];
  };
}

export interface GoalBinding {
  producerInstanceId: string;
  producerPortId: string;
}

export interface PostGoalSidecarBinding {
  instanceId: string;
  mechanismId: string;
  consumerPortId: string;
  producerInstanceId: string;
  producerPortId: string;
  equalityConstraints: EqualityConstraint[];
}

export interface BranchRecipe {
  id: string;
  family: string;
  description: string;
  preferred: false;
  moduleRefs?: string[];
  compositionTestSlots?: string[];
  declaredRootInstanceIds: string[];
  steps: RecipeStep[];
  goalBinding: GoalBinding;
  postGoalSidecars: PostGoalSidecarBinding[];
}

export interface BranchRecipeModule {
  id: string;
  steps: RecipeStep[];
}

export interface BranchPlanManifest {
  $schema?: string;
  documentKind: "capability-branch-plan";
  schemaVersion: "1.0.0";
  sourceArtifactTypeId: "artifact.source.encoded-artwork-image.v1";
  goalArtifactTypeId: "artifact.product.ui-palette.v3";
  currentReadinessPolicy: "derive-required-nonproduct-ports-from-built-contract";
  requireCompleteActiveWitnesses?: boolean;
  sidecarPolicy: {
    fixtureIdTemplate: "fixture.{mechanismId}.v1";
    visualizationIdTemplate: "visualization.{mechanismId}.v1";
    humanScoreIdTemplate: "human-score.{mechanismId}.v1";
    fixtureArtifactTypeId: string;
    visualizationArtifactTypeId: string;
    humanScoreArtifactTypeId: string;
  };
  fixedConfigurations: BranchFixedConfiguration[];
  readinessProviders: BranchReadinessProvider[];
  currentMechanisms: CurrentMechanismDisposition[];
  proposedArtifacts: ProposedArtifact[];
  artifactTypeAliases: Record<string, string>;
  productArtifactDemotions: string[];
  proposedMechanisms: ProposedMechanism[];
  recipeModules?: BranchRecipeModule[];
  recipes: BranchRecipe[];
}

export interface MechanismSidecars {
  fixtureId: string;
  visualizationId: string;
  humanScoreId: string;
}

export interface BranchFailure {
  code: string;
  path: string;
  message: string;
}

export interface RecipeAnalysis {
  recipeId: string;
  family: string;
  successful: boolean;
  sourceReached: boolean;
  goalReached: boolean;
  contributingInstanceIds: string[];
  contributingMechanismIds: string[];
  witnessedMechanismIds: string[];
  essentialMechanismIds: string[];
  typedStepSignatures: string[];
  consumedProductOutputs: Array<{
    instanceId: string;
    portId: string;
    artifactTypeId: string;
  }>;
  expandedSteps: RecipeStep[];
  failures: BranchFailure[];
  executionReadiness: {
    ready: boolean;
    failures: BranchFailure[];
    missingFixedConfigs: string[];
    missingNonProductInputs: string[];
    unavailableMechanisms: string[];
    unavailableFixtures: string[];
    unavailableVisualizations: string[];
    unavailableHumanScores: string[];
  };
}

export interface BranchAnalysis {
  documentKind: "capability-branch-analysis";
  schemaVersion: "1.0.0";
  generatedFrom: string;
  branchPlanDigest: {
    algorithm: "sha256";
    basis: "canonical-json";
    sha256: string;
  };
  capabilityGraphDigest: {
    algorithm: "sha256";
    basis: "canonical-json-utf8";
    sha256: string;
  };
  builtMetrics: {
    currentMechanisms: number;
    primaryMechanisms: number;
    primaryProductArtifacts: number;
    primaryIncidences: number;
    sourceReachablePrimaryMechanisms: number;
    goalReachablePrimaryMechanisms: number;
    materializers: number;
  };
  inventoryCounts: {
    currentRetained: number;
    currentCondemned: number;
    currentDemoted: number;
    existingSidecars: number;
    totalSidecarInspectors: number;
    proposedMechanisms: number;
    fullPlannedRegistry: number;
    proposedProductArtifacts: number;
    proposedSidecarArtifacts: number;
  };
  recipeCounts: {
    declared: number;
    successful: number;
    executionReady: number;
  };
  plannedConnected: {
    currentMechanismIds: string[];
    proposedMechanismIds: string[];
  };
  workbenchMechanisms: Array<{
    mechanismId: string;
    origin: "current" | "proposed";
    workbenchLayer: WorkbenchLayer;
  }>;
  workbenchLayers: Array<{
    workbenchLayer: WorkbenchLayer;
    currentMechanismIds: string[];
    proposedMechanismIds: string[];
  }>;
  unresolvedActiveContracts: Array<{
    mechanismId: string;
    inputPortIds: string[];
    outputPortIds: string[];
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
  effectiveDispositions: Array<{
    mechanismId: string;
    origin: "current" | "proposed";
    declaredDisposition: "retained" | "proposed" | "condemned" | "sidecar";
    effectiveDisposition: EffectiveBranchDisposition;
    reason: string;
    witnessRecipeIds: string[];
    workbenchLayer?: WorkbenchLayer;
    sidecars: MechanismSidecars;
  }>;
  recipes: RecipeAnalysis[];
  warnings: string[];
}
