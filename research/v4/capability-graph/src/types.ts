export const GRAPH_SCHEMA_VERSION = "1.3.0" as const;
export const GENERATOR_NAME =
  "research/v4/capability-graph/src/build.ts" as const;
export const GENERATOR_VERSION = "1.5.0" as const;
export const EXPECTED_MECHANISM_COUNT = 149 as const;
export const LEFT_PRODUCT_ANCHOR_ARTIFACT_ID =
  "artifact.raster.native-srgb8-opaque.v1" as const;
export const RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID =
  "artifact.product.ui-palette.v3" as const;
export const PINNED_SOURCE_COMMIT_DATE = "2026-08-30T22:40:39+02:00" as const;
export const COMPATIBILITY_WARNING =
  "Matching artifact type IDs indicate candidate semantic compatibility only; they do not assert a tested binding, dependency, architecture, runtime pipeline, or build order." as const;
export const PRODUCT_FOCUS_WARNING =
  "Product focus metadata is presentation and research-priority classification only; it asserts no evidence, authorization, compatibility, dependency, producer selection, adapter, execution order, architecture, or build order." as const;
export const OPEN_CONTRACT_SEMANTIC =
  "candidate-connectivity-observation" as const;
export const OPEN_CONTRACT_CONFIRMATION_CONDITION =
  "future-selected-composition-requires-exact-contract" as const;

export const DATA_PLANES = ["runtime", "development", "governance"] as const;
export type DataPlane = (typeof DATA_PLANES)[number];

export const ARTIFACT_CATEGORIES = [
  "encoded-source",
  "raster",
  "color",
  "scalar-field",
  "mask",
  "label-map",
  "region-set",
  "graph",
  "measurement",
  "statistic",
  "hypothesis",
  "candidate",
  "candidate-set",
  "treatment",
  "rendering",
  "configuration",
  "control",
  "model",
  "review",
  "provenance",
  "custody",
  "diagnostic",
  "report",
  "decision",
] as const;
export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number];

export const CONTRACT_MATURITIES = [
  "descriptive",
  "draft",
  "experiment-bound",
  "validated",
  "frozen",
] as const;
export type ContractMaturity = (typeof CONTRACT_MATURITIES)[number];

export const BOUNDARY_CLASSIFICATIONS = [
  "internal",
  "expected-external",
  "unresolved-external",
  "product-goal",
] as const;
export type BoundaryClassification =
  (typeof BOUNDARY_CLASSIFICATIONS)[number];

export const SCIENTIFIC_INTERPRETATIONS = [
  "supported",
  "falsified",
  "unsupported",
  "inconclusive",
  "unmeasured",
] as const;
export type ScientificInterpretation =
  (typeof SCIENTIFIC_INTERPRETATIONS)[number];

export const IMPLEMENTATION_STATES = [
  "live",
  "historical",
  "prototype",
  "instrument",
  "unbuilt",
] as const;
export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

export const EVIDENCE_SCOPES = [
  "mechanical",
  "isolated-semantic",
  "conditional-known-good",
  "natural-handoff",
  "perturbation",
  "downstream-utility",
  "composition",
  "complete-treatment",
  "none-local",
] as const;
export type EvidenceScope = (typeof EVIDENCE_SCOPES)[number];

export const RUNTIME_ADMISSIBILITIES = [
  "permitted",
  "prohibited",
  "unresolved",
] as const;
export type RuntimeAdmissibility =
  (typeof RUNTIME_ADMISSIBILITIES)[number];

export const AUTHORIZATION_TOKENS = [
  "inventory-only",
  "diagnostic-only",
  "prohibited",
] as const;
export type AuthorizationToken = (typeof AUTHORIZATION_TOKENS)[number];

export const PORT_CARDINALITIES = [
  "exactly-one",
  "exactly-two",
  "zero-or-one",
  "zero-to-two",
  "zero-to-six",
  "one-to-two",
  "one-or-more",
  "zero-or-more",
] as const;
export type PortCardinality = (typeof PORT_CARDINALITIES)[number];

