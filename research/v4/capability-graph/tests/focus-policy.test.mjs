import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ARTIFACT_PRODUCT_FOCI,
  MECHANISM_FOCUS_CLASSES,
} from "../src/types.ts";

const classes = {
  "product-transformation": [
    "raster.native-opaque-decode", "raster.transparency-policy", "color.oklab-working-space",
    "publication.black-white-escape", "publication.explicit-collapse",
    "evidence.family-quantization", "evidence.connected-components", "evidence.slic-region-graph",
    "evidence.border-frame-ownership", "evidence.structural-text-shape", "evidence.legacy-structural-text-heuristics",
    "evidence.robust-field-fit", "evidence.residual-marks", "evidence.tree-of-shapes",
    "evidence.per-pixel-rank-fields", "evidence.multiscale-surround", "evidence.area-integral-extent-substrate",
    "evidence.global-noise-estimation", "evidence.attribute-morphology-granulometry", "evidence.texture-descriptors",
    "evidence.fh-size-adaptive-merge", "candidate.role-aware-shortlist", "candidate.hue-family-supplement",
    "candidate.representative-strategies", "candidate.field-hypotheses", "candidate.native-transition-path",
    "candidate.band-local-endpoints", "candidate.multi-source-fan-in", "candidate.canonical-deduplication",
    "candidate.stratified-cap", "role.field-conditional-classifier", "role.identity-obligations",
    "role.text-led-foreground", "role.maximin-ramp-foreground", "role.accent-shape-evidence",
    "role.per-mass-mark-reading", "role.text-mark-swap", "role.family-relationship-mirroring",
    "role.salience-led-candidacy", "role.hue-direction-diversity", "role.legacy-independent-election",
    "gradient.semantic-boolean", "gradient.low-frequency-and-path-detectors",
    "gradient.fit-based-structure-choice", "gradient.endpoint-snap", "gradient.endpoint-outward-walk",
    "gradient.transition-support-and-flat-fallback", "gradient.spatial-midpoint-band",
    "gradient.transition-stage-midpoint", "gradient.excursion-midpoint-insertion",
    "gradient.mdl-path-simplification", "gradient.lambda-structure-price",
    "search.complete-tuple-enumeration", "search.exact-branch-and-bound", "selection.banded-comparator",
    "selection.fixed-relaxation", "selection.content-tie-break", "repair.user-floor-repick",
    "literature.constrained-connectivity", "literature.mutex-watershed", "literature.lifted-multicut",
    "literature.relative-total-variation", "literature.total-generalized-variation",
    "literature.graph-trend-filtering", "literature.archetypoids", "literature.diverse-m-best",
    "literature.electre-outranking", "literature.differentiable-soft-morphology",
    "literature.rgbxy-palette-layers", "literature.frequency-tuned-saliency",
    "literature.spectral-residual-saliency", "literature.boundary-connectivity-saliency",
  ],
  "product-admission": [
    "publication.exact-native-pixel", "gradient.midpoint-endpoint-distinctness",
    "gradient.whole-ramp-contrast", "selection.source-lineage-filter",
    "selection.transition-promotion", "selection.pareto-retention",
    "selection.noncompensatory-blocks", "repair.winner-gated-zero-contrast",
    "validation.contract-invariants", "literature.submodular-target-cover",
    "literature.submodular-budget-maximization",
  ],
  "evaluation-probe": [
    "color.same-color-ruler", "evidence.population-connectivity-spread", "evidence.native-mask-scale-space",
    "evidence.topology-descriptors", "evidence.legacy-adaptive-edge-text-regions",
    "role.population-eligibility", "gradient.indistinct-fraction",
    "gradient.owned-continuity-evidence", "gradient.frozen-exact-pair-scorer",
    "gradient.excursion-probe", "selection.weighted-quality-currency",
    "selection.global-description-length", "selection.gamut-identity-coverage",
    "validation.deterministic-replay",
    "validation.perturbation-harness", "validation.parameter-and-cap-sensitivity",
    "validation.typed-statistical-refusal", "validation.synthetic-controls",
    "literature.unbalanced-optimal-transport", "literature.fused-gromov-wasserstein",
    "literature.s-cielab", "literature.cambi", "literature.center-smoothing",
  ],
  "review-custody": [
    "candidate.recall-versus-ranking", "gradient.native-exact-pair-transfer",
    "gradient.render-geometry-custody", "validation.standing-evidence-adjudication",
    "validation.blast-radius-adjudication", "validation.warehouse-latest-verdict",
    "validation.scoped-semantic-review", "validation.complete-treatment-review",
  ],
  "configuration-governance": [
    "validation.parameter-provenance-census", "validation.numeric-literal-provenance-scanner",
    "validation.content-addressed-development-loop", "validation.artifact-hash-custody",
    "literature.conformal-risk-control",
  ],
  "historical-comparator": [
    "raster.fixed-working-copy", "evidence.legacy-weighted-kmeans", "evidence.legacy-elbow-k-election",
    "evidence.legacy-gap-k-election", "publication.legacy-nearest-observed-cluster-color",
    "evidence.legacy-local-contrast-saliency", "evidence.unused-otsu-threshold",
    "publication.source-connected-lineage", "evidence.legacy-fixed-threshold-text-regions",
    "selection.portfolio-selector",
  ],
  "research-only-oracle": [
    "validation.known-good-substitution", "validation.answer-bearing-upper-bound",
    "model.vlm-closed-question-set", "model.grammar-constrained-decoding", "model.wording-disagreement",
    "model.sam-mask-generation", "model.sam-residual-subtraction", "model.point-to-sam-ground",
    "model.global-embeddings", "model.dino-cls-mean-patch", "model.monocular-depth-ground",
    "literature.tokencut", "literature.double-dip", "literature.deepgaze-iii",
    "literature.dbnet-text-maps", "literature.learned-theme-representativeness",
    "selection.incumbent-anchored-replacement", "literature.topology-loss",
    "literature.decolor-contiguous-outliers", "literature.interval-bound-propagation",
  ],
};

