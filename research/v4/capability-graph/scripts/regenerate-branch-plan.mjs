import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let check = false;
let planPath = new URL("../data/branch-plan.json", import.meta.url);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--check") {
    check = true;
  } else if (argument === "--plan") {
    const value = args[index + 1];
    if (!value) throw new Error("--plan requires a path.");
    planPath = resolve(value);
    index += 1;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}
const graphPath = new URL("../data/capability-graph.json", import.meta.url);
const branchAnalysisPath = new URL("../data/branch-analysis.json", import.meta.url);
const graphText = await readFile(graphPath, "utf8");
const graph = JSON.parse(graphText);
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([key, child]) => [key, canonicalize(child)]));
};
const canonicalGraphText = `${JSON.stringify(canonicalize(graph), null, 2)}\n`;
if (graphText !== canonicalGraphText) {
  throw new Error("capability-graph.json is not the exact canonical JSON serialization.");
}
const capabilityGraphSha256 = createHash("sha256").update(canonicalGraphText).digest("hex");
const artifactById = new Map(graph.artifactTypes.map((artifact) => [artifact.id, artifact]));
const mechanismById = new Map(graph.mechanisms.map((mechanism) => [mechanism.id, mechanism]));
const demotions = new Set();

// This is source inventory, not data recovered from the generated plan.
const PROPOSAL_IDS = [
  "raster.native-artwork-decode",
  "evidence.native-raster-primitives",
  "evidence.native-pixel-graph-construction",
  "evidence.native-edge-dissimilarity-measurement",
  "evidence.native-component-local-measurement",
  "evidence.deterministic-signed-affinity-construction",
  "evidence.lifted-base-graph-construction",
  "evidence.lifted-nonlocal-edge-construction",
  "evidence.native-slic-partition",
  "evidence.partition-native-region-measurement",
  "evidence.region-boundary-statistics",
  "candidate.region-color-proposal-extraction",
  "evidence.texture-distribution-segmentation",
  "evidence.rtv-structure-regionization",
  "evidence.tgv-field-regionization",
  "evidence.graph-trend-order0-input-construction",
  "evidence.graph-trend-order0-regionization",
  "evidence.fixed-soft-morphology-regionization",
  "evidence.native-family-evidence-construction",
  "evidence.native-family-component-graph-construction",
  "candidate.archetypoid-observation-construction",
  "field.family-border-domain-proposal",
  "field.robust-surface-domain-proposal",
  "field.regularized-region-domain-proposal",
  "field.hierarchy-domain-proposal",
  "field.pixel-cue-domain-proposal",
  "field.domain-evidence-election",
  "field.accepted-domain-measurement",
  "saliency.source-color-proposal-extraction",
  "evidence.salient-mark-measurement",
  "role.text-cue-measurement",
  "role.artwork-family-relation-measurement",
  "role.treatment-swap-legality-measurement",
  "candidate.native-witness-redemption",
  "evidence.native-color-occupancy-measurement",
  "publication.exact-native-pixel-admission",
  "gradient.native-transition-path-construction",
  "candidate.native-band-local-endpoints",
  "gradient.native-spatial-midpoint-band",
  "gradient.native-transition-stage-midpoint",
  "gradient.native-transition-publication",
  "gradient.exact-source-pair-construction",
  "gradient.ramp-excursion-measurement",
  "gradient.exact-path-election",
  "treatment.joint-hypothesis-construction",
  "treatment.finite-factor-construction",
  "treatment.swapped-candidate-domain-insertion",
  "selection.structured-objective-construction",
  "selection.multicriteria-table-construction",
  "selection.submodular-item-construction",
  "selection.retained-subset-reification",
  "selection.partial-preorder-linear-extension",
  "selection.retained-subset-ordering",
  "selection.total-order-election",
  "treatment.selected-treatment-role-reification",
  "repair.winner-input-construction",
  "repair.result-role-reification",
  "selection.exact-source-infeasibility-proof",
  "publication.ordinary-exact-source-admission",
  "repair.exact-source-admission",
  "publication.emergency-exact-source-admission",
  "publication.ui-palette-v3-materializer",
];

const CONDEMNED_IDS = new Set([
  "candidate.band-local-endpoints",
  "evidence.area-integral-extent-substrate",
  "evidence.legacy-structural-text-heuristics",
  "evidence.slic-region-graph",
  "gradient.spatial-midpoint-band",
  "gradient.transition-stage-midpoint",
  "gradient.transition-support-and-flat-fallback",
  "raster.native-opaque-decode",
  "role.legacy-independent-election",
]);
const DEMOTED_MECHANISM_IDS = new Set([
  "publication.exact-native-pixel",
  "raster.transparency-policy",
  "validation.contract-invariants",
]);
const DEMOTION_REASONS = new Map([
  ["raster.transparency-policy", "Demoted because refusal and matte handling are non-palette historical behavior; successful product flow starts from the replacement decoder's explicit opacity decision."],
  ["validation.contract-invariants", "Demoted because it verifies the completed contract after the product goal rather than transforming a product toward that goal."],
  ["publication.exact-native-pixel", "Demoted because its current contract records publication custody only; proposed exact native-pixel admission replaces the missing product admission handoff."],
]);
const INTERCHANGEABILITY_SLOT_BY_MECHANISM = new Map([
  ...[
    "evidence.fh-size-adaptive-merge",
    "literature.constrained-connectivity",
    "literature.lifted-multicut",
    "literature.mutex-watershed",
    "evidence.native-slic-partition",
    "evidence.texture-distribution-segmentation",
    "evidence.rtv-structure-regionization",
    "evidence.tgv-field-regionization",
    "evidence.graph-trend-order0-regionization",
    "evidence.fixed-soft-morphology-regionization",
  ].map((id) => [id, "partition-formation"]),
  ...[
    "field.family-border-domain-proposal",
    "field.robust-surface-domain-proposal",
    "field.regularized-region-domain-proposal",
    "field.hierarchy-domain-proposal",
    "field.pixel-cue-domain-proposal",
  ].map((id) => [id, "field-domain-proposal"]),
  ...[
    "literature.frequency-tuned-saliency",
    "literature.spectral-residual-saliency",
    "literature.boundary-connectivity-saliency",
  ].map((id) => [id, "saliency-proposal"]),
  ...[
    "candidate.region-color-proposal-extraction",
    "candidate.representative-strategies",
  ].map((id) => [id, "candidate-nomination"]),
  ...[
    "gradient.native-spatial-midpoint-band",
    "gradient.native-transition-stage-midpoint",
  ].map((id) => [id, "midpoint-nomination"]),
  ...[
    "search.complete-tuple-enumeration",
    "search.exact-branch-and-bound",
  ].map((id) => [id, "selection-search"]),
  ...[
    "selection.noncompensatory-blocks",
    "selection.pareto-retention",
  ].map((id) => [id, "selection-retention"]),
  ...[
    "literature.submodular-budget-maximization",
    "literature.submodular-target-cover",
  ].map((id) => [id, "selection-subset-method"]),
  ...[
    "literature.diverse-m-best",
    "literature.electre-outranking",
  ].map((id) => [id, "selection-ordering"]),
  ["publication.ordinary-exact-source-admission", "final-admission"],
  ["publication.emergency-exact-source-admission", "final-admission"],
]);
const CURRENT_WORKBENCH_LAYER_BY_MECHANISM = new Map([
  ["candidate.canonical-deduplication", "candidate"],
  ["candidate.field-hypotheses", "candidate"],
  ["candidate.hue-family-supplement", "candidate"],
  ["candidate.multi-source-fan-in", "candidate"],
  ["candidate.native-transition-path", "candidate"],
  ["candidate.representative-strategies", "candidate"],
  ["candidate.role-aware-shortlist", "candidate"],
  ["candidate.stratified-cap", "candidate"],
  ["color.oklab-working-space", "color"],
  ["evidence.attribute-morphology-granulometry", "evidence"],
  ["evidence.border-frame-ownership", "evidence"],
  ["evidence.connected-components", "evidence"],
  ["evidence.family-quantization", "evidence"],
  ["evidence.fh-size-adaptive-merge", "evidence"],
  ["evidence.global-noise-estimation", "evidence"],
  ["evidence.multiscale-surround", "evidence"],
  ["evidence.per-pixel-rank-fields", "evidence"],
  ["evidence.residual-marks", "evidence"],
  ["evidence.robust-field-fit", "evidence"],
  ["evidence.structural-text-shape", "evidence"],
  ["evidence.texture-descriptors", "evidence"],
  ["evidence.tree-of-shapes", "evidence"],
  ["gradient.endpoint-outward-walk", "gradient"],
  ["gradient.endpoint-snap", "gradient"],
  ["gradient.excursion-midpoint-insertion", "gradient"],
  ["gradient.fit-based-structure-choice", "gradient"],
  ["gradient.lambda-structure-price", "gradient"],
  ["gradient.low-frequency-and-path-detectors", "gradient"],
  ["gradient.mdl-path-simplification", "gradient"],
  ["gradient.midpoint-endpoint-distinctness", "gradient"],
  ["gradient.semantic-boolean", "gradient"],
  ["gradient.whole-ramp-contrast", "gradient"],
  ["literature.archetypoids", "literature"],
  ["literature.boundary-connectivity-saliency", "saliency"],
  ["literature.constrained-connectivity", "evidence"],
  ["literature.differentiable-soft-morphology", "literature"],
  ["literature.diverse-m-best", "selection"],
  ["literature.electre-outranking", "selection"],
  ["literature.frequency-tuned-saliency", "saliency"],
  ["literature.graph-trend-filtering", "literature"],
  ["literature.lifted-multicut", "evidence"],
  ["literature.mutex-watershed", "evidence"],
  ["literature.relative-total-variation", "literature"],
  ["literature.rgbxy-palette-layers", "literature"],
  ["literature.spectral-residual-saliency", "saliency"],
  ["literature.submodular-budget-maximization", "selection"],
  ["literature.submodular-target-cover", "selection"],
  ["literature.total-generalized-variation", "literature"],
  ["publication.black-white-escape", "repair"],
  ["publication.explicit-collapse", "repair"],
  ["repair.user-floor-repick", "repair"],
  ["repair.winner-gated-zero-contrast", "repair"],
  ["role.accent-shape-evidence", "role"],
  ["role.family-relationship-mirroring", "repair"],
  ["role.field-conditional-classifier", "role"],
  ["role.hue-direction-diversity", "role"],
  ["role.identity-obligations", "role"],
  ["role.maximin-ramp-foreground", "repair"],
  ["role.per-mass-mark-reading", "role"],
  ["role.salience-led-candidacy", "role"],
  ["role.text-led-foreground", "role"],
  ["role.text-mark-swap", "repair"],
  ["search.complete-tuple-enumeration", "search"],
  ["search.exact-branch-and-bound", "search"],
  ["selection.banded-comparator", "repair"],
  ["selection.content-tie-break", "selection"],
  ["selection.fixed-relaxation", "selection"],
  ["selection.noncompensatory-blocks", "selection"],
  ["selection.pareto-retention", "selection"],
  ["selection.source-lineage-filter", "selection"],
  ["selection.transition-promotion", "selection"],
]);
const CONDEMNED_RESEARCH = new Map([
  [
    "raster.native-opaque-decode",
    "Input `encoded-file` requires `artifact.source.encoded-opaque-image.v1`, so opacity must be asserted before decode instead of measured from generic encoded artwork. That invalid predecode opacity premise cannot safely authorize output `native-raster` (`artifact.raster.native-srgb8-opaque.v1`).",
  ],
  [
    "evidence.slic-region-graph",
    "Input `working-raster` requires the prohibited resampled lattice `artifact.raster.working-srgb8-max-edge-224-lanczos3.v1`, not native pixels. Outputs `labels`, `region-graph`, and `source-representatives` therefore remain tied to the 224px discovery copy and cannot enter native product flow.",
  ],
  [
    "evidence.area-integral-extent-substrate",
    "Required input `eligibility` (`artifact.mask.extent-eligible-pixels.v1`) has no product provider, and `frozen-p3-rows` is review custody rather than product input. Product outputs `extent-field` and `field-set` have no active algorithmic consumer, so the extent substrate has neither a complete producer side nor a product sink.",
  ],
  [
    "evidence.legacy-structural-text-heuristics",
    "Inputs `saliency` and `root-clusters` depend on `artifact.scalar-field.legacy-local-contrast-saliency-u8.v1` and `artifact.candidate-set.legacy-kmeans-public-clusters.v1`. That legacy saliency/cluster dependency cannot supply corrected text evidence, so `foreground-hypotheses` remains a legacy hypothesis output rather than active role input.",
  ],
  [
    "role.legacy-independent-election",
    "Inputs `root-clusters`, `local-saliency`, and `source-raster` independently elect complete role colors in output `legacy-role-election`. Independent role-by-role election bypasses the required joint candidate, relation, swap-legality, and treatment decision domain, so this result cannot be an admitted treatment.",
  ],
  [
    "candidate.band-local-endpoints",
    "Input `accepted-fit` requires unavailable diagnostic-only `artifact.diagnostic.accepted-historical-gradient-fit.v1`; `field-domain`, `low-band`, and `high-band` also lack product providers. Output `refined-hypothesis` therefore cannot be reached from active native evidence.",
  ],
  [
    "gradient.spatial-midpoint-band",
    "Input `accepted-fit` requires unavailable diagnostic-only `artifact.diagnostic.accepted-historical-gradient-fit.v1`, while `accepted-domain` and `occupied-midpoint-band` also lack product providers. Output `midpoint-nomination` therefore cannot carry a complete native product lineage.",
  ],
  [
    "gradient.transition-stage-midpoint",
    "Input `transition-paths` carries historical path observations and `midpoint-policy` is unavailable; the mechanism's recorded support is isolated-semantic only. Output `midpoint-nomination` is therefore diagnostic-only for this formulation and cannot establish the native-band lineage required by the replacement route.",
  ],
  [
    "gradient.transition-support-and-flat-fallback",
    "Input `treatment` (`artifact.treatment.palette-working-exact-source.v1`) has no product provider, while `transition-paths` is historical path evidence. Outputs `publication-decision` and `exact-stop-path` are diagnostic publication/fallback records, not an admitted final treatment, so this formulation cannot close the product route.",
  ],
]);
if (
  CONDEMNED_RESEARCH.size !== CONDEMNED_IDS.size ||
  [...CONDEMNED_IDS].some((id) => !CONDEMNED_RESEARCH.has(id))
) {
  throw new Error("Every condemned mechanism requires one source-specific researched failure.");
}

const SOURCE = "artifact.source.encoded-artwork-image.v1";
const RASTER = "artifact.raster.native-srgb8-opaque.v1";
const OCCUPANCY = "artifact.measurement.native-color-occupancy.v1";
const ABSTENTION = "artifact.decision.planned-mechanism-abstention.v1";
const ALPHA_REFUSAL = "artifact.decision.alpha-not-opaque-refusal.v1";
const ADMITTED_TREATMENT = "artifact.treatment.admitted-final.v1";
const JOINT_HYPOTHESES = "artifact.treatment.joint-role-hypotheses.v1";
const FINITE_FACTORS = "artifact.treatment.finite-role-factors.v1";
const SWAP_LEGAL_DOMAIN = "artifact.treatment.swap-legal-candidate-domain.v1";
const SELECTED_DECISION = "artifact.decision.selected-treatment-hypothesis.v1";
const SELECTED_TREATMENT = "artifact.treatment.selected-source-ordinary.v1";
const REPAIR_WINNER_INPUT = "artifact.treatment.repair-winner-input.v1";
const REPAIR_RESULT = "artifact.treatment.repair-result.v1";
const REPAIRED_TREATMENT = "artifact.treatment.repaired-source-ordinary.v1";
const SELECTION_FEASIBILITY = "artifact.decision.exact-source-selection-feasibility.v1";
const INFEASIBILITY_PROOF = "artifact.proof.exact-source-selection-infeasibility.v1";
const NATIVE_WITNESSES = "artifact.candidate.native-witness-redemption.v1";
const EXACT_NATIVE_PIXELS = "artifact.candidate.exact-native-pixel-admission.v1";
const ADMISSION = "publication.ordinary-exact-source-admission";
const MATERIALIZER = "publication.ui-palette-v3-materializer";
const JOINT_HYPOTHESIS_CONSTRUCTION = "treatment.joint-hypothesis-construction";
const FINITE_FACTOR_CONSTRUCTION = "treatment.finite-factor-construction";
const SWAPPED_CANDIDATE_DOMAIN_INSERTION = "treatment.swapped-candidate-domain-insertion";
const SELECTED_TREATMENT_ROLE_REIFICATION = "treatment.selected-treatment-role-reification";
const SELECTED_DECISION_MECHANISM = "selection.total-order-election";
const REPAIR_WINNER_INPUT_CONSTRUCTION = "repair.winner-input-construction";
const REPAIR_MECHANISM = "repair.exact-source-admission";
const REPAIR_RESULT_ROLE_REIFICATION = "repair.result-role-reification";
const EXACT_SOURCE_INFEASIBILITY_PROOF = "selection.exact-source-infeasibility-proof";
const EMERGENCY_EXACT_SOURCE_ADMISSION = "publication.emergency-exact-source-admission";

const sourcePublicationPaths = [
  "/metadata/algorithmVersion",
  "/metadata/preprocessingVersion",
  "/metadata/inputContentHash",
  "/metadata/sourceRendition/path",
  "/metadata/sourceRendition/width",
  "/metadata/sourceRendition/height",
  "/metadata/sourceRendition/format",
  "/metadata/processedSize/width",
  "/metadata/processedSize/height",
];
const rolePublicationPaths = ["background", "surface", "foreground", "accent"].flatMap((role) => [
  `/roles/${role}/rgb`,
  `/roles/${role}/hex`,
]);
const treatmentPublicationPaths = [
  "/contractVersion",
  ...rolePublicationPaths,
  "/gradient",
  "/collapse/surfaceCollapsed",
  "/collapse/accentCollapsed",
  "/contrast/minTextContrast/requestedLc",
  "/contrast/minTextContrast/effectiveRawMagnitude",
  "/contrast/minAccentContrast/requestedLc",
  "/contrast/minAccentContrast/effectiveRawMagnitude",
  ...sourcePublicationPaths,
];