export const INPUT_REQUIREMENTS = [
  "required",
  "optional",
  "alternative",
  "configuration",
] as const;
export type InputRequirement = (typeof INPUT_REQUIREMENTS)[number];

export const INPUT_CLASSES = [
  "natural",
  "known-good-projection",
  "answer-bearing-upper-bound",
  "configuration",
  "control",
  "model",
  "review",
  "external-observation",
] as const;
export type InputClass = (typeof INPUT_CLASSES)[number];

export const MECHANISM_FOCUS_CLASSES = [
  "product-transformation",
  "product-admission",
  "evaluation-probe",
  "review-custody",
  "configuration-governance",
  "historical-comparator",
  "research-only-oracle",
] as const;
export type MechanismFocusClass = (typeof MECHANISM_FOCUS_CLASSES)[number];

export const ARTIFACT_PRODUCT_FOCI = [
  "product-flow",
  "inspector-metadata",
  "secondary-overlay",
  "full-analysis-only",
] as const;
export type ArtifactProductFocus = (typeof ARTIFACT_PRODUCT_FOCI)[number];

export const ALTERNATIVE_SELECTION_CARDINALITIES = [
  "exactly-one",
  "one-or-more",
] as const;
export type AlternativeSelectionCardinality =
  (typeof ALTERNATIVE_SELECTION_CARDINALITIES)[number];

export interface SourceSnapshot {
  path: string;
  gitCommit: string;
  gitBlob: string;
  gitTree: string;
  gitCommitTimestamp: string;
  sha256: string;
  byteLength: number;
  lineCount: number;
  mechanismCount: typeof EXPECTED_MECHANISM_COUNT;
}

export const PINNED_SOURCE_SNAPSHOT: SourceSnapshot = {
  path: "research/v4/MECHANISMS.md",
  gitCommit: "f348d363278e0881fe50e446644a97f220eb9153",
  gitBlob: "87cd4eee2e01b3c46fffe91d64b330c192909d47",
  gitTree: "c9db4da6ee7f6acef729af2cb4ffc1d325e2b191",
  gitCommitTimestamp: PINNED_SOURCE_COMMIT_DATE,
  sha256: "3b60e57482786a977e3526989a21abefb85d1f9cd417762ca65e3d89ec2824c5",
  byteLength: 196653,
  lineCount: 2625,
  mechanismCount: EXPECTED_MECHANISM_COUNT,
};

export interface MechanismSource {
  path: string;
  headingText: string;
  headingLine: number;
}

export interface CensusStatus {
  authorizationText: string;
  statusText: string;
  scientificInterpretations: ScientificInterpretation[];
  implementationStates: ImplementationState[];
  evidenceScopes: EvidenceScope[];
  runtimeAdmissibilities: RuntimeAdmissibility[];
  authorizationTokens: AuthorizationToken[];
}

export const ARTIFACT_INSPECTION_VALUE_KINDS = [
  "state",
  "scalar",
  "collection",
  "object",
] as const;
export type ArtifactInspectionValueKind =
  (typeof ARTIFACT_INSPECTION_VALUE_KINDS)[number];

export interface ArtifactPermittedValueConstraint {
  comparator: ValueConstraintComparator;
  value?: JsonValue;
}

export interface ArtifactValueInspectionPath {
  valuePath: string;
  valueKind: ArtifactInspectionValueKind;
  permittedConstraints: ArtifactPermittedValueConstraint[];
  notes: string[];
}

export interface ArtifactValueInspectionContract {
  paths: ArtifactValueInspectionPath[];
  notes: string[];
}

export interface ArtifactType {
  id: string;
  productFocus: ArtifactProductFocus;
  label: string;
  description: string;
  category: ArtifactCategory;
  plane: DataPlane;
  axisPositionId: string;
  laneId: string;
  contractMaturity: ContractMaturity;
  boundaryClassification: BoundaryClassification;
  intentionalTerminalPurpose?: string;
  valueInspection?: ArtifactValueInspectionContract;
  sourceNotes: string[];
  provenanceNotes: string[];
}