const mechanismClass = new Map;
for (const [focusClass, ids] of Object.entries(classes)) {
  for (const id of ids) {
    if (mechanismClass.has(id)) throw new Error(`Duplicate mechanism classification: ${id}`);
    mechanismClass.set(id, focusClass);
  }
}

const root = path.resolve(import.meta.dirname, "..");
const fragmentFiles = fs.readdirSync(path.join(root, "data/fragments"))
  .filter((file) => file.endsWith(".json")).sort();
const fragments = fragmentFiles.map((file) => ({
  file,
  value: JSON.parse(fs.readFileSync(path.join(root, "data/fragments", file), "utf8")),
}));
const mechanisms = fragments.flatMap(({ value }) => value.mechanismTypings);
const canonicalArtifacts = new Map;
for (const { value } of fragments) for (const artifact of value.artifactTypes) canonicalArtifacts.set(artifact.id, artifact);
const mechanismCounts = Object.fromEntries(Object.keys(classes).map((key) => [key, classes[key].length]));
const artifactCounts = {};
for (const artifact of canonicalArtifacts.values()) {
  artifactCounts[artifact.productFocus] = (artifactCounts[artifact.productFocus] ?? 0) + 1;
}

test("every mechanism retains its audited explicit focus class", () => {
  assert.equal(mechanismClass.size, mechanisms.length);
  for (const mechanism of mechanisms) {
    assert.equal(mechanism.focusClass, mechanismClass.get(mechanism.id), mechanism.id);
  }
  assert.deepEqual(mechanismCounts, {
    "product-transformation": 72,
    "product-admission": 11,
    "evaluation-probe": 23,
    "review-custody": 8,
    "configuration-governance": 5,
    "historical-comparator": 10,
    "research-only-oracle": 20,
  });
  assert.deepEqual(
    [...new Set(mechanisms.map((mechanism) => mechanism.focusClass))].sort(),
    [...MECHANISM_FOCUS_CLASSES].sort(),
  );
});

test("artifact focus metadata is explicit, closed, and consistent across definitions", () => {
  assert.equal(canonicalArtifacts.size, 589);
  const focusById = new Map;
  for (const { value } of fragments) {
    for (const artifact of value.artifactTypes) {
      assert.ok(ARTIFACT_PRODUCT_FOCI.includes(artifact.productFocus), artifact.id);
      const existing = focusById.get(artifact.id);
      if (existing !== undefined) assert.equal(artifact.productFocus, existing, artifact.id);
      focusById.set(artifact.id, artifact.productFocus);
    }
  }
  assert.deepEqual(artifactCounts, {
    "product-flow": 191,
    "inspector-metadata": 138,
    "secondary-overlay": 86,
    "full-analysis-only": 174,
  });
});

test("representative source-backed artifact focus decisions remain pinned", () => {
  const expected = {
    "artifact.custody.source-connected-lineage-record.v1": "full-analysis-only",
    "artifact.candidate-set.legacy-fixed-text-rectangle-pixels.v1": "full-analysis-only",
    "artifact.candidate-set.legacy-adaptive-text-contour-pixels.v1": "secondary-overlay",
    "artifact.evidence.gradient-pair-detector.v1": "product-flow",
    "artifact.hypothesis.gradient-pair-eligibility.v1": "product-flow",
    "artifact.hypothesis.gradient-semantic-field-claim.v1": "product-flow",
    "artifact.candidate-set.noncompensatory-survivor-subset.v1": "product-flow",
    "artifact.mask.gradient-field-known-good-projection.v1": "inspector-metadata",
    "artifact.measurement.portfolio-member-independent-evidence.v1": "full-analysis-only",
    "artifact.report.incumbent-replacement.v1": "full-analysis-only",
    "artifact.graph.pixel-region-adjacency.v1": "product-flow",
    "artifact.configuration.constrained-connectivity-limits.v1": "inspector-metadata",
    "artifact.provenance.constrained-connectivity-thresholds.v1": "secondary-overlay",
    "artifact.scalar-field.soft-morphology-input.v1": "product-flow",
    "artifact.model.soft-morphology-learned-structuring-element.v1": "inspector-metadata",
    "artifact.custody.soft-morphology-training-corpus.v1": "inspector-metadata",
    "artifact.diagnostic.soft-morphology-parameter-gradients.v1": "secondary-overlay",
    "artifact.measurement.unbalanced-transport-plan.v1": "secondary-overlay",
    "artifact.graph.topology-loss-persistence-pairs.v1": "full-analysis-only",
  };
  for (const [id, productFocus] of Object.entries(expected)) {
    assert.equal(canonicalArtifacts.get(id)?.productFocus, productFocus, id);
  }
});