const treatmentPaths = [
  "/sourceFingerprint",
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
  ...treatmentPublicationPaths,
  "/treatmentKind",
  "/gradient/stops",
  "/gradient/path",
  "/gradient/endpoints",
];
const treatmentIdentityPaths = treatmentPaths.filter((path) => path !== "/sourceFingerprint");
const selectedTreatmentRecordContentPaths = treatmentIdentityPaths.filter(
  (path) => !["/selectedTreatmentRecord", "/selectedTreatmentRecords"].includes(path),
);
const selectedTreatmentRecordPaths = selectedTreatmentRecordContentPaths.map(
  (path) => `/selectedTreatmentRecord${path}`,
);
const admittedTreatmentPaths = [
  ...treatmentIdentityPaths,
  "/treatmentVariant",
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
];
const emergencyAdmissionPaths = [
  "/admission/infeasibilityProofId",
  "/admission/evaluatedCandidateIds",
  "/admission/exhaustedConstraintWitnesses",
  "/admission/zeroFeasibleCount",
];
const emergencyAdmittedTreatmentPaths = [
  ...admittedTreatmentPaths,
  ...emergencyAdmissionPaths,
];
const emergencyFlatWitnessPaths = [
  ...treatmentIdentityPaths,
  "/occupiedColorIds",
  "/roles/background/occupiedColorId",
  "/roles/background/nativePixelWitness",
  "/roles/surface/occupiedColorId",
  "/roles/surface/nativePixelWitness",
  "/roles/foreground/occupiedColorId",
  "/roles/foreground/nativePixelWitness",
  "/roles/accent/occupiedColorId",
  "/roles/accent/nativePixelWitness",
];
const candidateIdentityPaths = treatmentIdentityPaths.filter((path) => path !== "/treatmentId");
const sourceIdentityPaths = [
  "/sourceImageId",
  "/nativeRasterId",
  "/provenanceChain",
  ...sourcePublicationPaths,
];
const roleDomainPaths = [
  ...sourceIdentityPaths,
  "/roleCueIds",
  "/relationConstraintIds",
  "/swapLegalityIds",
  "/candidateIds",
  "/roleCandidateAssignments",
];
const candidateObservationPaths = [
  ...sourceIdentityPaths,
  "/candidateIds",
  "/candidateSourceColorIds",
  "/candidateNativePixelWitnesses",
];
const rankingPaths = [
  ...roleDomainPaths,
  "/candidateSourceColorIds",
  "/candidateNativePixelWitnesses",
  "/roleRankingScores",
  "/scoreComponentIds",
];
const rolePoolPaths = [
  ...rankingPaths,
  "/roleQualifiedCandidateRecords",
  "/roleQualifiedCandidateIds",
  "/roleQualifiedRoles",
  "/roleQualifiedSourceColorIds",
  "/roleQualifiedNativePixelWitnesses",
];
const ordinaryWitnessPaths = [
  ...roleDomainPaths,
  "/witnessRole",
  "/selectedRoleCandidateRecord",
  "/selectedRoleCandidateRecord/witnessRole",
  "/selectedRoleCandidateRecord/selectedRoleCandidateId",
  "/selectedRoleCandidateRecord/selectedSourceColorId",
  "/selectedRoleCandidateRecord/nativePixelWitness",
  "/selectedRoleCandidateId",
  "/selectedSourceColorId",
  "/nativePixelWitness",
];
const jointHypothesisPaths = [
  ...roleDomainPaths,
  "/roleWitnessRecords",
  "/jointHypothesisIds",
  "/jointRoleBindings",
];
const finiteFactorPaths = [
  ...jointHypothesisPaths,
  "/factorIds",
  "/factorAssignments",
];
const swapLegalDomainPaths = [
  ...finiteFactorPaths,
  "/candidateDomainId",
  "/paletteDomainId",
  "/selectionObjectiveId",
  "/candidateTreatmentRecords",
  "/swappedCandidateIds",
  "/legalSwapIds",
];
const selectedDecisionIdentityPaths = [
  ...sourceIdentityPaths,
  "/candidateDomainId",
  "/paletteDomainId",
  "/candidateIds",
  "/selectedCandidateId",
  "/selectedHypothesisId",
  "/selectedCandidateIds",
  "/selectionObjectiveId",
];
const selectedDecisionPaths = [
  ...selectedDecisionIdentityPaths,
  "/selectedTreatmentRecord",
  "/selectedTreatmentRecords",
  ...selectedTreatmentRecordPaths,
  "/selectionEvidenceIds",
  "/selectionFeasible",
];
const repairWinnerPaths = [
  ...treatmentIdentityPaths,
  "/occupiedColorIds",
  "/roles/background/occupiedColorId",
  "/roles/background/nativePixelWitness",
  "/roles/surface/occupiedColorId",
  "/roles/surface/nativePixelWitness",
  "/roles/foreground/occupiedColorId",
  "/roles/foreground/nativePixelWitness",
  "/roles/accent/occupiedColorId",
  "/roles/accent/nativePixelWitness",
  "/repair/winnerInputId",
  "/repair/failedConstraintIds",
];
const repairResultPaths = [
  ...repairWinnerPaths,
  "/repair/resultId",
  "/repair/appliedActionIds",
];
const selectionFeasibilityPaths = [
  ...sourceIdentityPaths,
  "/candidateDomainId",
  "/paletteDomainId",
  "/selectionObjectiveId",
  "/evaluatedCandidateIds",
  "/occupiedColorIds",
  "/feasibleExactSourceTreatmentCount",
  "/selectionConstraintFailures",
  "/selectionFeasible",
];
const infeasibilityProofPaths = [
  ...sourceIdentityPaths,
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
  "/proof/proofId",
];
const v3PaletteRequiredPaths = [
  ...treatmentPublicationPaths,
];
const treatmentKindConstraint = {
  valuePath: "/treatmentKind",
  comparator: "in",
  value: ["flat", "gradient"],
};
const flatTreatmentConstraint = {
  valuePath: "/treatmentKind",
  comparator: "equals",
  value: "flat",
};
const ordinaryAdmissionConstraint = {
  valuePath: "/admission/kind",
  comparator: "equals",
  value: "ordinary",
};
const emergencyAdmissionConstraint = {
  valuePath: "/admission/kind",
  comparator: "equals",
  value: "emergency-flat",
};
const admittedTreatmentConstraint = {
  valuePath: "/admission/kind",
  comparator: "in",
  value: ["ordinary", "emergency-flat"],
};
const allRequiredColorsOccupiedConstraint = {
  valuePath: "/admission/allRequiredColorsOccupied",
  comparator: "equals",
  value: true,
};
const opaqueRasterConstraint = {
  valuePath: "/allPixelsOpaque",
  comparator: "equals",
  value: true,
};
const unavailableReadiness = {
  fixedConfigRefs: [],
  requiredNonProductInputs: [],
  implementationAvailable: false,
  fixtureAvailable: false,
  visualizationAvailable: false,
  humanScoreAvailable: false,
};

function slug(value) {
  return value.replaceAll(/[^a-z0-9]+/gi, "-").replaceAll(/^-|-$/g, "").toLowerCase();
}