export interface InputPort {
  id: string;
  label: string;
  artifactTypeId: string;
  requirement: InputRequirement;
  alternativeGroupId?: string;
  cardinality: PortCardinality;
  inputClass: InputClass;
  valueConstraints?: PortValueConstraint[];
  notes: string[];
}

export interface OutputPort {
  id: string;
  label: string;
  artifactTypeId: string;
  cardinality: PortCardinality;
  valueStateNotes: string[];
  valueConstraints?: PortValueConstraint[];
  terminalPurpose?: string;
  notes: string[];
}

export interface AlternativeGroup {
  id: string;
  selectionCardinality: AlternativeSelectionCardinality;
  notes: string[];
}

export const OUTPUT_SELECTION_CARDINALITIES = ["exactly-one"] as const;
export type OutputSelectionCardinality =
  (typeof OUTPUT_SELECTION_CARDINALITIES)[number];

export interface OutputGroup {
  id: string;
  portIds: string[];
  selectionCardinality: OutputSelectionCardinality;
  notes: string[];
}

export const VALUE_CONSTRAINT_COMPARATORS = [
  "present",
  "absent",
  "equals",
  "not-equals",
  "in",
  "not-in",
  "less-than",
  "less-than-or-equal",
  "greater-than",
  "greater-than-or-equal",
  "count-equals",
  "count-between-inclusive",
] as const;
export type ValueConstraintComparator =
  (typeof VALUE_CONSTRAINT_COMPARATORS)[number];

export interface PortValueConstraint {
  valuePath: string;
  comparator: ValueConstraintComparator;
  value?: JsonValue;
  notes: string[];
}

export interface ConstraintPortSubject {
  direction: "input" | "output";
  portId: string;
  valuePath: string;
}

export interface ConstraintPredicate {
  subject: ConstraintPortSubject;
  comparator: ValueConstraintComparator;
  value?: JsonValue;
}

export interface ConditionalConstraint {
  id: string;
  if: ConstraintPredicate[];
  then: ConstraintPredicate[];
  notes: string[];
}

export interface MechanismRecord {
  id: string;
  focusClass: MechanismFocusClass;
  title: string;
  source: MechanismSource;
  capabilityIds: string[];
  primaryCapabilityId: string;
  censusStatus: CensusStatus;
  alternativeGroups: AlternativeGroup[];
  outputGroups?: OutputGroup[];
  conditionalConstraints?: ConditionalConstraint[];
  inputPorts: InputPort[];
  outputPorts: OutputPort[];
}

export interface AxisPosition {
  id: string;
  order: number;
  label: string;
  description: string;
}

export interface SemanticCommitmentAxis {
  id: "axis.semantic-commitment";
  label: string;
  description: string;
  direction: "left-to-right";
  positions: AxisPosition[];
}

export interface CapabilityLane {
  id: string;
  label: string;
  description: string;
}

export interface CapabilityDefinition {
  id: string;
  label: string;
  description: string;
  axisPositionId: string;
  laneId: string;
}

export interface ProductAnchor {
  artifactTypeId: string;
  axisPositionId: string;
  laneId: string;
  label: string;
  meaning: string;
}

export interface CapabilityGroups {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  id: "capability-groups.semantic-commitment.v1";
  label: string;
  description: string;
  semantics: {
    orderingMeaning: "semantic-commitment-only";
    dependencyMeaning: "none";
    maturityMeaning: "none";
  };
  axis: SemanticCommitmentAxis;
  lanes: CapabilityLane[];
  capabilities: CapabilityDefinition[];
  productAnchors: {
    left: ProductAnchor;
    right: ProductAnchor;
  };
  topologyPolicy: {
    compatibility: "candidate-semantic-compatibility-only";
    externalRoots: "permitted-and-classified";
    diagnostics: "first-class-and-filterable";
    cycles: "permitted";
    fanOut: "permitted";
    convergence: "permitted";
    dataPlanes: "runtime-development-governance-distinct";
    architectureInference: "not-asserted";
  };
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PortReference {
  mechanismId: string;
  direction: "input" | "output";
  portId: string;
}

export interface GeneratedPortDetail {
  port: PortReference;
  details: { [key: string]: JsonValue };
}

export interface CompatibilityHyperedge {
  artifactTypeId: string;
  producerPorts: PortReference[];
  consumerPorts: PortReference[];
  perPortDetails?: GeneratedPortDetail[];
}

export const NEVER_PROVIDED_DISPOSITIONS = [
  "expected-external-root",
  "unresolved-external-root",
  "internal-gap",
  "product-goal-gap",
] as const;
export type NeverProvidedDisposition =
  (typeof NEVER_PROVIDED_DISPOSITIONS)[number];

export const NEVER_USED_DISPOSITIONS = [
  "intentional-terminal",
  "product-goal-terminal",
  "expected-external-handoff",
  "unresolved-terminal",
  "internal-unused",
] as const;
export type NeverUsedDisposition = (typeof NEVER_USED_DISPOSITIONS)[number];

export interface NeverProvidedInputType {
  artifactTypeId: string;
  boundaryClassification: BoundaryClassification;
  disposition: NeverProvidedDisposition;
  consumerPorts: PortReference[];
  consumerPortDetails: NeverProvidedInputPortDetail[];
}

export interface NeverUsedOutputType {
  artifactTypeId: string;
  boundaryClassification: BoundaryClassification;
  disposition: NeverUsedDisposition;
  producerPorts: PortReference[];
  producerPortDetails: NeverUsedOutputPortDetail[];
}

export const PRODUCER_AVAILABILITIES = ["available", "unavailable"] as const;
export type ProducerAvailability = (typeof PRODUCER_AVAILABILITIES)[number];

export const INPUT_OBLIGATION_CLASSIFICATIONS = [
  "direct-obligation",
  "collective-alternative-group-obligation",
  "optional-absence",
  "unused-alternative",
] as const;
export type InputObligationClassification =
  (typeof INPUT_OBLIGATION_CLASSIFICATIONS)[number];

export interface AlternativeGroupAvailability {
  id: string;
  selectionCardinality: AlternativeSelectionCardinality;
  memberPortCount: number;
  producerBackedMemberPortCount: number;
}

export interface NeverProvidedInputPortDetail {
  port: PortReference;
  requirement: InputRequirement;
  producerAvailability: ProducerAvailability;
  obligationClassification: InputObligationClassification;
  alternativeGroup?: AlternativeGroupAvailability;
}

export interface NeverUsedOutputPortDetail {
  port: PortReference;
  disposition: NeverUsedDisposition;
  terminalPurpose?: string;
}

export interface AnalysisCounts {
  artifactTypes: number;
  mechanisms: number;
  inputPorts: number;
  outputPorts: number;
  compatibilityHyperedges: number;
  neverProvidedInputTypes: number;
  neverProvidedInputPorts: number;
  neverUsedOutputTypes: number;
  neverUsedOutputPorts: number;
}

export interface SourceFragmentReference {
  fragmentId: string;
  path: string;
  sha256: string;
  byteLength: number;
}

export interface GenerationInputReference {
  path: string;
  sha256: string;
  byteLength: number;
}

export interface ObligationCounts {
  directObligations: number;
  collectiveAlternativeGroupObligations: number;
  optionalAbsences: number;
  unusedAlternatives: number;
}

export const OPEN_INPUT_CONTRACT_KINDS = [
  "missing-natural-provider",
  "nonprimary-provider-observed",
] as const;
export type OpenInputContractKind = (typeof OPEN_INPUT_CONTRACT_KINDS)[number];

export interface OpenInputContract {
  semantics: typeof OPEN_CONTRACT_SEMANTIC;
  kind: OpenInputContractKind;
  artifactTypeId: string;
  consumerPort: PortReference;
}

export interface OpenAlternativeContract {
  semantics: typeof OPEN_CONTRACT_SEMANTIC;
  kind: OpenInputContractKind;
  mechanismId: string;
  alternativeGroupId: string;
  artifactTypeIds: string[];
  memberPorts: PortReference[];
}

export interface OpenOutputContract {
  semantics: typeof OPEN_CONTRACT_SEMANTIC;
  kind: "unconsumed-product-evidence";
  artifactTypeId: string;
  producerPorts: PortReference[];
}

export interface ProductMaterializerGap {
  status: "confirmed-structural-gap";
  kind: "missing-product-materializer";
  artifactTypeId: typeof RIGHT_PRODUCT_ANCHOR_ARTIFACT_ID;
}

export interface ProductFocusAnalysis {
  interpretationWarnings: string[];
  mechanismClassCounts: Record<MechanismFocusClass, number>;
  artifactFocusCounts: Record<ArtifactProductFocus, number>;
  primaryMechanismIds: string[];
  primaryArtifactIds: string[];
  primaryIncidences: PortReference[];
  inspectorInputPorts: PortReference[];
  secondaryOverlayMechanismIds: string[];
  secondaryOverlayArtifactIds: string[];
  fullOnlyMechanismIds: string[];
  fullOnlyArtifactIds: string[];
  fullRegistryCounts: {
    mechanisms: number;
    artifacts: number;
    incidences: number;
  };
  openContractSemantics: {
    semantics: typeof OPEN_CONTRACT_SEMANTIC;
    confirmedGapCondition: typeof OPEN_CONTRACT_CONFIRMATION_CONDITION;
    assertsPrerequisite: false;
    assertsWorkQueueItem: false;
    assertsBuildOrder: false;
    assertsMissingMechanism: false;
    assertsTrialGate: false;
  };
  connectivityCounts: {
    materializerGaps: number;
    openInputContracts: number;
    openAlternativeContracts: number;
    openOutputContracts: number;
  };
  materializerGaps: ProductMaterializerGap[];
  openInputContracts: OpenInputContract[];
  openAlternativeContracts: OpenAlternativeContract[];
  openOutputContracts: OpenOutputContract[];
}

export interface GeneratedAnalysis {
  generatedAt: string;
  generationDigest: string;
  generator: {
    name: typeof GENERATOR_NAME;
    version: typeof GENERATOR_VERSION;
  };
  generationInputs: GenerationInputReference[];
  sourceFragments: SourceFragmentReference[];
  counts: AnalysisCounts;
  obligationCounts: ObligationCounts;
  productFocus: ProductFocusAnalysis;
  compatibilityHyperedges: CompatibilityHyperedge[];
  orphans: {
    neverProvidedInputTypes: NeverProvidedInputType[];
    neverUsedOutputTypes: NeverUsedOutputType[];
  };
  warnings: string[];
}

export interface CapabilityGraph {
  $schema?: string;
  documentKind: "typed-capability-compatibility-hypergraph";
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  semantics: {
    relation: "candidate-semantic-compatibility";
    sameArtifactTypeAssertsTestedBinding: false;
    assertsDependencyGraph: false;
    assertsArchitecture: false;
    assertsBuildOrder: false;
  };
  generationDigest: string;
  sourceSnapshot: SourceSnapshot;
  capabilityGroups: CapabilityGroups;
  artifactTypes: ArtifactType[];
  mechanisms: MechanismRecord[];
  analysis: GeneratedAnalysis;
}

export interface MappingFragment {
  $schema?: string;
  documentKind: "capability-graph-mapping-fragment";
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  fragmentId: string;
  title: string;
  description: string;
  sourceSnapshot: SourceSnapshot;
  artifactTypes: ArtifactType[];
  mechanismTypings: MechanismRecord[];
  notes: string[];
}