function camel(value) {
  return slug(value).replaceAll(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}

function port(id, artifactTypeId, cardinality = "exactly-one", constraints = [], identityPaths = []) {
  return { id, artifactTypeId, cardinality, constraints, identityPaths };
}

function binding(consumerPortId, producerInstanceId, producerPortId, equalityConstraints = []) {
  return { consumerPortId, producerInstanceId, producerPortId, equalityConstraints };
}

function crossPortConstraint(leftPortId, leftValuePath, relation, rightPortId, rightValuePath) {
  return { leftPortId, leftValuePath, relation, rightPortId, rightValuePath };
}

function preserveAcrossPorts(inputPortId, outputPortId, paths) {
  return paths.map((valuePath) =>
    crossPortConstraint(inputPortId, valuePath, "equals", outputPortId, valuePath));
}

function identityEquality(paths = ["/sourceImageId", "/nativeRasterId"]) {
  return paths.map((valuePath) => ({ producerValuePath: valuePath, consumerValuePath: valuePath }));
}

function constraints(valueConstraints = []) {
  return valueConstraints.map(({ notes: _notes, ...constraint }) => constraint);
}

function step(instanceId, mechanismId, productBindings, readinessBindings = { fixedConfigRefs: [], nonProductInputs: [] }) {
  return { instanceId, mechanismId, selectedOutputBranch: "success", productBindings, readinessBindings };
}

function sidecars(id) {
  return {
    fixtureId: `fixture.${id}.v1`,
    visualizationId: `visualization.${id}.v1`,
    humanScoreId: `human-score.${id}.v1`,
    availability: "planned-unavailable",
  };
}

function outputNoun(id) {
  if (id.includes("graph")) return "nodesAndEdges";
  if (id.includes("partition") || id.includes("regionization")) return "regionMembership";
  if (id.includes("measurement") || id.includes("check") || id.includes("simulation")) return "measurements";
  if (id.includes("proposal") || id.includes("pool")) return "proposals";
  if (id.includes("ranking") || id.includes("ordering")) return "orderedEntries";
  if (id.includes("selection") || id.includes("witness")) return "selectedEntries";
  if (id.includes("treatment") || id.includes("palette")) return "roleTreatments";
  if (id.includes("proof") || id.includes("diagnosis") || id.includes("verification")) return "certificates";
  if (id.includes("layout") || id.includes("trellis") || id.includes("path")) return "structure";
  return "computedValues";
}

function semanticPrefix(id) {
  const prefix = id.split(".", 1)[0];
  return prefix === "field" ? "domain"
    : prefix === "role" ? "roles"
    : prefix === "candidate" ? "candidates"
    : prefix === "gradient" ? "gradient"
    : prefix === "treatment" ? "treatment"
    : prefix === "repair" ? "treatment"
    : prefix === "ordering" ? "ordering"
    : prefix === "selection" ? "selection"
    : prefix === "validation" ? "validation"
    : prefix === "saliency" ? "saliency"
    : prefix === "transform" ? "treatment"
    : prefix === "emergency" ? "validation"
    : prefix === "publication" ? "treatment"
    : prefix === "raster" ? "raster"
    : "evidence";
}

function mainArtifactId(id) {
  if (id === "raster.native-artwork-decode") return RASTER;
  if (id === "candidate.native-witness-redemption") return NATIVE_WITNESSES;
  if (id === "publication.exact-native-pixel-admission") return EXACT_NATIVE_PIXELS;
  if (id === JOINT_HYPOTHESIS_CONSTRUCTION) return JOINT_HYPOTHESES;
  if (id === FINITE_FACTOR_CONSTRUCTION) return FINITE_FACTORS;
  if (id === SWAPPED_CANDIDATE_DOMAIN_INSERTION) return SWAP_LEGAL_DOMAIN;
  if (id === SELECTED_DECISION_MECHANISM) return SELECTED_DECISION;
  if (id === SELECTED_TREATMENT_ROLE_REIFICATION) return SELECTED_TREATMENT;
  if (id === REPAIR_WINNER_INPUT_CONSTRUCTION) return REPAIR_WINNER_INPUT;
  if (id === REPAIR_MECHANISM) return REPAIR_RESULT;
  if (id === REPAIR_RESULT_ROLE_REIFICATION) return REPAIRED_TREATMENT;
  if (id === EXACT_SOURCE_INFEASIBILITY_PROOF) return INFEASIBILITY_PROOF;
  if (id === ADMISSION || id === EMERGENCY_EXACT_SOURCE_ADMISSION) return ADMITTED_TREATMENT;
  if (id === MATERIALIZER) return "artifact.product.ui-palette.v3";
  const prefix = semanticPrefix(id);
  return `artifact.${prefix}.${slug(id)}.v1`;
}

function treatmentFields(includeTreatmentId, admitted = false) {
  const paths = admitted ? ["/sourceFingerprint", ...emergencyAdmittedTreatmentPaths] : treatmentPaths;
  return paths
    .filter((path) => includeTreatmentId || path !== "/treatmentId")
    .map((valuePath) => ({
      valuePath,
      valueKind: valueKindForPath(valuePath),
      required:
        !valuePath.startsWith("/gradient/") &&
        valuePath !== "/sourceFingerprint" &&
        valuePath !== "/admission/infeasibilityProofId",
    }));
}

function valueKindForPath(valuePath) {
  if (valuePath.startsWith("/selectedTreatmentRecord/")) {
    return valueKindForPath(valuePath.slice("/selectedTreatmentRecord".length));
  }
  if (valuePath.endsWith("/rgb")) return "collection";
  if (valuePath.endsWith("/hex")) return "scalar";
  if (valuePath === "/gradient") return "state";
  if (valuePath === "/selectedRoleCandidateRecord") return "object";
  if (
    valuePath.includes("/color") ||
    valuePath.endsWith("Id") ||
    valuePath.endsWith("Count") ||
    valuePath === "/sourceFingerprint" ||
    valuePath === "/nativeRasterId" ||
    valuePath.endsWith("/treatmentKind") ||
    valuePath === "/treatmentVariant" ||
    valuePath === "/admission/kind" ||
    valuePath === "/admission/allRequiredColorsOccupied" ||
    valuePath === "/selectedTreatmentRecord" ||
    valuePath === "/selectionFeasible" ||
    valuePath === "/proof/ordinaryImpossibilityCertified" ||
    valuePath === "/proof/predicate" ||
    valuePath === "/proof/certificateKind" ||
    valuePath === "/contractVersion" ||
    valuePath.includes("/contrast/") ||
    valuePath.startsWith("/metadata/") ||
    valuePath.startsWith("/collapse/") ||
    valuePath.startsWith("/selectedRoleCandidateRecord/")
  ) return "scalar";
  return "collection";
}

function inspectionForFields(fields, note) {
  return fields.map(({ valuePath, valueKind }) => ({
    valuePath,
    valueKind,
    permittedConstraints: valuePath.endsWith("/treatmentKind")
      ? [
          { comparator: "in", value: ["flat", "gradient"] },
          { comparator: "equals", value: "flat" },
          { comparator: "equals", value: "gradient" },
        ]
      : valuePath === "/feasibleExactSourceTreatmentCount" ||
          valuePath === "/proof/zeroFeasibleCount" ||
          valuePath === "/admission/zeroFeasibleCount"
        ? [{ comparator: "equals", value: 0 }]
      : valuePath === "/treatmentVariant"
        ? [
            { comparator: "in", value: ["flat", "gradient", "emergency-flat"] },
            { comparator: "in", value: ["flat", "gradient"] },
            { comparator: "equals", value: "flat" },
            { comparator: "equals", value: "gradient" },
            { comparator: "equals", value: "emergency-flat" },
          ]
      : valuePath === "/admission/kind"
        ? [
            { comparator: "in", value: ["ordinary", "emergency-flat"] },
            { comparator: "equals", value: "ordinary" },
            { comparator: "equals", value: "emergency-flat" },
          ]
      : valuePath === "/allPixelsOpaque" || valuePath === "/admission/allRequiredColorsOccupied"
        ? [{ comparator: "equals", value: true }]
      : valuePath === "/contractVersion"
        ? [{ comparator: "equals", value: "v3-contract-0.1.0" }]
      : valuePath === "/gradient"
        ? [{ comparator: "in", value: [null, "present"] }]
      : valuePath.endsWith("/rgb")
        ? [{ comparator: "count-equals", value: 3 }]
      : valuePath.startsWith("/collapse/")
        ? [{ comparator: "in", value: [true, false] }]
      : valuePath === "/selectionFeasible"
        ? [{ comparator: "equals", value: false }]
      : valuePath === "/proof/ordinaryImpossibilityCertified"
        ? [{ comparator: "equals", value: true }]
      : valuePath === "/proof/predicate"
        ? [{ comparator: "equals", value: "ordinary-exact-source-impossible" }]
      : valuePath === "/proof/certificateKind"
        ? [{ comparator: "equals", value: "exhaustive-domain-native-occupancy" }]
      : valuePath === "/encodedBytes/mediaType"
        ? [{ comparator: "in", value: ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"] }]
      : valuePath === "/alphaObserved"
        ? [{ comparator: "equals", value: true }]
      : valuePath === "/reason"
        ? [{ comparator: "in", value: ["non-opaque-pixels", "insufficient-evidence", "infeasible-domain", "invalid-input"] }]
      : valuePath === "/roleAssignments" || valuePath === "/roleCandidateAssignments"
        ? [{ comparator: "count-equals", value: 4 }]
      : valuePath === "/gradient/stops" || valuePath === "/gradient/path" || valuePath === "/gradient/endpoints"
        ? [{ comparator: "count-between-inclusive", value: [2, 4] }]
      : valuePath === "/selectedCandidateIds"
        ? [{ comparator: "count-between-inclusive", value: [1, 4] }]
      : valuePath === "/selectedTreatmentRecords"
        ? [{ comparator: "count-equals", value: 1 }]
      : valuePath === "/selectedTreatmentRecord"
        ? [{ comparator: "equals", value: "present" }]
      : valuePath === "/admission/evaluatedCandidateIds"
        ? [{ comparator: "count-between-inclusive", value: [1, 4096] }]
      : valueKind === "collection"
        ? [{ comparator: "count-between-inclusive", value: [1, 4096] }]
      : valuePath === "/sourceFingerprint" || valuePath === "/metadata/inputContentHash"
        ? [{ comparator: "matches", value: "^[0-9a-f]{64}$" }]
      : valuePath.includes("/color") || valuePath.endsWith("/hex")
        ? [{ comparator: "matches", value: "^#[0-9a-f]{6}$" }]
        : [{ comparator: "matches", value: "^[A-Za-z0-9][A-Za-z0-9._:/-]*$" }],
    notes: [note],
    semanticRole: semanticRoleForPath(valuePath),
  }));
}

function semanticRoleForPath(valuePath) {
  if (["/sourceFingerprint", "/sourceImageId", "/nativeRasterId", "/provenanceChain"].includes(valuePath)) return "identity.source";
  if (valuePath === "/selectedTreatmentRecord" || valuePath === "/selectedTreatmentRecords" || valuePath.startsWith("/selectedTreatmentRecord/")) return "treatment.selected-record";
  if (valuePath.startsWith("/roles/") || valuePath.includes("role") || valuePath.includes("Role")) return "palette.role-color";
  if (valuePath.startsWith("/gradient/")) return "palette.gradient";
  if (valuePath.startsWith("/admission/") || valuePath === "/treatmentVariant") return "admission.exact-source";
  if (valuePath.includes("candidate") || valuePath.includes("Candidate")) return "candidate.source-color";
  if (valuePath.includes("witness") || valuePath.includes("Witness")) return "witness.native-pixel";
  return `domain.${valuePath.split("/").filter(Boolean)[0] ?? "value"}`;
}

function admittedRelations() {
  const roles = ["background", "surface", "foreground", "accent"];
  return [
    ...roles.flatMap((role) => [
      { id: `${role}-color-id`, kind: "equals", subjectPath: `/roles/${role}/color`, objectPath: `/roles/${role}/occupiedColorId` },
      { id: `${role}-color-hex`, kind: "equals", subjectPath: `/roles/${role}/color`, objectPath: `/roles/${role}/hex` },
      { id: `${role}-rgb-hex`, kind: "rgb-hex-equivalent", subjectPath: `/roles/${role}/rgb`, objectPath: `/roles/${role}/hex` },
      { id: `${role}-occupied`, kind: "member-of", subjectPath: `/roles/${role}/occupiedColorId`, objectPath: "/occupiedColorIds" },
      { id: `${role}-witness`, kind: "aligned-witness", subjectPath: `/roles/${role}/occupiedColorId`, objectPath: `/roles/${role}/nativePixelWitness` },
    ]),
    { id: "gradient-colors-occupied", kind: "subset-of", subjectPath: "/gradient/stopColorIds", objectPath: "/occupiedColorIds", whenVariant: "gradient" },
    { id: "gradient-occupied-aligned", kind: "aligned-equals", subjectPath: "/gradient/stopColorIds", objectPath: "/gradient/stopOccupiedColorIds", whenVariant: "gradient" },
    { id: "gradient-witnesses-aligned", kind: "aligned-witness", subjectPath: "/gradient/stopOccupiedColorIds", objectPath: "/gradient/stopNativePixelWitnesses", whenVariant: "gradient" },
    { id: "gradient-endpoint-colors-occupied", kind: "subset-of", subjectPath: "/gradient/endpointColorIds", objectPath: "/occupiedColorIds", whenVariant: "gradient" },
    { id: "gradient-endpoint-occupied-aligned", kind: "aligned-equals", subjectPath: "/gradient/endpointColorIds", objectPath: "/gradient/endpointOccupiedColorIds", whenVariant: "gradient" },
    { id: "gradient-endpoint-witnesses-aligned", kind: "aligned-witness", subjectPath: "/gradient/endpointOccupiedColorIds", objectPath: "/gradient/endpointNativePixelWitnesses", whenVariant: "gradient" },
    { id: "gradient-variant-semantics", kind: "variant-semantics", subjectPath: "/treatmentVariant", objectPath: "/gradient" },
    { id: "surface-collapse-equivalence", kind: "collapse-equivalence", subjectPath: "/collapse/surfaceCollapsed", objectPath: "/roles/surface/hex" },
    { id: "accent-collapse-equivalence", kind: "collapse-equivalence", subjectPath: "/collapse/accentCollapsed", objectPath: "/roles/accent/hex" },
    { id: "native-width-preserved", kind: "equals", subjectPath: "/metadata/sourceRendition/width", objectPath: "/metadata/processedSize/width" },
    { id: "native-height-preserved", kind: "equals", subjectPath: "/metadata/sourceRendition/height", objectPath: "/metadata/processedSize/height" },
  ];
}

function operationRelations(id) {
  if (id === INFEASIBILITY_PROOF) {
    return [{ id: "exhausted-candidates-aligned", kind: "aligned-witness", subjectPath: "/proof/evaluatedCandidateIds", objectPath: "/proof/exhaustedConstraintWitnesses" }];
  }
  return [];
}

function admittedVariants() {
  const gradients = [
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
  const variant = (id, treatmentKind, admissionKind, requiredPaths, forbiddenPaths) => ({
    id,
    discriminatorConstraints: [
      { valuePath: "/treatmentVariant", comparator: "equals", value: id },
      { valuePath: "/treatmentKind", comparator: "equals", value: treatmentKind },
      { valuePath: "/admission/kind", comparator: "equals", value: admissionKind },
    ],
    requiredPaths,
    forbiddenPaths,
  });
  const common = admittedTreatmentPaths.filter(
    (path) => path !== "/treatmentVariant" && !gradients.includes(path),
  );
  return [
    variant("flat", "flat", "ordinary", common, [...gradients, ...emergencyAdmissionPaths]),
    variant("gradient", "gradient", "ordinary", [...common, ...gradients], emergencyAdmissionPaths),
    variant("emergency-flat", "flat", "emergency-flat", [...common, ...emergencyAdmissionPaths], gradients),
  ];
}

const collectionConstraint = [{ comparator: "count-between-inclusive", value: [1, 16777216] }];
const boundedCollectionConstraint = [{ comparator: "count-between-inclusive", value: [1, 4096] }];
const identifierConstraint = [{ comparator: "matches", value: "^[A-Za-z0-9][A-Za-z0-9._:/-]*$" }];
const computationalFieldSpecs = new Map([
  ["evidence.native-raster-primitives", [["/nativePixelCoordinates", "collection", "raster.native-pixel-lattice"], ["/intensitySamples", "collection", "measurement.native-intensity"], ["/oklabSamples", "collection", "measurement.native-oklab"], ["/rgbxyCoordinates", "collection", "measurement.native-rgbxy"], ["/morphologySignal", "collection", "measurement.soft-morphology-input"]]],
  ["evidence.native-pixel-graph-construction", [["/pixelNodeIds", "collection", "graph.native-pixel-nodes"], ["/adjacentPixelPairs", "collection", "graph.native-pixel-edges"], ["/neighborhoodKind", "scalar", "graph.neighborhood-policy", [{ comparator: "in", value: ["four-connected", "eight-connected"] }]]]],
  ["evidence.native-edge-dissimilarity-measurement", [["/edgeIds", "collection", "graph.measured-edges"], ["/oklabEdgeDistances", "collection", "measurement.edge-dissimilarity"], ["/distanceConvention", "scalar", "measurement.distance-convention", [{ comparator: "equals", value: "oklab-euclidean" }]]]],
  ["evidence.native-component-local-measurement", [["/componentIds", "collection", "region.component-identities"], ["/componentPixelMemberships", "collection", "region.component-membership"], ["/componentAreas", "collection", "measurement.component-area"], ["/componentBounds", "collection", "measurement.component-bounds"], ["/localContrastValues", "collection", "measurement.component-local-contrast"]]],
  ["evidence.deterministic-signed-affinity-construction", [["/orderedEdgeIds", "collection", "graph.stable-edge-order"], ["/attractiveAffinities", "collection", "measurement.attractive-affinity"], ["/repulsiveAffinities", "collection", "measurement.repulsive-affinity"]]],
  ["evidence.lifted-base-graph-construction", [["/baseNodeIds", "collection", "graph.base-nodes"], ["/baseEdgePairs", "collection", "graph.base-edges"], ["/baseEdgeCosts", "collection", "measurement.base-edge-costs"]]],
  ["evidence.lifted-nonlocal-edge-construction", [["/nonlocalEdgePairs", "collection", "graph.lifted-nonlocal-edges"], ["/nonlocalEdgeCosts", "collection", "measurement.nonlocal-edge-costs"], ["/sourceRelationIds", "collection", "evidence.nonlocal-source-relations"]]],
  ["evidence.native-slic-partition", [["/regionIds", "collection", "partition.slic-region-identities"], ["/pixelRegionAssignments", "collection", "partition.native-pixel-membership"], ["/regionAdjacencyPairs", "collection", "graph.slic-region-adjacency"]]],
  ["evidence.partition-native-region-measurement", [["/partitionId", "scalar", "partition.provider-identity"], ["/regionIds", "collection", "partition.region-identities"], ["/nativePixelMemberships", "collection", "partition.native-membership"], ["/regionMeasurements", "collection", "measurement.region-statistics"]]],
  ["evidence.region-boundary-statistics", [["/adjacentRegionPairs", "collection", "graph.region-adjacency"], ["/sharedBoundaryLengths", "collection", "measurement.boundary-contact"], ["/borderContactLengths", "collection", "measurement.frame-contact"], ["/regionColorDistances", "collection", "measurement.region-color-distance"]]],
  ["candidate.region-color-proposal-extraction", [["/proposalIds", "collection", "candidate.region-color-identities"], ["/proposedSourceColors", "collection", "candidate.exact-source-colors"], ["/sourcePixelWitnesses", "collection", "witness.native-pixels"], ["/sourceRegionIds", "collection", "candidate.source-regions"]]],
  ["evidence.texture-distribution-segmentation", [["/textureRegionIds", "collection", "partition.texture-region-identities"], ["/pixelTextureAssignments", "collection", "partition.texture-membership"], ["/descriptorDistributions", "collection", "measurement.texture-distributions"], ["/noiseScaleIds", "collection", "measurement.noise-scale-bindings"]]],
  ["evidence.rtv-structure-regionization", [["/rtvRegionIds", "collection", "partition.rtv-region-identities"], ["/nativePixelMemberships", "collection", "partition.rtv-native-membership"], ["/structureValueBands", "collection", "measurement.rtv-structure-bands"]]],
  ["evidence.tgv-field-regionization", [["/tgvRegionIds", "collection", "partition.tgv-region-identities"], ["/nativePixelMemberships", "collection", "partition.tgv-native-membership"], ["/regularizedFieldBands", "collection", "measurement.tgv-field-bands"]]],
  ["evidence.graph-trend-order0-input-construction", [["/signalNodeIds", "collection", "graph.trend-signal-nodes"], ["/nodeSignalValues", "collection", "measurement.graph-trend-signal"], ["/incidenceRows", "collection", "graph.order-zero-incidence"], ["/trendOrder", "scalar", "graph.trend-order", [{ comparator: "equals", value: 0 }]]]],
  ["evidence.graph-trend-order0-regionization", [["/plateauIds", "collection", "partition.graph-trend-plateaus"], ["/nodePlateauAssignments", "collection", "partition.graph-trend-membership"], ["/fittedSignalValues", "collection", "measurement.graph-trend-fit"], ["/fitResiduals", "collection", "measurement.graph-trend-residual"]]],
  ["evidence.fixed-soft-morphology-regionization", [["/morphologyRegionIds", "collection", "partition.morphology-regions"], ["/nativePixelMemberships", "collection", "partition.morphology-membership"], ["/responseThresholds", "collection", "measurement.morphology-thresholds"], ["/polarity", "scalar", "measurement.morphology-polarity", [{ comparator: "in", value: ["bright", "dark"] }]]]],
  ["evidence.native-family-evidence-construction", [["/familyIds", "collection", "family.native-identities"], ["/pixelFamilyAssignments", "collection", "family.native-membership"], ["/familyColorStatistics", "collection", "measurement.family-color-statistics"], ["/familySpreadValues", "collection", "measurement.family-spread"]]],
  ["evidence.native-family-component-graph-construction", [["/familyComponentIds", "collection", "graph.family-component-nodes"], ["/componentFamilyAssignments", "collection", "family.component-membership"], ["/componentAdjacencyPairs", "collection", "graph.family-component-edges"], ["/componentContactMeasurements", "collection", "measurement.component-contacts"]]],
  ["candidate.archetypoid-observation-construction", [["/sourceRowIds", "collection", "candidate.observed-source-rows"], ["/criterionIds", "collection", "decision.criterion-columns"], ["/observationMatrixRows", "collection", "measurement.candidate-observations"]]],
  ["field.family-border-domain-proposal", [["/fieldProposalIds", "collection", "field.proposal-identities"], ["/nativeRegionMemberships", "collection", "field.proposed-regions"], ["/borderOwnershipScores", "collection", "measurement.field-border-support"], ["/endpointSupportBands", "collection", "field.endpoint-support"]]],
  ["field.robust-surface-domain-proposal", [["/surfaceProposalIds", "collection", "field.robust-surface-identities"], ["/inlierRegionMemberships", "collection", "field.robust-inlier-regions"], ["/robustFitScores", "collection", "measurement.robust-field-fit"]]],
  ["field.regularized-region-domain-proposal", [["/regularizedProposalIds", "collection", "field.regularized-identities"], ["/providerRegionMemberships", "collection", "field.provider-regions"], ["/fieldComplexityScores", "collection", "measurement.field-complexity"], ["/exactStopPaths", "collection", "field.exact-source-stop-paths"]]],
  ["field.hierarchy-domain-proposal", [["/hierarchyProposalIds", "collection", "field.hierarchy-proposal-identities"], ["/hierarchyNodeIds", "collection", "field.hierarchy-source-nodes"], ["/nativeRegionMemberships", "collection", "field.hierarchy-region-membership"]]],
  ["field.pixel-cue-domain-proposal", [["/pixelCueProposalIds", "collection", "field.pixel-cue-identities"], ["/nativeRegionMemberships", "collection", "field.pixel-cue-regions"], ["/rankEvidenceTotals", "collection", "measurement.pixel-rank-support"], ["/surroundEvidenceTotals", "collection", "measurement.surround-support"]]],
  ["field.domain-evidence-election", [["/evaluatedProposalIds", "collection", "field.evaluated-proposals"], ["/acceptedDomainIds", "collection", "field.accepted-domain-identities"], ["/domainEvidenceScores", "collection", "measurement.field-domain-evidence"], ["/electionStatus", "scalar", "decision.field-domain-status", [{ comparator: "in", value: ["accepted", "abstained"] }]]]],
  ["field.accepted-domain-measurement", [["/acceptedDomainIds", "collection", "field.accepted-domain-identities"], ["/endpointBands", "collection", "field.accepted-endpoint-bands"], ["/domainGeometryMeasurements", "collection", "measurement.field-geometry"], ["/domainSupportMeasurements", "collection", "measurement.field-support"], ["/midpointCandidateIds", "collection", "candidate.exact-source-midpoints"]]],
  ["saliency.source-color-proposal-extraction", [["/salientColorProposalIds", "collection", "candidate.salient-color-identities"], ["/sourceColorIds", "collection", "candidate.salient-source-colors"], ["/saliencyScores", "collection", "measurement.color-saliency"], ["/nativePixelWitnesses", "collection", "witness.salient-native-pixels"]]],
  ["evidence.salient-mark-measurement", [["/markIds", "collection", "evidence.salient-mark-identities"], ["/compactnessValues", "collection", "measurement.mark-compactness"], ["/repetitionValues", "collection", "measurement.mark-repetition"], ["/coherenceValues", "collection", "measurement.mark-coherence"], ["/perMassScores", "collection", "measurement.mark-per-mass"]]],
  ["role.text-cue-measurement", [["/textCueIds", "collection", "role.text-cue-identities"], ["/textLikeCandidateIds", "collection", "candidate.text-like-colors"], ["/foregroundPolarityValues", "collection", "measurement.foreground-polarity"], ["/fieldContrastValues", "collection", "measurement.text-field-contrast"]]],
  ["role.artwork-family-relation-measurement", [["/roleCueIds", "collection", "role.cue-identities"], ["/relationConstraintIds", "collection", "role.family-relations"], ["/cueCandidateBindings", "collection", "role.cue-candidate-bindings"]]],
  ["role.treatment-swap-legality-measurement", [["/relationConstraintIds", "collection", "role.family-relations"], ["/swapLegalityIds", "collection", "role.swap-legality"], ["/legalSwapPairs", "collection", "role.legal-swaps"]]],
  ["candidate.native-witness-redemption", [["/candidateIds", "collection", "candidate.redeemed-identities"], ["/candidateSourceColorIds", "collection", "candidate.exact-source-colors"], ["/candidateNativePixelWitnesses", "collection", "witness.native-pixels"], ["/roleCandidateAssignments", "collection", "role.candidate-bindings"]]],
  ["evidence.native-color-occupancy-measurement", [["/occupiedColorIds", "collection", "measurement.native-color-occupancy"], ["/occupiedPixelCounts", "collection", "measurement.native-color-counts"], ["/nativePixelWitnesses", "collection", "witness.native-pixels"]]],
  ["publication.exact-native-pixel-admission", [["/candidateIds", "collection", "candidate.exact-native-admissions"], ["/candidateSourceColorIds", "collection", "candidate.exact-source-colors"], ["/candidateNativePixelWitnesses", "collection", "witness.native-pixels"], ["/roleCandidateAssignments", "collection", "role.candidate-bindings"]]],
  ["gradient.native-transition-path-construction", [["/transitionPathIds", "collection", "gradient.native-paths"], ["/pathNativePixelIds", "collection", "gradient.native-membership"], ["/pathColorIds", "collection", "gradient.source-colors"]]],
  ["candidate.native-band-local-endpoints", [["/endpointPairIds", "collection", "gradient.endpoint-pairs"], ["/endpointColorIds", "collection", "gradient.endpoint-colors"], ["/endpointNativePixelWitnesses", "collection", "witness.native-pixels"]]],
  ["gradient.native-spatial-midpoint-band", [["/spatialMidpointIds", "collection", "gradient.spatial-midpoints"], ["/midpointBandBounds", "collection", "gradient.midpoint-bands"], ["/nativeMidpointWitnessIds", "collection", "witness.native-pixels"]]],
  ["gradient.native-transition-stage-midpoint", [["/transitionMidpointIds", "collection", "gradient.transition-midpoints"], ["/transitionStageIndexes", "collection", "gradient.transition-stages"], ["/nativeMidpointWitnessIds", "collection", "witness.native-pixels"]]],
  ["gradient.native-transition-publication", [["/publishedTransitionIds", "collection", "gradient.published-transitions"], ["/publishedPathColorIds", "collection", "gradient.source-colors"], ["/publishedNativeWitnessIds", "collection", "witness.native-pixels"]]],
  ["gradient.exact-source-pair-construction", [["/exactSourcePairIds", "collection", "gradient.exact-source-pairs"], ["/endpointColorIds", "collection", "gradient.endpoint-colors"], ["/endpointNativePixelWitnesses", "collection", "witness.native-pixels"]]],
  ["gradient.ramp-excursion-measurement", [["/exactSourcePairIds", "collection", "gradient.exact-source-pairs"], ["/rampExcursionValues", "collection", "measurement.gradient-excursion"], ["/returnCandidateColorIds", "collection", "gradient.return-colors"]]],
  ["gradient.exact-path-election", [["/electedPathIds", "collection", "gradient.elected-paths"], ["/electedStopColorIds", "collection", "gradient.source-colors"], ["/electedNativeWitnessIds", "collection", "witness.native-pixels"]]],
  ["selection.structured-objective-construction", [["/selectionObjectiveId", "scalar", "selection.objective-identity"], ["/criterionIds", "collection", "selection.criteria"], ["/objectiveTerms", "collection", "selection.objective-terms"]]],
  ["selection.multicriteria-table-construction", [["/alternativeIds", "collection", "selection.alternatives"], ["/criterionIds", "collection", "selection.criteria"], ["/criterionValues", "collection", "measurement.multicriteria-values"]]],
  ["selection.submodular-item-construction", [["/itemIds", "collection", "selection.submodular-items"], ["/coverageFeatureIds", "collection", "selection.coverage-features"], ["/itemCosts", "collection", "measurement.selection-costs"]]],
  ["selection.retained-subset-reification", [["/retainedCandidateIds", "collection", "selection.retained-subset"], ["/retentionWitnessIds", "collection", "selection.retention-witnesses"], ["/rejectedCandidateIds", "collection", "selection.rejected-subset"]]],
  ["selection.partial-preorder-linear-extension", [["/preorderClassIds", "collection", "selection.preorder-classes"], ["/linearExtensionIds", "collection", "selection.linear-extensions"], ["/incomparabilityWitnessIds", "collection", "selection.incomparabilities"]]],
  ["selection.retained-subset-ordering", [["/retainedCandidateIds", "collection", "selection.retained-subset"], ["/orderedRetainedCandidateIds", "collection", "selection.retained-order"], ["/orderingWitnessIds", "collection", "selection.order-witnesses"]]],
]);

function computationalFields(mechanismId) {
  const specs = computationalFieldSpecs.get(mechanismId);
  if (!specs) return undefined;
  return specs.map(([valuePath, valueKind, semanticRole, permittedConstraints]) => ({
    valuePath,
    valueKind,
    required: true,
    semanticRole,
    permittedConstraints: permittedConstraints ?? (valueKind === "collection" ? boundedCollectionConstraint : identifierConstraint),
  }));
}

function productArtifact(id, mechanism) {
  const complete = [SELECTED_TREATMENT, REPAIRED_TREATMENT, ADMITTED_TREATMENT].includes(id);
  const semanticFields = new Map([
    [NATIVE_WITNESSES, rankingPaths],
    [mainArtifactId("candidate.archetypoid-observation-construction"), candidateObservationPaths],
    [mainArtifactId("selection.structured-objective-construction"), [...sourceIdentityPaths, "/selectionObjectiveId", "/criterionIds", "/objectiveTerms"]],
    [JOINT_HYPOTHESES, jointHypothesisPaths],
    [FINITE_FACTORS, finiteFactorPaths],
    [SWAP_LEGAL_DOMAIN, swapLegalDomainPaths],
    [SELECTED_DECISION, selectedDecisionPaths],
    [REPAIR_WINNER_INPUT, repairWinnerPaths],
    [REPAIR_RESULT, repairResultPaths],
    [SELECTION_FEASIBILITY, selectionFeasibilityPaths],
    [INFEASIBILITY_PROOF, infeasibilityProofPaths],
  ]);
  const semanticPaths = semanticFields.get(id);
  const explicitComputationalFields = computationalFields(mechanism.id);
  const fields = complete
    ? id === REPAIRED_TREATMENT
      ? [
          ...treatmentFields(true),
          ...emergencyFlatWitnessPaths
            .filter((valuePath) => !treatmentPaths.includes(valuePath))
            .map((valuePath) => ({ valuePath, valueKind: valueKindForPath(valuePath), required: false })),
        ]
      : treatmentFields(true, id === ADMITTED_TREATMENT)
      : semanticPaths || explicitComputationalFields
      ? [...new Set([
          ...(semanticPaths ?? sourceIdentityPaths),
          ...(explicitComputationalFields ?? []).map((field) => field.valuePath),
        ])].map((valuePath) => ({
          valuePath,
          valueKind: explicitComputationalFields?.find((field) => field.valuePath === valuePath)?.valueKind ?? valueKindForPath(valuePath),
          required: true,
        }))
      : explicitComputationalFields
        ? [
          { valuePath: "/sourceFingerprint", valueKind: "scalar", required: false },
          { valuePath: "/sourceImageId", valueKind: "scalar", required: true },
          { valuePath: "/nativeRasterId", valueKind: "scalar", required: true },
          { valuePath: "/provenanceChain", valueKind: "collection", required: true },
          ...explicitComputationalFields.map(({ semanticRole: _semanticRole, permittedConstraints: _permittedConstraints, ...field }) => field),
        ]
        : undefined;
  if (!fields) throw new Error(`Missing computational payload fields for ${mechanism.id}.`);
  const explicitInspectionByPath = new Map(
    (explicitComputationalFields ?? []).map((field) => [field.valuePath, field]),
  );
  return {
    id,
    kind: "product",
    productFocus: "product-flow",
    semanticRoles: [...new Set([
      ...fields.map((field) => semanticRoleForPath(field.valuePath)),
      ...(explicitComputationalFields ?? []).map((field) => field.semanticRole),
      ...(complete
        ? [
            "palette.complete-treatment",
            ...(id === ADMITTED_TREATMENT
              ? [
                  "admission.exact-source-union",
                  `mechanism.${ADMISSION}`,
                  `mechanism.${EMERGENCY_EXACT_SOURCE_ADMISSION}`,
                ]
              : [`mechanism.${mechanism.id}`]),
          ]
        : [`mechanism.${mechanism.id}`]),
    ])],
    label: id === ADMITTED_TREATMENT ? "Exact-source admitted treatment" : complete ? `${mechanism.title} complete treatment` : `${mechanism.title} product`,
    description: complete
      ? id === ADMITTED_TREATMENT
        ? "An ordinary or emergency-flat treatment admitted only with explicit native occupancy membership witnesses for every required role and gradient-stop color."
        : `${mechanism.operation} The payload contains explicit role colors, treatment structure, conditional gradient data, and exact source identities.`
      : `${mechanism.operation} The payload exposes named computational measurements, memberships, decisions, or witnesses rather than a generic result envelope.`,
    payloadShape: {
      kind: "object",
      schemaRef: `schema://${id}`,
      description: `Typed product of ${mechanism.id}.`,
      fields,
      ...(id === ADMITTED_TREATMENT ? { variants: admittedVariants() } : {}),
    },
    valueInspection: {
      paths: inspectionForFields(fields, `Inspectable value computed by ${mechanism.id}.`).map((inspection) => {
        const explicit = explicitInspectionByPath.get(inspection.valuePath);
        return explicit
          ? { ...inspection, permittedConstraints: explicit.permittedConstraints, semanticRole: explicit.semanticRole }
          : inspection;
      }),
       ...((id === ADMITTED_TREATMENT || operationRelations(id).length > 0)
         ? { relations: id === ADMITTED_TREATMENT ? admittedRelations() : operationRelations(id) }
         : {}),
      notes: [`Human review can inspect the actual computational fields produced by ${mechanism.id}.`],
    },
  };
}

function sourceArtifact() {
  const fields = [
    { valuePath: "/sourceFingerprint", valueKind: "scalar", required: true },
    { valuePath: "/sourceImageId", valueKind: "scalar", required: true },
    { valuePath: "/encodedBytes/length", valueKind: "scalar", required: true },
    { valuePath: "/encodedBytes/mediaType", valueKind: "scalar", required: true },
  ];
  return {
    id: SOURCE,
    kind: "product",
    productFocus: "product-flow",
    semanticRoles: ["source.encoded-artwork", "identity.source", "domain.encodedBytes"],
    label: "Encoded artwork image file",
    description: "The exact artwork file bytes, media type, opaque custody fingerprint, and product source-image identity supplied at the product boundary.",
    payloadShape: { kind: "object", schemaRef: `schema://${SOURCE}`, description: "Encoded artwork byte contract.", fields },
    valueInspection: { paths: inspectionForFields(fields, "Encoded artwork file value."), notes: ["Inspection exposes file identity and encoding, not derived image evidence."] },
  };
}

function sidecarArtifact(id, label) {
  return {
    id,
    kind: "sidecar",
    productFocus: "secondary-overlay",
    label,
    description: `${label} registered independently from product flow.`,
    payloadShape: { kind: "object", schemaRef: `schema://${id}`, description: `${label} sidecar contract.`, fields: [] },
    valueInspection: { paths: [], notes: [`${label} is unavailable until independently produced.`] },
  };
}

const sourceOperations = new Map([
  ["raster.native-artwork-decode", "Decode the encoded artwork at native dimensions, preserve source identity, and refuse non-opaque pixels."],
  ["evidence.native-raster-primitives", "Measure native intensity, OKLab samples, RGBXY coordinates, and morphology signals on the decoded raster."],
  ["evidence.native-pixel-graph-construction", "Construct the pinned native-pixel neighborhood graph and enumerate its boundary-aware adjacency pairs."],
  ["evidence.native-edge-dissimilarity-measurement", "Measure every native graph edge with the pinned OKLab distance convention."],
  ["evidence.native-component-local-measurement", "Measure exact component membership, area, bounds, shape, and local contrast."],
  ["evidence.deterministic-signed-affinity-construction", "Transform edge dissimilarities into stable ordered attractive and repulsive affinities."],
  ["evidence.lifted-base-graph-construction", "Construct the costed local base graph used by lifted multicut alternatives."],
  ["evidence.lifted-nonlocal-edge-construction", "Construct bounded nonlocal edge pairs and costs from component and color relations."],
  ["evidence.native-slic-partition", "Partition the native pixel lattice with SLIC and retain exact pixel-to-region membership."],
  ["evidence.partition-native-region-measurement", "Validate a tagged partition and measure exact native members and region statistics."],
  ["evidence.region-boundary-statistics", "Measure region adjacency, contact lengths, border contact, and inter-region color distance."],
  ["candidate.region-color-proposal-extraction", "Extract observed source colors and native-pixel witnesses from exact region memberships."],
  ["evidence.texture-distribution-segmentation", "Segment native pixels by local texture-distribution distance under the measured noise scale."],
  ["evidence.rtv-structure-regionization", "Extract provider-tagged native regions from relative-total-variation structure values."],
  ["evidence.tgv-field-regionization", "Extract provider-tagged native regions from total-generalized-variation field values."],
  ["evidence.graph-trend-order0-input-construction", "Construct the node signal and order-zero incidence operator for graph trend filtering."],
  ["evidence.graph-trend-order0-regionization", "Extract constant fitted plateaus and residual evidence from an order-zero graph trend result."],
  ["evidence.fixed-soft-morphology-regionization", "Threshold a fixed soft-morphology response under explicit polarity and reconnect native members."],
  ["evidence.native-family-evidence-construction", "Aggregate native family memberships, occupied colors, spread, masks, and observed-color statistics."],
  ["evidence.native-family-component-graph-construction", "Join exact components to color families and measure component adjacency and contacts."],
  ["candidate.archetypoid-observation-construction", "Construct finite source-row observations and criterion columns for archetypoid and decision alternatives."],
  ["field.family-border-domain-proposal", "Propose field domains from family support, component geometry, and border ownership."],
  ["field.robust-surface-domain-proposal", "Convert robust inlier support into native-region field-domain proposals."],
  ["field.regularized-region-domain-proposal", "Score provider-tagged native regions for low-complexity field support and exact stop paths."],
  ["field.hierarchy-domain-proposal", "Extract field proposals from named hierarchy nodes while preserving node membership."],
  ["field.pixel-cue-domain-proposal", "Aggregate per-pixel rank and surround cues over exact proposed field regions."],
  ["field.domain-evidence-election", "Compare identified field proposals and explicitly accept one source domain or abstain."],
  ["field.accepted-domain-measurement", "Measure accepted-domain endpoints, geometry, support, and exact midpoint candidates."],
  ["saliency.source-color-proposal-extraction", "Extract source-color proposals with saliency scores and native-pixel witnesses."],
  ["evidence.salient-mark-measurement", "Measure compactness, repetition, coherence, and per-mass evidence for salient marks."],
  ["role.text-cue-measurement", "Measure text-like shape, foreground polarity, and field contrast for role cues."],
  ["role.artwork-family-relation-measurement", "Measure artwork-family relationships between text, field, mark, and source-color evidence without electing roles."],
  ["role.treatment-swap-legality-measurement", "Measure which role-treatment swaps preserve artwork-family relations and exact-source obligations."],
  ["candidate.native-witness-redemption", "Redeem candidate colors only when each candidate retains an exact native-pixel witness and role-evidence binding."],
  ["evidence.native-color-occupancy-measurement", "Measure the exact occupied native color set and aligned native-pixel witness counts for one raster identity."],
  ["publication.exact-native-pixel-admission", "Admit only redeemed candidate colors that are members of the measured native occupancy set with aligned pixel witnesses."],
  ["gradient.native-transition-path-construction", "Construct native-pixel transition paths through accepted field domains without synthesizing colors."],
  ["candidate.native-band-local-endpoints", "Extract exact native endpoint pairs from local bands along measured transition paths."],
  ["gradient.native-spatial-midpoint-band", "Measure spatial midpoint bands between exact native endpoints and retain native midpoint witnesses."],
  ["gradient.native-transition-stage-midpoint", "Choose transition-stage midpoint candidates from the spatial band without leaving native colors."],
  ["gradient.native-transition-publication", "Publish the witnessed native endpoint and midpoint transition sequence as a typed candidate path."],
  ["gradient.exact-source-pair-construction", "Construct exact-source endpoint pairs with aligned native-pixel witnesses from published transitions."],
  ["gradient.ramp-excursion-measurement", "Measure interpolation excursion for each exact-source pair and nominate source-color return candidates."],
  ["gradient.exact-path-election", "Elect an exact-source path whose endpoints, optional stops, and native witnesses satisfy the measured excursion evidence."],
  ["treatment.joint-hypothesis-construction", "Construct joint role hypotheses from admitted exact-native candidates and measured family/swap relations."],
  ["treatment.finite-factor-construction", "Factor joint hypotheses into finite aligned role, relation, gradient, and source-identity assignments."],
  ["treatment.swapped-candidate-domain-insertion", "Insert only relation-preserving, swap-legal candidate treatment records into the finite domain."],
  ["selection.structured-objective-construction", "Construct a typed finite selection objective over the candidate domain and declared role obligations."],
  ["selection.multicriteria-table-construction", "Construct an oriented criterion table for every candidate in the finite treatment domain."],
  ["selection.submodular-item-construction", "Construct coverage items and costs from the same candidate-domain criterion rows."],
  ["selection.retained-subset-reification", "Reify a retained candidate subset from an independently produced subset decision without minting candidates."],
  ["selection.partial-preorder-linear-extension", "Construct explicit linear extensions of a partial preorder while preserving incomparability witnesses."],
  ["selection.retained-subset-ordering", "Order only retained candidates using the declared linear extension and retained-subset identity."],
  ["selection.total-order-election", "Elect one complete candidate treatment record from the ordered retained subset and finite candidate domain."],
  ["treatment.selected-treatment-role-reification", "Reify the exact selected candidate treatment record without changing any selected role or gradient content."],
  ["repair.winner-input-construction", "Construct one repair winner input from the selected treatment, native occupancy, and typed repair evidence."],
  ["repair.result-role-reification", "Reify repaired ordinary and explicitly flat treatment products from the typed repair result."],
  ["selection.exact-source-infeasibility-proof", "Certify ordinary exact-source impossibility for one candidate domain, occupancy set, and repaired flat treatment."],
  ["publication.ordinary-exact-source-admission", "Validate every ordinary role and conditional gradient color against native occupancy and attach aligned native-pixel witnesses."],
  ["repair.exact-source-admission", "Apply one exact-source repair action while preserving selected treatment, candidate, raster, and provenance identity."],
  ["publication.emergency-exact-source-admission", "Admit a repaired flat treatment only after a coherent exact-source infeasibility proof and native occupancy membership checks."],
  ["publication.ui-palette-v3-materializer", "Map exactly one admitted treatment to v3 without selecting, repairing, or admitting a new treatment."],
]);

function proposalSource(id) {
  const words = id.split(".").at(-1).split("-").join(" ");
  const layer = id.split(".", 1)[0];
  return {
    id,
    title: words.replace(/\b\w/g, (character) => character.toUpperCase()),
    layer,
    workbenchLayer: layer,
    sourceRef: `branch-research:${slug(id)}`,
    operation: sourceOperations.get(id),
    ...(INTERCHANGEABILITY_SLOT_BY_MECHANISM.has(id)
      ? { interchangeabilitySlot: INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(id) }
      : {}),
  };
}

if (sourceOperations.size !== PROPOSAL_IDS.length || PROPOSAL_IDS.some((id) => !sourceOperations.has(id))) {
  throw new Error("Every proposal requires one explicit domain operation.");
}

const originalProposals = PROPOSAL_IDS.map(proposalSource);
const semanticStageDescriptions = new Map([
  [JOINT_HYPOTHESIS_CONSTRUCTION, ["Joint treatment hypothesis construction", "Combine role-qualified witnesses, cue relations, candidate identities, and swap legality into joint hypotheses without assigning final role colors."]],
  [FINITE_FACTOR_CONSTRUCTION, ["Finite treatment factor construction", "Factor joint role hypotheses into a finite inspectable domain of role, relation, and source-identity assignments without minting a treatment."]],
  [SWAPPED_CANDIDATE_DOMAIN_INSERTION, ["Swap-legal candidate-domain insertion", "Insert only cue-supported, relation-preserving, swap-legal candidates into the finite factor domain."]],
  [SELECTED_DECISION_MECHANISM, ["Treatment decision selection", "Select a candidate hypothesis from the swap-legal finite domain using the bound decision evidence; emit a decision, not role colors."]],
  [SELECTED_TREATMENT_ROLE_REIFICATION, ["Selected-treatment role reification", "Reify complete role and conditional gradient content only from the selected hypothesis and its exact candidate domain."]],
  [REPAIR_WINNER_INPUT_CONSTRUCTION, ["Repair winner-input construction", "Combine the selected treatment, exact native occupancy, and failed validation obligations into one identity-preserving repair input."]],
  [REPAIR_MECHANISM, ["Deterministic treatment repair", "Apply the selected deterministic repair action to the winner input while preserving treatment, candidate, source-image, and provenance identities."]],
  [REPAIR_RESULT_ROLE_REIFICATION, ["Repair result role reification", "Reify repaired ordinary and explicitly flat treatment results from the typed repair outcome without changing source or candidate identity."]],
  [EXACT_SOURCE_INFEASIBILITY_PROOF, ["Exact-source infeasibility proof", "Prove domain-specific exhaustion from the evaluated candidate domain, native occupied-color set, and zero-feasible selection evidence; metadata alone is insufficient."]],
]);
for (const mechanism of originalProposals) {
  const description = semanticStageDescriptions.get(mechanism.id);
  if (description) [mechanism.title, mechanism.operation] = description;
}
const admissionSeed = originalProposals.find((mechanism) => mechanism.id === ADMISSION);
if (!admissionSeed) throw new Error("Missing admission proposal seed.");
admissionSeed.id = ADMISSION;
admissionSeed.title = "Exact-source treatment admission";
admissionSeed.operation = "Validate membership of every flat role color and every conditional gradient endpoint or stop in the exact native occupied-color set, attach native pixel witnesses, and emit one discriminated admitted-final treatment.";
const emergencyAdmissionSeed = originalProposals.find((mechanism) => mechanism.id === EMERGENCY_EXACT_SOURCE_ADMISSION);
if (!emergencyAdmissionSeed) throw new Error("Missing emergency admission proposal seed.");
emergencyAdmissionSeed.operation = "Emit the same discriminated admitted-final structure as emergency-flat only after exact-source infeasibility is proven and every emergency role color has an exact occupied native pixel witness.";
const materializerSeed = originalProposals.find((mechanism) => mechanism.id === MATERIALIZER);
if (!materializerSeed) throw new Error("Missing materializer proposal seed.");
materializerSeed.operation = "Map one already admitted ordinary flat, ordinary gradient, or emergency-flat discriminated treatment to v3 without selecting or admitting a treatment.";
const decodeSeed = originalProposals.find((mechanism) => mechanism.id === "raster.native-artwork-decode");
if (!decodeSeed) throw new Error("Missing decode proposal seed.");
decodeSeed.operation = "Decode the encoded artwork once while preserving sourceImageId; emit an exact native sRGB8 raster only when every pixel is opaque, otherwise emit an explicit alpha refusal.";
const proposalById = new Map(originalProposals.map((mechanism) => [mechanism.id, mechanism]));

const primaryMechanismIds = new Set(graph.analysis.productFocus.primaryMechanismIds);
const orderedCurrentMechanisms = [
  ...graph.mechanisms.filter((mechanism) => primaryMechanismIds.has(mechanism.id) && !CONDEMNED_IDS.has(mechanism.id) && !DEMOTED_MECHANISM_IDS.has(mechanism.id)),
  ...graph.mechanisms.filter((mechanism) => CONDEMNED_IDS.has(mechanism.id)),
  ...graph.mechanisms.filter((mechanism) => DEMOTED_MECHANISM_IDS.has(mechanism.id)),
  ...graph.mechanisms.filter((mechanism) => !primaryMechanismIds.has(mechanism.id)),
];
const currentEntries = orderedCurrentMechanisms.map((mechanism) => {
  const disposition = CONDEMNED_IDS.has(mechanism.id)
      ? "condemned"
    : DEMOTED_MECHANISM_IDS.has(mechanism.id) || !primaryMechanismIds.has(mechanism.id)
      ? "sidecar"
      : "retained";
  const workbenchLayer = CURRENT_WORKBENCH_LAYER_BY_MECHANISM.get(mechanism.id);
  if (disposition === "retained" && !workbenchLayer) {
    throw new Error(`Retained current mechanism lacks an explicit workbench layer: ${mechanism.id}`);
  }
  return {
    mechanismId: mechanism.id,
    disposition,
    reason: disposition === "retained"
      ? "Retained as a product mechanism with its authoritative built contract."
      : disposition === "condemned"
        ? CONDEMNED_RESEARCH.get(mechanism.id)
        : DEMOTION_REASONS.get(mechanism.id) ?? "Kept outside product flow as an independent inspector mechanism.",
    ...(workbenchLayer ? { workbenchLayer } : {}),
    ...(disposition === "retained" && INTERCHANGEABILITY_SLOT_BY_MECHANISM.has(mechanism.id)
      ? { interchangeabilitySlot: INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(mechanism.id) }
      : {}),
    ...(disposition === "condemned"
      ? {
          evidenceRefs: [`${mechanism.source.path}:${mechanism.source.headingLine}`],
          condemnedScope: ["product-flow"],
        }
      : {}),
    excludedProductPorts: [],
  };
});
const retainedCurrentIds = new Set(
  currentEntries.filter((entry) => entry.disposition === "retained").map((entry) => entry.mechanismId),
);
const extraneousCurrentLayerIds = [...CURRENT_WORKBENCH_LAYER_BY_MECHANISM.keys()].filter(
  (mechanismId) => !retainedCurrentIds.has(mechanismId),
);
if (
  CURRENT_WORKBENCH_LAYER_BY_MECHANISM.size !== retainedCurrentIds.size ||
  extraneousCurrentLayerIds.length > 0
) {
  throw new Error(`Current workbench layer assignments do not exactly cover retained mechanisms: ${extraneousCurrentLayerIds.join(", ")}`);
}
const immutableDispositionHash = createHash("sha256")
  .update(JSON.stringify(currentEntries.map((entry) => [entry.mechanismId, entry.disposition])))
  .digest("hex");
if (immutableDispositionHash !== "8e7124725fec57cd97a66dc3887774e85acea7dea74bed44205bf8cef56c84f5") {
  throw new Error(`Immutable current mechanism dispositions changed: ${immutableDispositionHash}`);
}
const retainedIds = new Set(currentEntries.filter((entry) => entry.disposition === "retained").map((entry) => entry.mechanismId));
const retained = graph.mechanisms.filter((mechanism) => retainedIds.has(mechanism.id));

function isProductInput(input) {
  return input.inputClass === "natural" &&
    artifactById.get(input.artifactTypeId)?.productFocus === "product-flow" &&
    !demotions.has(input.artifactTypeId);
}

function currentProductInputs(mechanism) {
  const groups = mechanism.inputPorts
    .filter((input) => isProductInput(input) && input.requirement === "required")
    .map((input) => ({ id: `required-${input.id}`, mode: "all", ports: [input] }));
  for (const alternative of mechanism.alternativeGroups) {
    const ports = mechanism.inputPorts.filter((input) => isProductInput(input) && input.alternativeGroupId === alternative.id);
    if (ports.length > 0) groups.push({ id: alternative.id, mode: alternative.selectionCardinality, ports });
  }
  return groups;
}

function currentProductOutputs(mechanism) {
  return mechanism.outputPorts.filter((output) =>
    artifactById.get(output.artifactTypeId)?.productFocus === "product-flow" && !demotions.has(output.artifactTypeId));
}

const retainedProducerByArtifact = new Map();
for (const mechanism of retained) {
  for (const output of currentProductOutputs(mechanism)) {
    if (!retainedProducerByArtifact.has(output.artifactTypeId)) {
      retainedProducerByArtifact.set(output.artifactTypeId, mechanism);
    }
  }
}

const cardinalityRanges = {
  "exactly-one": [1, 1], "exactly-two": [2, 2], "zero-or-one": [0, 1],
  "zero-to-two": [0, 2], "zero-to-six": [0, 6], "one-to-two": [1, 2],
  "one-or-more": [1, Infinity], "zero-or-more": [0, Infinity],
};

function retainedProducerForInput(input, consumerId) {
  const mechanism = retainedProducerByArtifact.get(input.artifactTypeId);
  if (!mechanism || mechanism.id === consumerId) return undefined;
  const output = currentProductOutputs(mechanism).find((entry) => entry.artifactTypeId === input.artifactTypeId);
  const producerRange = cardinalityRanges[output.cardinality];
  const consumerRange = cardinalityRanges[input.cardinality];
  if (producerRange[0] < consumerRange[0] || producerRange[1] > consumerRange[1]) return undefined;
  const requiredConstraints = constraints(input.valueConstraints);
  const outputConstraints = constraints(output.valueConstraints);
  if (requiredConstraints.some((required) =>
    !outputConstraints.some((candidate) => JSON.stringify(candidate) === JSON.stringify(required)))) {
    return undefined;
  }
  return mechanism;
}

function selectedCurrentInputs(mechanism) {
  return currentProductInputs(mechanism).flatMap((group) =>
    group.mode === "exactly-one" ? group.ports.slice(0, 1) : group.ports);
}

function expandAndOrderCurrentMechanisms(mechanisms) {
  const expanded = new Map(mechanisms.map((mechanism) => [mechanism.id, mechanism]));
  const visit = (mechanism) => {
    for (const input of selectedCurrentInputs(mechanism)) {
      const producer = retainedProducerForInput(input, mechanism.id);
      if (!producer || producer.id === mechanism.id || expanded.has(producer.id)) continue;
      expanded.set(producer.id, producer);
      visit(producer);
    }
  };
  mechanisms.forEach(visit);

  const pending = [...expanded.values()];
  const ordered = [];
  const emitted = new Set();
  while (pending.length > 0) {
    const index = pending.findIndex((mechanism) =>
      selectedCurrentInputs(mechanism).every((input) => {
        const producer = retainedProducerForInput(input, mechanism.id);
        return !producer || producer.id === mechanism.id || !expanded.has(producer.id) || emitted.has(producer.id);
      }));
    if (index < 0) {
      throw new Error(`Retained dependency cycle: ${pending.map((mechanism) => mechanism.id).join(", ")}`);
    }
    const [mechanism] = pending.splice(index, 1);
    ordered.push(mechanism);
    emitted.add(mechanism.id);
  }
  return ordered;
}

const currentFamily = new Map();
for (const mechanism of retained) {
  let family = mechanism.id.split(".", 1)[0];
  if (family === "color" || family === "evidence") family = "native-evidence";
  if (family === "publication" || family === "repair") family = "repair-admission";
  if (family === "search" || family === "selection") family = "search-selection";
  if (family === "literature") {
    family = /saliency|morphology|variation/.test(mechanism.id) ? "literature-fields"
      : /multicut|watershed|connectivity|trend/.test(mechanism.id) ? "literature-graphs"
      : "literature-decisions";
  }
  if (
    [
      "role.family-relationship-mirroring",
      "role.maximin-ramp-foreground",
      "role.text-mark-swap",
    ].includes(mechanism.id)
  ) {
    family = "repair-admission";
  }
  currentFamily.set(mechanism.id, family);
}

const familyAnchors = new Map([
  ["native-evidence", "candidate.archetypoid-observation-construction"],
  ["literature-fields", "field.domain-evidence-election"],
  ["literature-graphs", "evidence.lifted-nonlocal-edge-construction"],
]);

const providerRules = [
  [/(native-intensity|global-mean-cielab|rgbxy-normalized|saliency-input|soft-morphology-input|declared-image-channel|graph-trend-signal|field-observations)/, "evidence.native-raster-primitives"],
  [/(pixel-adjacency|region-adjacency|difference-operator|component-tree|tree-of-shapes)/, "evidence.native-pixel-graph-construction"],
  [/(edge-dissimilar|color-distances|signed-affinities|lifted-multicut-base)/, "evidence.native-edge-dissimilarity-measurement"],
  [/(component-local|native-family-components|boundary-connectivity-regions|boundary-connectivity-contacts)/, "evidence.native-component-local-measurement"],
  [/(color-family|native-color-histogram|family-component|native-color-family|native-family-component|family-support|artwork-family-relations)/, "evidence.native-family-evidence-construction"],
  [/(field-domain|field-endpoint|gradient-endpoint|gradient-field|gradient-ordered|gradient-populated|gradient-ramp|gradient.stop-path|gradient-field-natural|candidate.gradient-midpoint|exact-field-path)/, "field.accepted-domain-measurement"],
  [/(frequency-tuned|spectral-residual|coherent-mark|mark-salience|mark-support|text-like|foreground-polarity|candidate-field-contrast)/, "saliency.source-color-proposal-extraction"],
  [/(role-evidence|identity-obligation|foreground|treatment-family-relational)/, "role.artwork-family-relation-measurement"],
  [/(role-swap)/, "role.treatment-swap-legality-measurement"],
  [/(archetypoids|structured-hypotheses|multicriteria|criterion-performance|submodular-selection)/, "candidate.archetypoid-observation-construction"],
    [/(complete-treatment-domain|finite-treatment-tuple|treatment-total-order|treatment-partial-order|source-eligible-treatment|treatment-pareto|noncompensatory|complete-treatment-descriptor)/, SWAPPED_CANDIDATE_DOMAIN_INSERTION],
  [/(complete-internal|selected-internal|complete-role-tuple|published-internal|repair-slate|palette-working|complete-infeasible-source-domain)/, REPAIR_WINNER_INPUT_CONSTRUCTION],
  [/(gradient-transition-publication)/, "gradient.native-transition-publication"],
  [/(ordered-diverse|partial-preorder)/, "selection.partial-preorder-linear-extension"],
];

const localProviderOverrides = new Map([
  ["artifact.scalar-field.robust-fit-residual-weight.v1", "evidence.region-boundary-statistics"],
  ["artifact.color.global-mean-cielab.v1", "saliency.source-color-proposal-extraction"],
  ["artifact.measurement.graph-trend-signal.v1", "evidence.graph-trend-order0-input-construction"],
  ["artifact.scalar-field.normalized-scale-saliency-input.v1", "saliency.source-color-proposal-extraction"],
  ["artifact.graph.boundary-connectivity-region-adjacency.v1", "evidence.native-family-component-graph-construction"],
  ["artifact.graph.pixel-region-adjacency.v1", "evidence.lifted-base-graph-construction"],
  ["artifact.graph.graph-trend-difference-operator.v1", "evidence.graph-trend-order0-input-construction"],
  ["artifact.graph.lifted-multicut-nonlocal-edges.v1", "evidence.deterministic-signed-affinity-construction"],
  ["artifact.measurement.boundary-connectivity-color-distances.v1", "evidence.region-boundary-statistics"],
  ["artifact.measurement.edge-dissimilarity.v1", "evidence.deterministic-signed-affinity-construction"],
  ["artifact.graph.lifted-multicut-base.v1", "evidence.lifted-base-graph-construction"],
  ["artifact.graph.ordered-signed-affinities.v1", "evidence.deterministic-signed-affinity-construction"],
  ["artifact.measurement.component-local-raster.v1", "evidence.region-boundary-statistics"],
  ["artifact.region-set.boundary-connectivity-regions.v1", "evidence.native-family-component-graph-construction"],
  ["artifact.measurement.boundary-connectivity-contacts.v1", "evidence.native-family-component-graph-construction"],
  ["artifact.region-set.family-component-evidence.v1", "evidence.native-family-component-graph-construction"],
  ["artifact.graph.native-family-component.v1", "evidence.native-family-component-graph-construction"],
  ["artifact.hypothesis.artwork-family-relations.v1", "role.artwork-family-relation-measurement"],
  ["artifact.hypothesis.field.provenance-union.v1", "field.domain-evidence-election"],
  ["artifact.measurement.gradient-field-color-principal-axis.v1", "field.robust-surface-domain-proposal"],
  ["artifact.evidence.gradient-endpoint-support-bands.v1", "field.robust-surface-domain-proposal"],
  ["artifact.measurement.gradient-endpoint-continuous-target.v1", "field.family-border-domain-proposal"],
  ["artifact.evidence.gradient-endpoint-band.v1", "field.family-border-domain-proposal"],
  ["artifact.gradient.stop-path.exact-source-2-to-4.v1", "field.regularized-region-domain-proposal"],
  ["artifact.candidate-set.gradient-populated-artwork-colors.v1", "field.regularized-region-domain-proposal"],
  ["artifact.measurement.gradient-ramp-excursion.v1", "field.regularized-region-domain-proposal"],
  ["artifact.color.gradient-ordered-exact-endpoint-pair.v1", "field.domain-evidence-election"],
  ["artifact.mask.gradient-field-natural.v1", "field.domain-evidence-election"],
  ["artifact.candidate.gradient-midpoint-nomination.v1", "field.domain-evidence-election"],
  ["artifact.rendering.exact-field-path.v1", "field.domain-evidence-election"],
  ["artifact.measurement.mark-support-cue-totals.v1", "evidence.salient-mark-measurement"],
  ["artifact.region-set.coherent-mark-group.v1", "evidence.salient-mark-measurement"],
  ["artifact.measurement.mark-salience-coherence.v1", "evidence.salient-mark-measurement"],
  ["artifact.candidate.color.text-like-source.v1", "role.text-cue-measurement"],
  ["artifact.measurement.foreground-polarity-observation.v1", "role.text-cue-measurement"],
  ["artifact.measurement.candidate-field-contrast.v1", "role.text-cue-measurement"],
  ["artifact.color.role-exact-source.v1", "publication.exact-native-pixel-admission"],
  ["artifact.candidate.color.foreground.v1", "candidate.native-witness-redemption"],
  ["artifact.measurement.role-swap-legality.v1", "role.treatment-swap-legality-measurement"],
  ["artifact.treatment.palette-working-exact-source.v1", "gradient.exact-path-election"],
  ["artifact.candidate-set.complete-infeasible-source-domain.v1", SWAPPED_CANDIDATE_DOMAIN_INSERTION],
  ["artifact.treatment.complete-role-tuple.v1", SELECTED_TREATMENT_ROLE_REIFICATION],
]);

function providerFor(artifactTypeId) {
  const localProvider = localProviderOverrides.get(artifactTypeId);
  if (localProvider) return localProvider;
  if (artifactTypeId === RASTER) return "raster.native-artwork-decode";
  if (artifactTypeId.includes("native-oklab") || artifactTypeId.includes("working-oklab")) return "evidence.native-raster-primitives";
  for (const [pattern, provider] of providerRules) {
    if (pattern.test(artifactTypeId)) return provider;
  }
  const category = artifactById.get(artifactTypeId)?.category;
  if (category === "graph" || category === "label-map") return "evidence.native-pixel-graph-construction";
  if (category === "measurement" || category === "statistic" || category === "scalar-field" || category === "raster") return "evidence.native-raster-primitives";
  if (category === "candidate" || category === "candidate-set" || category === "hypothesis") return "candidate.archetypoid-observation-construction";
  if (category === "treatment") return REPAIR_WINNER_INPUT_CONSTRUCTION;
  if (category === "decision") return "selection.total-order-election";
  return "evidence.native-component-local-measurement";
}

const extraOutputs = new Map(originalProposals.map((mechanism) => [mechanism.id, new Map()]));
for (const mechanism of retained) {
  for (const group of currentProductInputs(mechanism)) {
    const selectedInputs = group.mode === "exactly-one" ? group.ports.slice(0, 1) : group.ports;
    for (const input of selectedInputs) {
      if (retainedProducerForInput(input, mechanism.id)) continue;
      const providerId = providerFor(input.artifactTypeId);
      if (providerId === "raster.native-artwork-decode") continue;
      const outputs = extraOutputs.get(providerId);
      if (!outputs) throw new Error(`No proposal provider ${providerId} for ${input.artifactTypeId}.`);
      if (!outputs.has(input.artifactTypeId)) {
        outputs.set(
          input.artifactTypeId,
          port(
            `retained-${slug(input.artifactTypeId)}`,
            input.artifactTypeId,
            "exactly-one",
            constraints(input.valueConstraints),
          ),
        );
      } else if (
        outputs.get(input.artifactTypeId).constraints.length === 0 &&
        (input.valueConstraints ?? []).length > 0
      ) {
        outputs.get(input.artifactTypeId).constraints = constraints(input.valueConstraints);
      }
    }
  }
}

const proposalDependencies = new Map([
  ["evidence.native-raster-primitives", ["raster.native-artwork-decode"]],
  ["evidence.native-pixel-graph-construction", ["evidence.native-raster-primitives"]],
  ["evidence.native-edge-dissimilarity-measurement", ["evidence.native-pixel-graph-construction"]],
  ["evidence.native-component-local-measurement", ["evidence.native-edge-dissimilarity-measurement"]],
  ["evidence.lifted-nonlocal-edge-construction", ["evidence.lifted-base-graph-construction", "evidence.native-component-local-measurement"]],
  ["evidence.native-slic-partition", ["evidence.native-raster-primitives"]],
  ["evidence.partition-native-region-measurement", []],
  ["candidate.region-color-proposal-extraction", ["evidence.native-slic-partition"]],
  ["evidence.texture-distribution-segmentation", ["evidence.native-raster-primitives"]],
  ["evidence.rtv-structure-regionization", ["evidence.native-raster-primitives"]],
  ["evidence.tgv-field-regionization", ["evidence.native-raster-primitives"]],
  ["evidence.fixed-soft-morphology-regionization", ["evidence.native-raster-primitives"]],
  ["evidence.graph-trend-order0-input-construction", ["evidence.native-pixel-graph-construction"]],
  ["evidence.graph-trend-order0-regionization", ["evidence.graph-trend-order0-input-construction"]],
  ["evidence.native-family-evidence-construction", ["evidence.native-raster-primitives", "evidence.native-component-local-measurement"]],
  ["field.family-border-domain-proposal", ["evidence.native-family-component-graph-construction"]],
  ["field.robust-surface-domain-proposal", ["evidence.native-family-component-graph-construction"]],
  ["field.regularized-region-domain-proposal", ["evidence.native-family-component-graph-construction"]],
  ["field.hierarchy-domain-proposal", ["evidence.native-family-component-graph-construction"]],
  ["field.pixel-cue-domain-proposal", ["evidence.native-family-component-graph-construction"]],
  ["field.domain-evidence-election", []],
  ["field.accepted-domain-measurement", ["field.domain-evidence-election"]],
  ["saliency.source-color-proposal-extraction", ["evidence.native-raster-primitives"]],
  ["evidence.salient-mark-measurement", ["saliency.source-color-proposal-extraction"]],
  ["role.text-cue-measurement", ["evidence.salient-mark-measurement"]],
  ["role.artwork-family-relation-measurement", ["field.accepted-domain-measurement", "saliency.source-color-proposal-extraction", "role.text-cue-measurement"]],
  ["role.treatment-swap-legality-measurement", ["role.artwork-family-relation-measurement"]],
  ["candidate.archetypoid-observation-construction", ["evidence.native-family-evidence-construction"]],
  ["candidate.native-witness-redemption", ["role.artwork-family-relation-measurement"]],
  ["evidence.native-color-occupancy-measurement", ["evidence.native-family-evidence-construction"]],
  ["publication.exact-native-pixel-admission", ["candidate.native-witness-redemption", "evidence.native-color-occupancy-measurement"]],
  [SWAPPED_CANDIDATE_DOMAIN_INSERTION, [FINITE_FACTOR_CONSTRUCTION]],
  [REPAIR_WINNER_INPUT_CONSTRUCTION, [SELECTED_TREATMENT_ROLE_REIFICATION]],
  [REPAIR_RESULT_ROLE_REIFICATION, [REPAIR_MECHANISM]],
  ["gradient.native-transition-path-construction", ["field.accepted-domain-measurement"]],
  ["candidate.native-band-local-endpoints", ["gradient.native-transition-path-construction"]],
  ["gradient.native-spatial-midpoint-band", ["candidate.native-band-local-endpoints"]],
  ["gradient.native-transition-stage-midpoint", ["candidate.native-band-local-endpoints"]],
  ["gradient.native-transition-publication", []],
  ["gradient.exact-source-pair-construction", ["gradient.native-transition-publication"]],
  ["gradient.ramp-excursion-measurement", ["gradient.exact-source-pair-construction"]],
  ["gradient.exact-path-election", ["gradient.ramp-excursion-measurement"]],
  ["selection.structured-objective-construction", [SWAPPED_CANDIDATE_DOMAIN_INSERTION]],
  ["selection.multicriteria-table-construction", ["selection.structured-objective-construction"]],
  ["selection.submodular-item-construction", ["selection.multicriteria-table-construction"]],
  ["selection.retained-subset-reification", ["selection.submodular-item-construction"]],
  ["selection.partial-preorder-linear-extension", ["selection.multicriteria-table-construction"]],
  ["selection.retained-subset-ordering", ["selection.retained-subset-reification", "selection.partial-preorder-linear-extension"]],
  [SELECTED_DECISION_MECHANISM, [SWAPPED_CANDIDATE_DOMAIN_INSERTION]],
  [EXACT_SOURCE_INFEASIBILITY_PROOF, [SWAPPED_CANDIDATE_DOMAIN_INSERTION, "evidence.native-color-occupancy-measurement", REPAIR_RESULT_ROLE_REIFICATION]],
  [EMERGENCY_EXACT_SOURCE_ADMISSION, [EXACT_SOURCE_INFEASIBILITY_PROOF, REPAIR_RESULT_ROLE_REIFICATION]],
]);

const standardTailIds = new Set([
  "role.artwork-family-relation-measurement",
  "role.treatment-swap-legality-measurement",
  "candidate.native-witness-redemption",
  "evidence.native-color-occupancy-measurement",
  "publication.exact-native-pixel-admission",
  JOINT_HYPOTHESIS_CONSTRUCTION,
  FINITE_FACTOR_CONSTRUCTION,
  SWAPPED_CANDIDATE_DOMAIN_INSERTION,
  "selection.structured-objective-construction",
  "selection.multicriteria-table-construction",
  "selection.submodular-item-construction",
  "selection.retained-subset-reification",
  "selection.partial-preorder-linear-extension",
  "selection.retained-subset-ordering",
  SELECTED_TREATMENT_ROLE_REIFICATION,
  SELECTED_DECISION_MECHANISM,
  REPAIR_WINNER_INPUT_CONSTRUCTION,
  REPAIR_MECHANISM,
  REPAIR_RESULT_ROLE_REIFICATION,
  EXACT_SOURCE_INFEASIBILITY_PROOF,
  EMERGENCY_EXACT_SOURCE_ADMISSION,
  ADMISSION,
  MATERIALIZER,
]);

const proposedFamilies = [
  { id: "native-graph", ids: ["evidence.native-pixel-graph-construction", "evidence.native-edge-dissimilarity-measurement", "evidence.deterministic-signed-affinity-construction", "evidence.lifted-base-graph-construction"] },
  { id: "region-boundary", ids: ["evidence.native-slic-partition", "evidence.region-boundary-statistics"] },
  { id: "field-family-border", ids: ["evidence.native-family-component-graph-construction", "field.family-border-domain-proposal", "field.domain-evidence-election", "field.accepted-domain-measurement"] },
  { id: "field-robust-surface", ids: ["evidence.native-family-component-graph-construction", "field.robust-surface-domain-proposal", "field.domain-evidence-election", "field.accepted-domain-measurement"] },
  { id: "field-regularized-region", ids: ["evidence.native-family-component-graph-construction", "field.regularized-region-domain-proposal", "field.domain-evidence-election", "field.accepted-domain-measurement"] },
  { id: "field-hierarchy", ids: ["evidence.native-family-component-graph-construction", "field.hierarchy-domain-proposal", "field.domain-evidence-election", "field.accepted-domain-measurement"] },
  { id: "field-pixel-cue", ids: ["evidence.native-family-component-graph-construction", "field.pixel-cue-domain-proposal", "field.domain-evidence-election", "field.accepted-domain-measurement"] },
  { id: "gradient-spatial-midpoint", ids: ["gradient.native-transition-path-construction", "candidate.native-band-local-endpoints", "gradient.native-spatial-midpoint-band", "gradient.native-transition-publication", "gradient.exact-source-pair-construction", "gradient.ramp-excursion-measurement", "gradient.exact-path-election"] },
  { id: "gradient-transition-stage-midpoint", ids: ["gradient.native-transition-path-construction", "candidate.native-band-local-endpoints", "gradient.native-transition-stage-midpoint", "gradient.native-transition-publication", "gradient.exact-source-pair-construction", "gradient.ramp-excursion-measurement", "gradient.exact-path-election"] },
  { id: "emergency", ids: ["selection.exact-source-infeasibility-proof", "publication.emergency-exact-source-admission"] },
];

for (const family of proposedFamilies) {
  let previous = "evidence.native-family-evidence-construction";
  for (const id of family.ids) {
    if (!proposalDependencies.has(id)) proposalDependencies.set(id, [previous]);
    previous = id;
  }
}

function proposedContract(mechanism) {
  const id = mechanism.id;
  const mainId = mainArtifactId(id);
  let inputs = [];
  let outputs = [port("product", mainId, "exactly-one", [], mainId.startsWith("artifact.") && artifactById.has(mainId) ? [] : sourceIdentityPaths)];
  let crossPortConstraints = [];

  if (id === "raster.native-artwork-decode") {
    inputs = [{ id: "encoded-artwork", mode: "all", ports: [port("encoded-artwork", SOURCE, "exactly-one", [], ["/sourceImageId"])] }];
    outputs = [port("native-raster", RASTER, "exactly-one", [opaqueRasterConstraint], ["/sourceImageId", "/nativeRasterId"] )];
  } else if (id === "evidence.partition-native-region-measurement") {
    const proposalIds = [
      "evidence.native-slic-partition",
      "evidence.texture-distribution-segmentation",
      "evidence.rtv-structure-regionization",
      "evidence.tgv-field-regionization",
      "evidence.graph-trend-order0-regionization",
      "evidence.fixed-soft-morphology-regionization",
    ];
    const currentPorts = retained
      .filter((entry) => INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(entry.id) === "partition-formation")
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`from-current-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [{
      id: "partition-alternative",
      mode: "exactly-one",
      ports: [
        ...proposalIds.map((proposalId) =>
          port(`from-${slug(proposalId)}`, mainArtifactId(proposalId), "zero-or-one", [], sourceIdentityPaths)),
        ...currentPorts,
      ],
    }];
  } else if (id === "field.domain-evidence-election") {
    const proposalIds = [
      "field.family-border-domain-proposal",
      "field.robust-surface-domain-proposal",
      "field.regularized-region-domain-proposal",
      "field.hierarchy-domain-proposal",
      "field.pixel-cue-domain-proposal",
    ];
    const currentFieldPorts = retained
      .filter((entry) => currentFamily.get(entry.id) === "literature-fields")
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`from-current-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [{
      id: "field-domain-proposal",
      mode: "exactly-one",
      ports: [
        ...proposalIds.map((proposalId) =>
          port(`from-${slug(proposalId)}`, mainArtifactId(proposalId), "zero-or-one", [], sourceIdentityPaths)),
        ...currentFieldPorts,
      ],
    }];
  } else if (id === "evidence.salient-mark-measurement") {
    const saliencyPorts = retained
      .filter((entry) => INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(entry.id) === "saliency-proposal")
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`from-current-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [{
      id: "saliency-proposal",
      mode: "exactly-one",
      ports: [
        port("from-source-color-proposals", mainArtifactId("saliency.source-color-proposal-extraction"), "zero-or-one", [], sourceIdentityPaths),
        ...saliencyPorts,
      ],
    }];
  } else if (id === "gradient.native-transition-publication") {
    inputs = [{
      id: "midpoint-nomination",
      mode: "exactly-one",
      ports: [
        port("from-spatial-midpoint", mainArtifactId("gradient.native-spatial-midpoint-band"), "zero-or-one", [], sourceIdentityPaths),
        port("from-transition-stage-midpoint", mainArtifactId("gradient.native-transition-stage-midpoint"), "zero-or-one", [], sourceIdentityPaths),
      ],
    }];
  } else if (id === "candidate.native-witness-redemption") {
    const currentCandidatePorts = retained
      .filter((entry) => currentFamily.get(entry.id) === "candidate")
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`from-current-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [
      { id: "candidate-colors", mode: "exactly-one", ports: [
        port("candidate-observations", mainArtifactId("candidate.archetypoid-observation-construction"), "zero-or-one", [], candidateObservationPaths),
        ...currentCandidatePorts,
      ] },
      { id: "role-domain", mode: "all", ports: [port("artwork-family-relations", mainArtifactId("role.artwork-family-relation-measurement"), "exactly-one", [], sourceIdentityPaths)] },
    ];
    outputs = [port("native-witnesses", NATIVE_WITNESSES, "exactly-one", [], rankingPaths)];
    crossPortConstraints = preserveAcrossPorts("candidate-observations", "native-witnesses", [...sourceIdentityPaths, "/candidateIds"]);
  } else if (id === "publication.exact-native-pixel-admission") {
    inputs = [
      { id: "redeemed-candidates", mode: "all", ports: [port("native-witnesses", NATIVE_WITNESSES, "exactly-one", [], rankingPaths)] },
      { id: "native-occupancy-evidence", mode: "all", ports: [
        port("native-occupancy-measurement", mainArtifactId("evidence.native-color-occupancy-measurement"), "exactly-one", [], sourceIdentityPaths),
        port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"]),
      ] },
    ];
    outputs = [port("exact-native-candidates", EXACT_NATIVE_PIXELS, "exactly-one", [], [...sourceIdentityPaths, "/candidateIds", "/candidateSourceColorIds", "/candidateNativePixelWitnesses", "/roleCandidateAssignments"] )];
    crossPortConstraints = [
      ...preserveAcrossPorts("native-witnesses", "exact-native-candidates", [...sourceIdentityPaths, "/candidateIds", "/candidateSourceColorIds", "/candidateNativePixelWitnesses", "/roleCandidateAssignments"]),
      crossPortConstraint("native-color-occupancy", "/nativeRasterId", "equals", "native-witnesses", "/nativeRasterId"),
      crossPortConstraint("native-witnesses", "/candidateSourceColorIds", "subset-of", "native-color-occupancy", "/occupiedColorIds"),
    ];
  } else if (id === "gradient.exact-source-pair-construction") {
    inputs = [{ id: "published-native-transition", mode: "all", ports: [
      port("native-transition-publication", mainArtifactId("gradient.native-transition-publication"), "exactly-one", [], sourceIdentityPaths),
      port("current-transition-publication", "artifact.decision.gradient-transition-publication.v1", "exactly-one"),
    ] }];
  } else if (id === "candidate.archetypoid-observation-construction") {
    const evidenceIds = [
      "evidence.native-family-evidence-construction",
      "evidence.native-family-component-graph-construction",
      "candidate.region-color-proposal-extraction",
      "evidence.partition-native-region-measurement",
      "evidence.region-boundary-statistics",
      "evidence.fixed-soft-morphology-regionization",
      "evidence.lifted-nonlocal-edge-construction",
      "evidence.lifted-base-graph-construction",
      "evidence.tgv-field-regionization",
      "field.domain-evidence-election",
      "evidence.graph-trend-order0-regionization",
      "field.accepted-domain-measurement",
    ];
    const currentCandidatePorts = retained
      .filter((entry) => ["candidate", "native-evidence"].includes(currentFamily.get(entry.id)))
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`from-current-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [{
      id: "candidate-domain-evidence",
      mode: "exactly-one",
      ports: [
        ...evidenceIds.map((evidenceId) => port(`from-${slug(evidenceId)}`, mainArtifactId(evidenceId), "zero-or-one", [], sourceIdentityPaths)),
        ...currentCandidatePorts,
      ],
    }];
  } else if (id === JOINT_HYPOTHESIS_CONSTRUCTION) {
    const currentRolePorts = retained
      .filter((entry) => currentFamily.get(entry.id) === "role")
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`role-evidence-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [
      { id: "exact-native-candidates", mode: "all", ports: [port("exact-native-candidates", EXACT_NATIVE_PIXELS, "exactly-one", [], [...sourceIdentityPaths, "/candidateIds", "/candidateSourceColorIds", "/candidateNativePixelWitnesses", "/roleCandidateAssignments"])] },
      { id: "artwork-family-relations", mode: "all", ports: [port("artwork-family-relations", mainArtifactId("role.artwork-family-relation-measurement"), "exactly-one", [], sourceIdentityPaths)] },
      { id: "treatment-swap-legality", mode: "all", ports: [port("treatment-swap-legality", mainArtifactId("role.treatment-swap-legality-measurement"), "exactly-one", [], sourceIdentityPaths)] },
      { id: "role-computation-evidence", mode: "exactly-one", ports: [
        port("proposed-role-evidence", mainArtifactId("role.text-cue-measurement"), "zero-or-one", [], sourceIdentityPaths),
        ...currentRolePorts,
      ] },
    ];
    outputs = [port("joint-hypotheses", JOINT_HYPOTHESES, "exactly-one", [], jointHypothesisPaths)];
  } else if (id === FINITE_FACTOR_CONSTRUCTION) {
    inputs = [{ id: "joint-hypotheses-and-ordering", mode: "one-or-more", ports: [
      port("joint-hypotheses", JOINT_HYPOTHESES, "exactly-one", [], jointHypothesisPaths),
      port("gradient-path", mainArtifactId("gradient.exact-path-election"), "zero-or-one", [], sourceIdentityPaths),
    ] }];
    outputs = [port("finite-factors", FINITE_FACTORS, "exactly-one", [], finiteFactorPaths)];
  } else if (id === SWAPPED_CANDIDATE_DOMAIN_INSERTION) {
    inputs = [
      { id: "finite-factors", mode: "all", ports: [port("finite-factors", FINITE_FACTORS, "exactly-one", [], finiteFactorPaths)] },
      { id: "swap-legality", mode: "all", ports: [port("treatment-swap-legality", mainArtifactId("role.treatment-swap-legality-measurement"), "exactly-one", [], sourceIdentityPaths)] },
    ];
    outputs = [port("swap-legal-domain", SWAP_LEGAL_DOMAIN, "exactly-one", [], swapLegalDomainPaths)];
  } else if (id === SELECTED_DECISION_MECHANISM) {
    const searchOutputs = retained.filter((entry) =>
      entry.id.startsWith("search.") ||
      ["search-selection", "role", "literature-decisions"].includes(currentFamily.get(entry.id)))
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1).map((output) =>
        port(`selection-evidence-${slug(entry.id)}`, output.artifactTypeId, "zero-or-more")));
    inputs = [
      { id: "candidate-domain", mode: "all", ports: [
        port("swap-legal-domain", SWAP_LEGAL_DOMAIN, "exactly-one", [], swapLegalDomainPaths),
      ] },
      { id: "selection-method", mode: "exactly-one", ports: [
        port("retained-subset-order", mainArtifactId("selection.retained-subset-ordering"), "zero-or-one", [], sourceIdentityPaths),
        ...searchOutputs,
      ] },
    ];
    outputs = [port("selected-decision", SELECTED_DECISION, "exactly-one", [
      { valuePath: "/selectedTreatmentRecords", comparator: "count-equals", value: 1 },
    ], selectedDecisionPaths)];
    crossPortConstraints = [
      ...preserveAcrossPorts("swap-legal-domain", "selected-decision", ["/sourceImageId", "/nativeRasterId", "/provenanceChain", "/candidateDomainId", "/paletteDomainId", "/candidateIds", "/selectionObjectiveId"]),
      crossPortConstraint("selected-decision", "/candidateDomainId", "equals", "swap-legal-domain", "/candidateDomainId"),
      crossPortConstraint("selected-decision", "/paletteDomainId", "equals", "swap-legal-domain", "/paletteDomainId"),
      crossPortConstraint("selected-decision", "/selectionObjectiveId", "equals", "swap-legal-domain", "/selectionObjectiveId"),
      crossPortConstraint("selected-decision", "/selectedCandidateId", "member-of", "swap-legal-domain", "/candidateIds"),
      crossPortConstraint("selected-decision", "/selectedHypothesisId", "member-of", "swap-legal-domain", "/jointHypothesisIds"),
      crossPortConstraint("selected-decision", "/selectedCandidateIds", "subset-of", "swap-legal-domain", "/candidateIds"),
      crossPortConstraint("selected-decision", "/selectedTreatmentRecord", "member-of", "swap-legal-domain", "/candidateTreatmentRecords"),
      crossPortConstraint("selected-decision", "/selectedTreatmentRecords", "subset-of", "swap-legal-domain", "/candidateTreatmentRecords"),
      ...selectedDecisionIdentityPaths.map((valuePath) =>
        crossPortConstraint(
          "selected-decision",
          `/selectedTreatmentRecord${valuePath}`,
          "equals",
          "selected-decision",
          valuePath,
        )),
    ];
  } else if (id === SELECTED_TREATMENT_ROLE_REIFICATION) {
    inputs = [
      { id: "selected-decision", mode: "all", ports: [port("selected-decision", SELECTED_DECISION, "exactly-one", [], selectedDecisionPaths)] },
      { id: "candidate-domain", mode: "all", ports: [port("swap-legal-domain", SWAP_LEGAL_DOMAIN, "exactly-one", [], swapLegalDomainPaths)] },
    ];
    outputs = [port("selected-treatment", SELECTED_TREATMENT, "exactly-one", [treatmentKindConstraint], treatmentIdentityPaths)];
    crossPortConstraints = [
      ...preserveAcrossPorts("selected-decision", "selected-treatment", [
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
      ]),
      crossPortConstraint("selected-decision", "/candidateDomainId", "equals", "swap-legal-domain", "/candidateDomainId"),
      crossPortConstraint("selected-decision", "/paletteDomainId", "equals", "swap-legal-domain", "/paletteDomainId"),
      crossPortConstraint("selected-decision", "/selectionObjectiveId", "equals", "swap-legal-domain", "/selectionObjectiveId"),
      crossPortConstraint("selected-decision", "/selectedCandidateId", "member-of", "swap-legal-domain", "/candidateIds"),
      crossPortConstraint("selected-decision", "/selectedHypothesisId", "member-of", "swap-legal-domain", "/jointHypothesisIds"),
      crossPortConstraint("selected-decision", "/selectedCandidateIds", "subset-of", "swap-legal-domain", "/candidateIds"),
      crossPortConstraint("selected-decision", "/selectedTreatmentRecord", "member-of", "swap-legal-domain", "/candidateTreatmentRecords"),
      crossPortConstraint("selected-decision", "/selectedTreatmentRecords", "subset-of", "swap-legal-domain", "/candidateTreatmentRecords"),
      ...selectedTreatmentRecordContentPaths.map((valuePath) =>
        crossPortConstraint(
          "selected-decision",
          `/selectedTreatmentRecord${valuePath}`,
          "equals",
          "selected-treatment",
          valuePath,
        )),
    ];
  } else if (id === REPAIR_WINNER_INPUT_CONSTRUCTION) {
    inputs = [
      { id: "selected-treatment", mode: "all", ports: [port("selected-treatment", SELECTED_TREATMENT, "exactly-one", [treatmentKindConstraint], treatmentIdentityPaths)] },
      { id: "native-occupancy", mode: "all", ports: [port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"])] },
    ];
    outputs = [port("repair-winner-input", REPAIR_WINNER_INPUT, "exactly-one", [treatmentKindConstraint], repairWinnerPaths)];
    crossPortConstraints = [
      ...preserveAcrossPorts("selected-treatment", "repair-winner-input", treatmentIdentityPaths),
      ...preserveAcrossPorts("native-color-occupancy", "repair-winner-input", ["/nativeRasterId", "/occupiedColorIds"]),
      crossPortConstraint("native-color-occupancy", "/nativeRasterId", "equals", "selected-treatment", "/nativeRasterId"),
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        crossPortConstraint("repair-winner-input", `/roles/${role}/color`, "equals", "repair-winner-input", `/roles/${role}/occupiedColorId`),
        crossPortConstraint("repair-winner-input", `/roles/${role}/occupiedColorId`, "member-of", "repair-winner-input", "/occupiedColorIds"),
      ]),
    ];
  } else if (id === REPAIR_MECHANISM) {
    const repairOutputs = retained.filter((entry) => ["repair-admission", "gradient"].includes(currentFamily.get(entry.id)))
      .flatMap((entry) => currentProductOutputs(entry).slice(0, 1))
      .map((output, index) => port(`repair-evidence-${index}`, output.artifactTypeId, "zero-or-more"));
    inputs = [
      { id: "repair-winner", mode: "all", ports: [
        port("repair-winner-input", REPAIR_WINNER_INPUT, "exactly-one", [treatmentKindConstraint], repairWinnerPaths),
      ] },
      { id: "repair-evidence", mode: "exactly-one", ports: [
        port("exact-source-repair-evidence", EXACT_NATIVE_PIXELS, "zero-or-one", [], [...sourceIdentityPaths, "/candidateIds", "/candidateSourceColorIds", "/candidateNativePixelWitnesses", "/roleCandidateAssignments"]),
        ...repairOutputs,
      ] },
    ];
    outputs = [port("repair-result", REPAIR_RESULT, "exactly-one", [treatmentKindConstraint], repairResultPaths)];
    crossPortConstraints = preserveAcrossPorts("repair-winner-input", "repair-result", emergencyFlatWitnessPaths);
  } else if (id === REPAIR_RESULT_ROLE_REIFICATION) {
    inputs = [{ id: "repair-result", mode: "all", ports: [port("repair-result", REPAIR_RESULT, "exactly-one", [treatmentKindConstraint], repairResultPaths)] }];
    outputs = [
      port("repaired-treatment", REPAIRED_TREATMENT, "exactly-one", [treatmentKindConstraint], emergencyFlatWitnessPaths),
      port("repaired-flat-treatment", REPAIRED_TREATMENT, "exactly-one", [flatTreatmentConstraint], emergencyFlatWitnessPaths),
    ];
    crossPortConstraints = [
      ...preserveAcrossPorts("repair-result", "repaired-treatment", emergencyFlatWitnessPaths),
      ...preserveAcrossPorts("repair-result", "repaired-flat-treatment", emergencyFlatWitnessPaths),
    ];
  } else if (id === ADMISSION) {
    inputs = [
      { id: "verified-treatment", mode: "all", ports: [port("repaired-treatment", REPAIRED_TREATMENT, "exactly-one", [treatmentKindConstraint], emergencyFlatWitnessPaths)] },
      { id: "native-occupancy", mode: "all", ports: [port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"])] },
    ];
    outputs = [port("admitted-treatment", ADMITTED_TREATMENT, "exactly-one", [treatmentKindConstraint, { valuePath: "/treatmentVariant", comparator: "in", value: ["flat", "gradient"] }, ordinaryAdmissionConstraint, allRequiredColorsOccupiedConstraint], admittedTreatmentPaths)];
    crossPortConstraints = [
      ...preserveAcrossPorts("repaired-treatment", "admitted-treatment", treatmentIdentityPaths),
      ...preserveAcrossPorts("native-color-occupancy", "repaired-treatment", ["/nativeRasterId", "/occupiedColorIds"]),
      ...preserveAcrossPorts("native-color-occupancy", "admitted-treatment", ["/nativeRasterId", "/occupiedColorIds"]),
      crossPortConstraint("repaired-treatment", "/candidateDomainId", "equals", "admitted-treatment", "/admission/candidateDomainId"),
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        crossPortConstraint("repaired-treatment", `/roles/${role}/color`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
        crossPortConstraint("admitted-treatment", `/roles/${role}/occupiedColorId`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
      ]),
      crossPortConstraint("repaired-treatment", "/gradient/stops", "subset-of", "native-color-occupancy", "/occupiedColorIds"),
      crossPortConstraint("repaired-treatment", "/gradient/endpoints", "subset-of", "native-color-occupancy", "/occupiedColorIds"),
      crossPortConstraint("admitted-treatment", "/gradient/stopOccupiedColorIds", "subset-of", "native-color-occupancy", "/occupiedColorIds"),
      crossPortConstraint("admitted-treatment", "/gradient/endpointOccupiedColorIds", "subset-of", "native-color-occupancy", "/occupiedColorIds"),
    ];
  } else if (id === EXACT_SOURCE_INFEASIBILITY_PROOF) {
    inputs = [
      { id: "candidate-domain", mode: "all", ports: [port("swap-legal-domain", SWAP_LEGAL_DOMAIN, "exactly-one", [], swapLegalDomainPaths)] },
      { id: "native-occupancy", mode: "all", ports: [port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"])] },
      { id: "repaired-flat-treatment", mode: "all", ports: [port("repaired-flat-treatment", REPAIRED_TREATMENT, "exactly-one", [flatTreatmentConstraint], emergencyFlatWitnessPaths)] },
    ];
    outputs = [port("infeasibility-proof", INFEASIBILITY_PROOF, "exactly-one", [
      { valuePath: "/proof/zeroFeasibleCount", comparator: "equals", value: 0 },
      { valuePath: "/proof/predicate", comparator: "equals", value: "ordinary-exact-source-impossible" },
      { valuePath: "/proof/certificateKind", comparator: "equals", value: "exhaustive-domain-native-occupancy" },
      { valuePath: "/proof/ordinaryImpossibilityCertified", comparator: "equals", value: true },
    ], infeasibilityProofPaths)];
    crossPortConstraints = [
      crossPortConstraint("infeasibility-proof", "/candidateDomainId", "equals", "swap-legal-domain", "/candidateDomainId"),
      crossPortConstraint("infeasibility-proof", "/paletteDomainId", "equals", "swap-legal-domain", "/paletteDomainId"),
      crossPortConstraint("infeasibility-proof", "/selectionObjectiveId", "equals", "swap-legal-domain", "/selectionObjectiveId"),
      crossPortConstraint("infeasibility-proof", "/proof/evaluatedCandidateIds", "equals", "swap-legal-domain", "/candidateIds"),
      crossPortConstraint("infeasibility-proof", "/sourceImageId", "equals", "swap-legal-domain", "/sourceImageId"),
      crossPortConstraint("infeasibility-proof", "/nativeRasterId", "equals", "native-color-occupancy", "/nativeRasterId"),
      crossPortConstraint("infeasibility-proof", "/nativeRasterId", "equals", "swap-legal-domain", "/nativeRasterId"),
      crossPortConstraint("infeasibility-proof", "/occupiedColorIds", "equals", "native-color-occupancy", "/occupiedColorIds"),
      crossPortConstraint("infeasibility-proof", "/candidateDomainId", "equals", "repaired-flat-treatment", "/candidateDomainId"),
      crossPortConstraint("infeasibility-proof", "/paletteDomainId", "equals", "repaired-flat-treatment", "/paletteDomainId"),
      crossPortConstraint("infeasibility-proof", "/selectionObjectiveId", "equals", "repaired-flat-treatment", "/selectionObjectiveId"),
      crossPortConstraint("infeasibility-proof", "/sourceImageId", "equals", "repaired-flat-treatment", "/sourceImageId"),
      crossPortConstraint("infeasibility-proof", "/nativeRasterId", "equals", "repaired-flat-treatment", "/nativeRasterId"),
      crossPortConstraint("infeasibility-proof", "/repairedTreatmentId", "equals", "repaired-flat-treatment", "/treatmentId"),
    ];
  } else if (id === EMERGENCY_EXACT_SOURCE_ADMISSION) {
    inputs = [
      { id: "typed-infeasibility-proof", mode: "all", ports: [port("infeasibility-proof", INFEASIBILITY_PROOF, "exactly-one", [
        { valuePath: "/proof/zeroFeasibleCount", comparator: "equals", value: 0 },
        { valuePath: "/proof/predicate", comparator: "equals", value: "ordinary-exact-source-impossible" },
        { valuePath: "/proof/certificateKind", comparator: "equals", value: "exhaustive-domain-native-occupancy" },
        { valuePath: "/proof/ordinaryImpossibilityCertified", comparator: "equals", value: true },
      ], infeasibilityProofPaths)] },
      { id: "repaired-flat-treatment", mode: "all", ports: [port("repaired-flat-treatment", REPAIRED_TREATMENT, "exactly-one", [flatTreatmentConstraint], emergencyFlatWitnessPaths)] },
      { id: "native-occupancy", mode: "all", ports: [port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"])] },
    ];
    outputs = [port("admitted-treatment", ADMITTED_TREATMENT, "exactly-one", [flatTreatmentConstraint, { valuePath: "/treatmentVariant", comparator: "equals", value: "emergency-flat" }, emergencyAdmissionConstraint, allRequiredColorsOccupiedConstraint, { valuePath: "/admission/zeroFeasibleCount", comparator: "equals", value: 0 }], emergencyAdmittedTreatmentPaths)];
    crossPortConstraints = [
      ...preserveAcrossPorts("repaired-flat-treatment", "admitted-treatment", emergencyFlatWitnessPaths),
      ...preserveAcrossPorts("native-color-occupancy", "repaired-flat-treatment", ["/nativeRasterId", "/occupiedColorIds"]),
      ...preserveAcrossPorts("native-color-occupancy", "admitted-treatment", ["/nativeRasterId", "/occupiedColorIds"]),
      crossPortConstraint("infeasibility-proof", "/candidateDomainId", "equals", "repaired-flat-treatment", "/candidateDomainId"),
      crossPortConstraint("infeasibility-proof", "/paletteDomainId", "equals", "repaired-flat-treatment", "/paletteDomainId"),
      crossPortConstraint("infeasibility-proof", "/selectionObjectiveId", "equals", "repaired-flat-treatment", "/selectionObjectiveId"),
      crossPortConstraint("infeasibility-proof", "/sourceImageId", "equals", "repaired-flat-treatment", "/sourceImageId"),
      crossPortConstraint("infeasibility-proof", "/nativeRasterId", "equals", "repaired-flat-treatment", "/nativeRasterId"),
      crossPortConstraint("infeasibility-proof", "/nativeRasterId", "equals", "native-color-occupancy", "/nativeRasterId"),
      crossPortConstraint("infeasibility-proof", "/occupiedColorIds", "equals", "native-color-occupancy", "/occupiedColorIds"),
      crossPortConstraint("infeasibility-proof", "/repairedTreatmentId", "equals", "repaired-flat-treatment", "/treatmentId"),
      crossPortConstraint("infeasibility-proof", "/candidateDomainId", "equals", "admitted-treatment", "/admission/candidateDomainId"),
      crossPortConstraint("infeasibility-proof", "/proof/proofId", "equals", "admitted-treatment", "/admission/infeasibilityProofId"),
      crossPortConstraint("infeasibility-proof", "/proof/evaluatedCandidateIds", "equals", "admitted-treatment", "/admission/evaluatedCandidateIds"),
      crossPortConstraint("infeasibility-proof", "/proof/exhaustedConstraintWitnesses", "equals", "admitted-treatment", "/admission/exhaustedConstraintWitnesses"),
      crossPortConstraint("infeasibility-proof", "/proof/zeroFeasibleCount", "equals", "admitted-treatment", "/admission/zeroFeasibleCount"),
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        crossPortConstraint("repaired-flat-treatment", `/roles/${role}/color`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
        crossPortConstraint("admitted-treatment", `/roles/${role}/occupiedColorId`, "member-of", "native-color-occupancy", "/occupiedColorIds"),
      ]),
    ];
  } else if (id === MATERIALIZER) {
    inputs = [{ id: "admitted-final-treatment", mode: "all", ports: [
      port("admitted-treatment", ADMITTED_TREATMENT, "exactly-one", [treatmentKindConstraint, { valuePath: "/treatmentVariant", comparator: "in", value: ["flat", "gradient", "emergency-flat"] }, admittedTreatmentConstraint, allRequiredColorsOccupiedConstraint], admittedTreatmentPaths),
    ] }];
    outputs = [port("ui-palette", "artifact.product.ui-palette.v3", "exactly-one", [
      { valuePath: "/contractVersion", comparator: "equals", value: "v3-contract-0.1.0" },
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        { valuePath: `/roles/${role}/rgb`, comparator: "count-equals", value: 3 },
        { valuePath: `/roles/${role}/hex`, comparator: "matches", value: "^#[0-9a-f]{6}$" },
      ]),
    ], v3PaletteRequiredPaths)];
    crossPortConstraints = [
      ...["background", "surface", "foreground", "accent"].map((role) =>
        crossPortConstraint("admitted-treatment", `/roles/${role}/color`, "equals", "ui-palette", `/roles/${role}/hex`)),
      crossPortConstraint("admitted-treatment", "/gradient/stops", "equals-when-present", "ui-palette", "/gradient/stops"),
      crossPortConstraint("ui-palette", "/roles/background/hex", "equals-when-present", "ui-palette", "/gradient/stops/0/color/hex"),
      crossPortConstraint("ui-palette", "/roles/surface/hex", "equals-when-present", "ui-palette", "/gradient/stops/-1/color/hex"),
    ];
  } else {
    const dependencies = proposalDependencies.get(id) ?? [];
    inputs = dependencies.length > 0
      ? dependencies.map((dependency) => {
          const artifactTypeId = mainArtifactId(dependency);
          const identityPaths = artifactTypeId === RASTER
            ? ["/sourceImageId", "/nativeRasterId"]
            : sourceIdentityPaths;
          return { id: `computed-${slug(dependency)}`, mode: "all", ports: [port(`from-${slug(dependency)}`, artifactTypeId, "exactly-one", artifactTypeId === RASTER ? [opaqueRasterConstraint] : [], identityPaths)] };
        })
      : [{ id: "native-raster", mode: "all", ports: [port("native-raster", RASTER, "exactly-one", [opaqueRasterConstraint], ["/sourceImageId", "/nativeRasterId"])] }];
  }

  const family = [...familyAnchors.entries()].find(([, anchor]) => anchor === id)?.[0];
  if (
    family &&
    ![
      "selection.multicriteria-table-construction",
      "candidate.archetypoid-observation-construction",
      "field.domain-evidence-election",
    ].includes(id)
  ) {
    const familyMechanisms = retained.filter((entry) => currentFamily.get(entry.id) === family);
    const currentPorts = familyMechanisms.flatMap((entry, mechanismIndex) =>
      currentProductOutputs(entry).slice(0, 1).map((output) => port(`from-current-${mechanismIndex}`, output.artifactTypeId, "zero-or-more")));
    if (currentPorts.length > 0) inputs.push({ id: `${family}-computed-products`, mode: "one-or-more", ports: currentPorts });
  }

  if (id === "evidence.native-color-occupancy-measurement") {
    outputs.push(port("native-color-occupancy", OCCUPANCY, "exactly-one", [], ["/nativeRasterId", "/occupiedColorIds"]));
    crossPortConstraints.push(crossPortConstraint(
      "from-evidence-native-family-evidence-construction",
      "/nativeRasterId",
      "equals",
      "native-color-occupancy",
      "/nativeRasterId",
    ));
  }
  outputs.push(...extraOutputs.get(id).values());
  const readiness = structuredClone(unavailableReadiness);
  const nonsuccessBranch = id === "raster.native-artwork-decode"
    ? { id: "alpha", ports: [port("alpha-refusal", ALPHA_REFUSAL, "exactly-one", [], ["/sourceImageId"])] }
    : { id: "abstention", ports: [port("abstention", ABSTENTION)] };
  return {
    ...mechanism,
    productInputs: inputs,
    productOutputs: [
      { id: "success", ports: outputs },
      nonsuccessBranch,
    ],
    crossPortConstraints,
    readiness,
    sidecars: sidecars(id),
  };
}

const proposedMechanisms = originalProposals.map(proposedContract);
const proposedById = new Map(proposedMechanisms.map((mechanism) => [mechanism.id, mechanism]));

const artifactMechanismById = new Map();
for (const mechanism of originalProposals) {
  const artifactId = mainArtifactId(mechanism.id);
  if (
    !artifactById.has(artifactId) &&
    artifactId !== "artifact.product.ui-palette.v3" &&
    !artifactMechanismById.has(artifactId)
  ) {
    artifactMechanismById.set(artifactId, mechanism);
  }
}
const proposedArtifacts = [
  sourceArtifact(),
  ...[...artifactMechanismById].map(([id, mechanism]) => productArtifact(id, mechanism)),
  {
    id: ALPHA_REFUSAL,
    kind: "product",
    productFocus: "product-flow",
    semanticRoles: ["identity.source", "domain.alphaObserved", "domain.reason"],
    label: "Non-opaque artwork refusal",
    description: "Explicit decode refusal when any decoded pixel is not opaque; this branch cannot enter successful product ancestry.",
    payloadShape: {
      kind: "object",
      schemaRef: `schema://${ALPHA_REFUSAL}`,
      description: "Typed alpha-policy refusal.",
      fields: [
        { valuePath: "/sourceImageId", valueKind: "scalar", required: true },
        { valuePath: "/alphaObserved", valueKind: "scalar", required: true },
        { valuePath: "/reason", valueKind: "scalar", required: true },
      ],
    },
    valueInspection: {
      paths: inspectionForFields([
        { valuePath: "/sourceImageId", valueKind: "scalar" },
        { valuePath: "/alphaObserved", valueKind: "scalar" },
        { valuePath: "/reason", valueKind: "scalar" },
      ], "Explicit non-opaque decode refusal value."),
      notes: ["Alpha refusal is inspectable but is never a successful product handoff."],
    },
  },
  {
    id: ABSTENTION,
    kind: "sidecar",
    productFocus: "secondary-overlay",
    semanticRoles: ["domain.mechanismId", "domain.reason"],
    label: "Mechanism-specific computation abstention",
    description: "A typed non-success result naming the mechanism, input identities, and explicit reason that no product value was computed.",
    payloadShape: { kind: "object", schemaRef: `schema://${ABSTENTION}`, description: "Explicit computation abstention.", fields: [{ valuePath: "/mechanismId", valueKind: "scalar", required: true }, { valuePath: "/reason", valueKind: "scalar", required: true }] },
    valueInspection: { paths: inspectionForFields([{ valuePath: "/mechanismId", valueKind: "scalar" }, { valuePath: "/reason", valueKind: "scalar" }], "Explicit abstention value."), notes: ["Abstention cannot contribute to successful product ancestry."] },
  },
  sidecarArtifact("artifact.review.mechanism-known-good-fixture-set.v1", "Known-good mechanism fixture set"),
  sidecarArtifact("artifact.review.mechanism-output-visualization.v1", "Independent mechanism output visualization"),
  sidecarArtifact("artifact.report.mechanism-human-feedback-score.v1", "Mechanism human-feedback score"),
];

const fixedConfigurations = [];
const readinessProviders = [];
const currentReadiness = new Map();
const proposedReadiness = new Map();
for (const mechanism of retained) {
  const configs = mechanism.inputPorts.filter((input) => input.requirement === "configuration")
    .map((input) => `${mechanism.id}:${input.id}:${input.artifactTypeId}`);
  fixedConfigurations.push(...configs.map((id) => ({ id, available: false })));
  const nonProduct = mechanism.inputPorts.filter((input) => input.requirement === "required" && !isProductInput(input));
  const bindings = nonProduct.map((input) => {
    const providerId = `provider.${mechanism.id}.${input.id}`;
    readinessProviders.push({ id: providerId, available: false, outputPorts: [port("provided", input.artifactTypeId, input.cardinality)] });
    return { consumerInputId: input.id, producerKind: "external-provider", producerId: providerId, producerPortId: "provided", equalityConstraints: [] };
  });
  currentReadiness.set(mechanism.id, { fixedConfigRefs: configs, nonProductInputs: bindings });
}
for (const mechanism of proposedMechanisms) {
  const bindings = mechanism.readiness.requiredNonProductInputs.map((input) => {
    const providerId = `provider.${mechanism.id}.${input.id}`;
    readinessProviders.push({ id: providerId, available: false, outputPorts: [port("provided", input.artifactTypeId, input.cardinality)] });
    return { consumerInputId: input.id, producerKind: "external-provider", producerId: providerId, producerPortId: "provided", equalityConstraints: [] };
  });
  proposedReadiness.set(mechanism.id, { fixedConfigRefs: mechanism.readiness.fixedConfigRefs, nonProductInputs: bindings });
}

function proposalBindings(mechanismId, instances) {
  const mechanism = proposedById.get(mechanismId);
  return mechanism.productInputs.flatMap((group) => {
    const availablePorts = group.ports.filter((input) =>
      input.artifactTypeId === SOURCE ||
      instances.some((instance) =>
        instance.outputs.some((output) => output.artifactTypeId === input.artifactTypeId)),
    );
    const selectedPorts = group.mode === "exactly-one"
      ? availablePorts.slice(0, 1)
      : group.mode === "one-or-more"
        ? availablePorts
        : group.ports;
    return selectedPorts.map((input) => {
      if (input.artifactTypeId === SOURCE) {
        return binding(input.id, "$source", "encoded-artwork", identityEquality(input.identityPaths));
      }
      const producer = [...instances].reverse().find((instance) => instance.outputs.some((output) => output.artifactTypeId === input.artifactTypeId));
      if (!producer) throw new Error(`No producer in recipe for ${mechanismId}:${input.id}:${input.artifactTypeId}`);
      const output = producer.outputs.find((entry) =>
        entry.artifactTypeId === input.artifactTypeId && entry.id === input.id)
        ?? producer.outputs.find((entry) => entry.artifactTypeId === input.artifactTypeId);
      return binding(input.id, producer.instanceId, output.id, input.identityPaths.length > 0 ? identityEquality(input.identityPaths) : []);
    });
  });
}

function appendProposal(steps, instances, mechanismId, instanceId = slug(mechanismId)) {
  if (instances.some((instance) => instance.mechanismId === mechanismId)) return;
  if (
    mechanismId === "gradient.native-transition-publication" &&
    !instances.some((instance) => INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(instance.mechanismId) === "midpoint-nomination")
  ) {
    appendProposal(steps, instances, "candidate.native-band-local-endpoints");
    appendProposal(steps, instances, "gradient.native-spatial-midpoint-band");
  }
  for (const dependency of proposalDependencies.get(mechanismId) ?? []) appendProposal(steps, instances, dependency);
  const mechanism = proposedById.get(mechanismId);
  const productBindings = proposalBindings(mechanismId, instances);
  steps.push(step(instanceId, mechanismId, productBindings, proposedReadiness.get(mechanismId)));
  instances.push({ instanceId, mechanismId, outputs: mechanism.productOutputs[0].ports });
}

function appendCurrent(steps, instances, mechanism) {
  const bindings = [];
  for (const group of currentProductInputs(mechanism)) {
    const selectedInputs = group.mode === "exactly-one" ? group.ports.slice(0, 1) : group.ports;
    for (const input of selectedInputs) {
      const retainedProducer = retainedProducerForInput(input, mechanism.id);
      const provider = retainedProducer
        ? [...instances].reverse().find(
            (instance) =>
              instance.mechanismId === retainedProducer.id &&
              instance.outputs.some((output) => output.artifactTypeId === input.artifactTypeId),
          )
        : [...instances].reverse().find(
            (instance) =>
              proposalById.has(instance.mechanismId) &&
              instance.outputs.some((output) => output.artifactTypeId === input.artifactTypeId),
          );
      if (!provider) throw new Error(`No provider for retained ${mechanism.id}:${input.id}:${input.artifactTypeId}`);
      const output = provider.outputs.find((entry) => entry.artifactTypeId === input.artifactTypeId);
      bindings.push(binding(input.id, provider.instanceId, output.id));
    }
  }
  const instanceId = `current-${slug(mechanism.id)}`;
  steps.push(step(instanceId, mechanism.id, bindings, currentReadiness.get(mechanism.id)));
  instances.push({ instanceId, mechanismId: mechanism.id, outputs: currentProductOutputs(mechanism) });
}

function appendProvidersForCurrent(steps, instances, mechanisms) {
  const providers = new Set();
  for (const mechanism of mechanisms) {
    for (const group of currentProductInputs(mechanism)) {
      const selectedInputs = group.mode === "exactly-one" ? group.ports.slice(0, 1) : group.ports;
      selectedInputs.forEach((input) => {
        if (!retainedProducerForInput(input, mechanism.id)) {
          providers.add(providerFor(input.artifactTypeId));
        }
      });
    }
  }
  for (const provider of providers) {
    if (provider === "gradient.native-transition-publication") {
      appendProposal(steps, instances, "candidate.native-band-local-endpoints");
      appendProposal(steps, instances, "gradient.native-spatial-midpoint-band");
    }
    appendProposal(steps, instances, provider);
  }
}

function appendStandardTail(steps, instances, contributionInstanceId, contributionPortId, contributionArtifactId, options = {}) {
  appendProposal(steps, instances, "role.artwork-family-relation-measurement", "artwork-family-relations");
  appendProposal(steps, instances, "role.treatment-swap-legality-measurement", "treatment-swap-legality");

  const roleMechanisms = expandAndOrderCurrentMechanisms(options.roleMechanisms ?? []);
  appendProvidersForCurrent(steps, instances, roleMechanisms);
  for (const mechanism of roleMechanisms) {
    if (!instances.some((instance) => instance.mechanismId === mechanism.id)) {
      appendCurrent(steps, instances, mechanism);
    }
  }

  if (!options.candidateMechanisms?.length) {
    const archetypoid = proposedById.get("candidate.archetypoid-observation-construction");
    const contributionInput = archetypoid.productInputs[0].ports.find(
      (input) => input.artifactTypeId === contributionArtifactId,
    );
    let candidateInstance = instances.find(
      (instance) => instance.instanceId === contributionInstanceId &&
        instance.mechanismId === "candidate.archetypoid-observation-construction",
    );
    if (!candidateInstance && !contributionInput) {
      candidateInstance = instances.find(
        (instance) => instance.mechanismId === "candidate.archetypoid-observation-construction",
      );
    }
    if (!candidateInstance) {
      const candidateInput = contributionInput ?? archetypoid.productInputs[0].ports.find(
        (input) => input.artifactTypeId === mainArtifactId("evidence.native-family-evidence-construction"),
      );
      const contribution = instances.find(
        (instance) => instance.instanceId === contributionInstanceId &&
          instance.outputs.some((output) => output.id === contributionPortId),
      );
      const native = instances.find(
        (instance) => instance.mechanismId === "evidence.native-family-evidence-construction",
      );
      const producer = candidateInput.artifactTypeId === contributionArtifactId && contribution
        ? { instanceId: contributionInstanceId, portId: contributionPortId }
        : { instanceId: native.instanceId, portId: "product" };
      steps.push(step("candidate-observations", archetypoid.id, [
        binding(candidateInput.id, producer.instanceId, producer.portId, identityEquality(candidateInput.identityPaths)),
      ]));
      instances.push({
        instanceId: "candidate-observations",
        mechanismId: archetypoid.id,
        outputs: archetypoid.productOutputs[0].ports,
      });
    }
  }

  appendProposal(steps, instances, "candidate.native-witness-redemption", "native-witness-redemption");
  if (options.candidateMechanisms?.length) {
    const redemption = proposedById.get("candidate.native-witness-redemption");
    const candidatePortIds = new Set(
      redemption.productInputs.find((group) => group.id === "candidate-colors").ports.map((input) => input.id),
    );
    const target = options.candidateMechanisms[0];
    const output = currentProductOutputs(target)[0];
    const redemptionStep = steps.find((candidate) => candidate.mechanismId === "candidate.native-witness-redemption");
    redemptionStep.productBindings = redemptionStep.productBindings.filter(
      (candidate) => !candidatePortIds.has(candidate.consumerPortId),
    );
    redemptionStep.productBindings.push(
      binding(`from-current-${slug(target.id)}`, `current-${slug(target.id)}`, output.id),
    );
  }
  appendProposal(steps, instances, "evidence.native-color-occupancy-measurement", "native-color-occupancy-measurement");
  appendProposal(steps, instances, "publication.exact-native-pixel-admission", "exact-native-pixel-admission");
  appendProposal(steps, instances, JOINT_HYPOTHESIS_CONSTRUCTION, "treatment-joint-hypothesis-construction");
  if (options.roleMechanisms?.length) {
    const joint = proposedById.get(JOINT_HYPOTHESIS_CONSTRUCTION);
    const rolePortIds = new Set(
      joint.productInputs.find((group) => group.id === "role-computation-evidence").ports.map((input) => input.id),
    );
    const target = options.roleMechanisms[0];
    const output = currentProductOutputs(target)[0];
    const jointStep = steps.find((candidate) => candidate.mechanismId === JOINT_HYPOTHESIS_CONSTRUCTION);
    jointStep.productBindings = jointStep.productBindings.filter(
      (candidate) => !rolePortIds.has(candidate.consumerPortId),
    );
    jointStep.productBindings.push(
      binding(`role-evidence-${slug(target.id)}`, `current-${slug(target.id)}`, output.id),
    );
  }
  for (const gradientId of options.gradientIds ?? []) appendProposal(steps, instances, gradientId);
  appendProposal(steps, instances, FINITE_FACTOR_CONSTRUCTION, "treatment-finite-factor-construction");
  appendProposal(steps, instances, SWAPPED_CANDIDATE_DOMAIN_INSERTION, "treatment-swapped-candidate-domain-insertion");

  const searchMechanisms = expandAndOrderCurrentMechanisms(options.searchMechanisms ?? []);
  const repairMechanisms = expandAndOrderCurrentMechanisms(options.repairMechanisms ?? []);
  appendProvidersForCurrent(steps, instances, searchMechanisms);
  for (const mechanism of searchMechanisms) {
    if (!instances.some((instance) => instance.mechanismId === mechanism.id)) appendCurrent(steps, instances, mechanism);
  }
  const selectionIds = options.searchMechanisms?.length
    ? [SELECTED_DECISION_MECHANISM]
    : [
        "selection.structured-objective-construction",
        "selection.multicriteria-table-construction",
        "selection.submodular-item-construction",
        "selection.retained-subset-reification",
        "selection.partial-preorder-linear-extension",
        "selection.retained-subset-ordering",
        SELECTED_DECISION_MECHANISM,
      ];
  for (const selectionId of selectionIds) {
    appendProposal(steps, instances, selectionId, slug(selectionId));
  }
  if (options.searchMechanisms) {
    const electionStep = steps.find(
      (candidate) => candidate.mechanismId === SELECTED_DECISION_MECHANISM,
    );
    const election = proposedById.get(SELECTED_DECISION_MECHANISM);
    const selectionPortIds = new Set(
      election.productInputs.find((group) => group.id === "selection-method").ports.map((input) => input.id),
    );
    const target = options.searchMechanisms[0];
    const output = currentProductOutputs(target)[0];
    electionStep.productBindings = electionStep.productBindings.filter(
      (candidate) => !selectionPortIds.has(candidate.consumerPortId),
    );
    electionStep.productBindings.push(
      binding(`selection-evidence-${slug(target.id)}`, `current-${slug(target.id)}`, output.id),
    );
  }

  const reify = proposedById.get(SELECTED_TREATMENT_ROLE_REIFICATION);
  steps.push(step("treatment-selected-treatment-role-reification", reify.id, [
    binding("selected-decision", slug(SELECTED_DECISION_MECHANISM), "selected-decision", identityEquality(selectedDecisionPaths)),
    binding("swap-legal-domain", "treatment-swapped-candidate-domain-insertion", "swap-legal-domain", identityEquality(swapLegalDomainPaths)),
  ]));
  instances.push({ instanceId: "treatment-selected-treatment-role-reification", mechanismId: reify.id, outputs: reify.productOutputs[0].ports });

  appendProposal(steps, instances, REPAIR_WINNER_INPUT_CONSTRUCTION, "repair-winner-input-construction");
  appendProvidersForCurrent(steps, instances, repairMechanisms);

  for (const mechanism of repairMechanisms) {
    if (!instances.some((instance) => instance.mechanismId === mechanism.id)) {
      appendCurrent(steps, instances, mechanism);
    }
  }
  const repair = proposedById.get(REPAIR_MECHANISM);
  const repairBindings = [
    binding("repair-winner-input", "repair-winner-input-construction", "repair-winner-input", identityEquality(repairWinnerPaths)),
  ];
  if (options.repairMechanisms?.length) {
    const lateMechanisms = retained.filter((entry) => ["repair-admission", "gradient"].includes(currentFamily.get(entry.id)));
    const target = options.repairMechanisms[0];
    const output = currentProductOutputs(target)[0];
    const index = lateMechanisms.findIndex((entry) => entry.id === target.id);
    repairBindings.push(binding(`repair-evidence-${index}`, `current-${slug(target.id)}`, output.id));
  } else {
    repairBindings.push(binding(
      "exact-source-repair-evidence",
      "exact-native-pixel-admission",
      "exact-native-candidates",
      identityEquality([...sourceIdentityPaths, "/candidateIds", "/candidateSourceColorIds", "/candidateNativePixelWitnesses", "/roleCandidateAssignments"]),
    ));
  }
  steps.push(step("repair", repair.id, repairBindings));
  instances.push({ instanceId: "repair", mechanismId: repair.id, outputs: repair.productOutputs[0].ports });
  appendProposal(steps, instances, REPAIR_RESULT_ROLE_REIFICATION, "repair-result-role-reification");

  const occupancyInstance = instances.find(
    (instance) => instance.mechanismId === "evidence.native-color-occupancy-measurement",
  ).instanceId;
  if (options.emergency) {
    appendProposal(steps, instances, EXACT_SOURCE_INFEASIBILITY_PROOF, "selection-exact-source-infeasibility-proof");
    const emergencyAdmission = proposedById.get(EMERGENCY_EXACT_SOURCE_ADMISSION);
    steps.push(step("publication-emergency-exact-source-admission", emergencyAdmission.id, [
      binding("infeasibility-proof", "selection-exact-source-infeasibility-proof", "infeasibility-proof", identityEquality(infeasibilityProofPaths)),
      binding("repaired-flat-treatment", "repair-result-role-reification", "repaired-flat-treatment", identityEquality(emergencyFlatWitnessPaths)),
      binding("native-color-occupancy", occupancyInstance, "native-color-occupancy", identityEquality(["/nativeRasterId", "/occupiedColorIds"])),
    ]));
    instances.push({ instanceId: "publication-emergency-exact-source-admission", mechanismId: emergencyAdmission.id, outputs: emergencyAdmission.productOutputs[0].ports });
    steps.push(step("materialize", MATERIALIZER, [binding("admitted-treatment", "publication-emergency-exact-source-admission", "admitted-treatment", identityEquality(admittedTreatmentPaths))]));
  } else {
    steps.push(step("admit-exact-source", ADMISSION, [
      binding("repaired-treatment", "repair-result-role-reification", "repaired-treatment", identityEquality(emergencyFlatWitnessPaths)),
      binding("native-color-occupancy", occupancyInstance, "native-color-occupancy", identityEquality(["/nativeRasterId", "/occupiedColorIds"])),
    ]));
    instances.push({ instanceId: "admit-exact-source", mechanismId: ADMISSION, outputs: proposedById.get(ADMISSION).productOutputs[0].ports });
    steps.push(step("materialize", MATERIALIZER, [binding("admitted-treatment", "admit-exact-source", "admitted-treatment", identityEquality(admittedTreatmentPaths))]));
  }
}

function baseRecipe(id, family, description) {
  return { id, family, description, preferred: false, declaredRootInstanceIds: [], steps: [], goalBinding: { producerInstanceId: "materialize", producerPortId: "ui-palette" }, postGoalSidecars: [] };
}

const recipes = [];
function appendRecipeFoundation(recipe, instances, includeFieldBaseline = true) {
  appendProposal(recipe.steps, instances, "raster.native-artwork-decode", "decode");
  appendProposal(recipe.steps, instances, "evidence.native-family-evidence-construction", "native-family-evidence");
  if (includeFieldBaseline) {
    appendProposal(recipe.steps, instances, "field.family-border-domain-proposal", "baseline-field-domain-proposal");
    appendProposal(recipe.steps, instances, "field.domain-evidence-election", "baseline-field-domain-election");
    appendProposal(recipe.steps, instances, "field.accepted-domain-measurement", "baseline-field-domain-measurement");
  }
}

function appendCurrentTarget(recipe, instances, target) {
  const mechanisms = expandAndOrderCurrentMechanisms([target]);
  appendProvidersForCurrent(recipe.steps, instances, mechanisms);
  for (const mechanism of mechanisms) {
    if (!instances.some((instance) => instance.mechanismId === mechanism.id)) {
      appendCurrent(recipe.steps, instances, mechanism);
    }
  }
}

function replaceAlternativeBinding(recipe, mechanismId, groupId, consumerPortId, producerInstanceId, producerPortId) {
  const mechanism = proposedById.get(mechanismId);
  const group = mechanism.productInputs.find((candidate) => candidate.id === groupId);
  const groupPortIds = new Set(group.ports.map((input) => input.id));
  const consumerPort = group.ports.find((input) => input.id === consumerPortId);
  const targetStep = recipe.steps.find((candidate) => candidate.mechanismId === mechanismId);
  targetStep.productBindings = targetStep.productBindings.filter(
    (candidate) => !groupPortIds.has(candidate.consumerPortId),
  );
  targetStep.productBindings.push(binding(
    consumerPortId,
    producerInstanceId,
    producerPortId,
    identityEquality(consumerPort.identityPaths),
  ));
}

const customCurrentIds = new Set(
  retained
    .filter((mechanism) => ["partition-formation", "saliency-proposal", "candidate-nomination"].includes(
      INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(mechanism.id),
    ))
    .map((mechanism) => mechanism.id),
);

for (const target of retained.filter((mechanism) => !customCurrentIds.has(mechanism.id))) {
  const family = currentFamily.get(target.id);
  const recipe = baseRecipe(
    `recipe.witness.current.${slug(target.id)}.v1`,
    `current-${family}`,
    `Require ${target.id} as the sole current contribution at its typed acceptance point, then continue through exact-source treatment admission.`,
  );
  const instances = [];
  appendRecipeFoundation(recipe, instances, family !== "literature-fields");
  if (family === "candidate") {
    appendCurrentTarget(recipe, instances, target);
    appendStandardTail(
      recipe.steps,
      instances,
      "native-family-evidence",
      "product",
      mainArtifactId("evidence.native-family-evidence-construction"),
      { candidateMechanisms: [target] },
    );
  } else if (familyAnchors.has(family)) {
    appendCurrentTarget(recipe, instances, target);
    const anchorId = familyAnchors.get(family);
    appendProposal(recipe.steps, instances, anchorId, "family-contribution");
    const familyMechanisms = retained.filter((mechanism) => currentFamily.get(mechanism.id) === family);
    const targetOutput = currentProductOutputs(target)[0];
    const directAlternativeAnchor = [
      "candidate.archetypoid-observation-construction",
      "field.domain-evidence-election",
    ].includes(anchorId);
    replaceAlternativeBinding(
      recipe,
      anchorId,
      directAlternativeAnchor ? anchorId === "field.domain-evidence-election" ? "field-domain-proposal" : "candidate-domain-evidence" : `${family}-computed-products`,
      directAlternativeAnchor ? `from-current-${slug(target.id)}` : `from-current-${familyMechanisms.findIndex((mechanism) => mechanism.id === target.id)}`,
      `current-${slug(target.id)}`,
      targetOutput.id,
    );
    appendStandardTail(recipe.steps, instances, "family-contribution", "product", mainArtifactId(anchorId));
  } else if (["search-selection", "literature-decisions"].includes(family)) {
    appendProposal(recipe.steps, instances, "candidate.archetypoid-observation-construction", "family-contribution");
    appendStandardTail(recipe.steps, instances, "family-contribution", "product", mainArtifactId("candidate.archetypoid-observation-construction"), { searchMechanisms: [target] });
  } else if (family === "role") {
    appendProposal(recipe.steps, instances, "candidate.archetypoid-observation-construction", "family-contribution");
    appendStandardTail(recipe.steps, instances, "family-contribution", "product", mainArtifactId("candidate.archetypoid-observation-construction"), { roleMechanisms: [target] });
  } else {
    appendStandardTail(recipe.steps, instances, "native-family-evidence", "product", mainArtifactId("evidence.native-family-evidence-construction"), { repairMechanisms: [target] });
  }
  if (
    new Set(
      recipe.steps
        .map((entry) => entry.mechanismId)
        .filter((mechanismId) => INTERCHANGEABILITY_SLOT_BY_MECHANISM.get(mechanismId) === "field-domain-proposal"),
    ).size > 1
  ) {
    recipe.compositionTestSlots = ["field-domain-proposal"];
  }
  recipes.push(recipe);
}

const partitionAlternativeIds = [...INTERCHANGEABILITY_SLOT_BY_MECHANISM]
  .filter(([, slotId]) => slotId === "partition-formation")
  .map(([mechanismId]) => mechanismId);
for (const mechanismId of partitionAlternativeIds) {
  const current = retained.find((mechanism) => mechanism.id === mechanismId);
  const recipe = baseRecipe(
    `recipe.substitution.partition.${slug(mechanismId)}.v1`,
    "partition-formation",
    `Form a partition with ${mechanismId} alone, measure that partition, and continue through the unchanged candidate and treatment route.`,
  );
  const instances = [];
  appendRecipeFoundation(recipe, instances);
  if (current) appendCurrentTarget(recipe, instances, current);
  else appendProposal(recipe.steps, instances, mechanismId);
  appendProposal(recipe.steps, instances, "evidence.partition-native-region-measurement", "partition-acceptance");
  const producerInstanceId = current ? `current-${slug(mechanismId)}` : slug(mechanismId);
  const producerPortId = current ? currentProductOutputs(current)[0].id : "product";
  replaceAlternativeBinding(
    recipe,
    "evidence.partition-native-region-measurement",
    "partition-alternative",
    current ? `from-current-${slug(mechanismId)}` : `from-${slug(mechanismId)}`,
    producerInstanceId,
    producerPortId,
  );
  appendStandardTail(recipe.steps, instances, "partition-acceptance", "product", mainArtifactId("evidence.partition-native-region-measurement"));
  recipes.push(recipe);
}

for (const mechanismId of [
  "literature.frequency-tuned-saliency",
  "literature.spectral-residual-saliency",
  "literature.boundary-connectivity-saliency",
]) {
  const target = retained.find((mechanism) => mechanism.id === mechanismId);
  const recipe = baseRecipe(
    `recipe.substitution.saliency.${slug(mechanismId)}.v1`,
    "saliency-proposal",
    `Use ${mechanismId} as the sole saliency proposal at the common salient-mark measurement point.`,
  );
  const instances = [];
  appendRecipeFoundation(recipe, instances);
  appendProposal(recipe.steps, instances, "saliency.source-color-proposal-extraction", "source-color-proposals");
  appendCurrentTarget(recipe, instances, target);
  appendProposal(recipe.steps, instances, "evidence.salient-mark-measurement", "salient-mark-measurement");
  replaceAlternativeBinding(
    recipe,
    "evidence.salient-mark-measurement",
    "saliency-proposal",
    `from-current-${slug(mechanismId)}`,
    `current-${slug(mechanismId)}`,
    currentProductOutputs(target)[0].id,
  );
  appendStandardTail(recipe.steps, instances, "native-family-evidence", "product", mainArtifactId("evidence.native-family-evidence-construction"));
  recipes.push(recipe);
}

for (const mechanismId of [
  "candidate.region-color-proposal-extraction",
  "candidate.representative-strategies",
]) {
  const current = retained.find((mechanism) => mechanism.id === mechanismId);
  const recipe = baseRecipe(
    `recipe.substitution.candidate.${slug(mechanismId)}.v1`,
    "candidate-nomination",
    `Use ${mechanismId} as the sole candidate nomination provider before native-witness redemption.`,
  );
  const instances = [];
  appendRecipeFoundation(recipe, instances);
  if (current) appendCurrentTarget(recipe, instances, current);
  else appendProposal(recipe.steps, instances, mechanismId);
  appendProposal(recipe.steps, instances, "candidate.archetypoid-observation-construction", "candidate-observations");
  replaceAlternativeBinding(
    recipe,
    "candidate.archetypoid-observation-construction",
    "candidate-domain-evidence",
    current ? `from-current-${slug(mechanismId)}` : `from-${slug(mechanismId)}`,
    current ? `current-${slug(mechanismId)}` : slug(mechanismId),
    current ? currentProductOutputs(current)[0].id : "product",
  );
  appendStandardTail(recipe.steps, instances, "candidate-observations", "product", mainArtifactId("candidate.archetypoid-observation-construction"));
  recipes.push(recipe);
}

for (const family of proposedFamilies) {
  const recipe = baseRecipe(`recipe.family.${family.id}.v1`, family.id, `Exercise the independent ${family.id} computation family before candidate construction, treatment selection, repair, and exact source admission.`);
  const instances = [];
  appendRecipeFoundation(recipe, instances, !family.id.startsWith("field-"));
  let previous = instances.find((instance) => instance.mechanismId === "evidence.native-family-evidence-construction");
  for (const id of family.ids) {
    if (["emergency", "selection-methods"].includes(family.id) || id === REPAIR_RESULT_ROLE_REIFICATION) continue;
    appendProposal(recipe.steps, instances, id);
    previous = instances.find((instance) => instance.mechanismId === id);
  }
  if (family.id === "emergency") {
    appendProposal(recipe.steps, instances, "field.accepted-domain-measurement", "emergency-domain-evidence");
    previous = instances.find((instance) => instance.mechanismId === "field.accepted-domain-measurement");
    appendStandardTail(recipe.steps, instances, previous.instanceId, "product", mainArtifactId(previous.mechanismId), { emergency: true });
  } else {
    appendStandardTail(
      recipe.steps,
      instances,
      previous.instanceId,
      previous.outputs[0].id,
      previous.outputs[0].artifactTypeId,
    );
  }
  recipes.push(recipe);
}

const witnessedProposalIds = new Set(recipes.flatMap((recipe) => recipe.steps.map((entry) => entry.mechanismId)));
const missingProposals = proposedMechanisms.filter((mechanism) => !witnessedProposalIds.has(mechanism.id) && !standardTailIds.has(mechanism.id));
if (missingProposals.length > 0) throw new Error(`Unassigned proposed mechanisms: ${missingProposals.map((mechanism) => mechanism.id).join(", ")}`);

const plan = {
  $schema: "../schema/branch-plan.schema.json",
  documentKind: "capability-branch-plan",
  schemaVersion: "1.0.0",
  sourceArtifactTypeId: SOURCE,
  goalArtifactTypeId: "artifact.product.ui-palette.v3",
  currentReadinessPolicy: "derive-required-nonproduct-ports-from-built-contract",
  requireCompleteActiveWitnesses: true,
  sidecarPolicy: {
    fixtureIdTemplate: "fixture.{mechanismId}.v1",
    visualizationIdTemplate: "visualization.{mechanismId}.v1",
    humanScoreIdTemplate: "human-score.{mechanismId}.v1",
    fixtureArtifactTypeId: "artifact.review.mechanism-known-good-fixture-set.v1",
    visualizationArtifactTypeId: "artifact.review.mechanism-output-visualization.v1",
    humanScoreArtifactTypeId: "artifact.report.mechanism-human-feedback-score.v1",
  },
  fixedConfigurations,
  readinessProviders,
  currentMechanisms: currentEntries,
  proposedArtifacts,
  artifactTypeAliases: {},
  productArtifactDemotions: [],
  proposedMechanisms,
  recipes,
};

const generatedPlan = `${JSON.stringify(plan, null, 2)}\n`;
if (check) {
  let currentPlan;
  try {
    currentPlan = await readFile(planPath, "utf8");
  } catch {
    throw new Error("branch-plan.json is missing; regenerate without --check.");
  }
  if (currentPlan !== generatedPlan) {
    throw new Error("branch-plan.json is stale; regenerate without --check.");
  }
  const branchAnalysis = JSON.parse(await readFile(branchAnalysisPath, "utf8"));
  if (
    branchAnalysis.capabilityGraphDigest?.algorithm !== "sha256" ||
    branchAnalysis.capabilityGraphDigest?.basis !== "canonical-json-utf8" ||
    branchAnalysis.capabilityGraphDigest?.sha256 !== capabilityGraphSha256
  ) {
    throw new Error("branch-analysis.json does not match the exact canonical capability-graph.json bytes.");
  }
} else {
  await writeFile(planPath, generatedPlan);
}
