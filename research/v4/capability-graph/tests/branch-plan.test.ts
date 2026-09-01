import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BRANCH_PLAN_PATH,
  BRANCH_SCHEMA_PATH,
  assertBranchAnalysisCapabilityGraphDigest,
  assertBranchAnalysisPlanDigest,
  loadValidateAndAnalyzeBranchPlan,
  validateAndAnalyzeBranchPlan,
} from "../src/branch.ts";
import type {
  BranchConstraint,
  BranchInputGroup,
  BranchPlanManifest,
  BranchPort,
  ProposedArtifact,
  ProposedMechanism,
  RecipeBinding,
} from "../src/branch-types.ts";
import { readStrictJson, sha256 } from "../src/generation.ts";
import type {
  ArtifactPermittedValueConstraint,
  ArtifactType,
  CapabilityGraph,
  JsonValue,
  MechanismRecord,
} from "../src/types.ts";
import { loadFixtures } from "./helpers.ts";

const SOURCE = "artifact.source.encoded-artwork-image.v1" as const;
const GOAL = "artifact.product.ui-palette.v3" as const;
const REPAIRED_TREATMENT = "artifact.plan.repaired-treatment.v1";
const FINAL_TREATMENT = "artifact.treatment.admitted-final.v1";
const OCCUPANCY = "artifact.measurement.native-color-occupancy.v1";
const REFUSAL = "artifact.test.refusal.v1";
const FIXTURE = "artifact.test.fixture.v1";
const VISUALIZATION = "artifact.test.visualization.v1";
const SCORE = "artifact.test.score.v1";
const execFileAsync = promisify(execFile);
const BRANCH_GENERATOR_PATH = new URL("../scripts/regenerate-branch-plan.mjs", import.meta.url);
const WORKBENCH_URL = new URL("../web/workbench.js", import.meta.url);
const TREATMENT_CONTENT_PATHS = [
  "/sourceFingerprint",
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
const PRODUCT_TREATMENT_CONTENT_PATHS = [
  "/sourceImageId",
  ...TREATMENT_CONTENT_PATHS.filter((path) => path !== "/sourceFingerprint"),
] as const;
const OCCUPANCY_WITNESS_PATHS = [
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
const REPAIRED_TREATMENT_ADMISSION_PATHS = [
  ...PRODUCT_TREATMENT_CONTENT_PATHS,
  ...OCCUPANCY_WITNESS_PATHS,
] as const;
const ADMITTED_TREATMENT_PATHS = [
  ...PRODUCT_TREATMENT_CONTENT_PATHS,
  "/treatmentVariant",
  ...OCCUPANCY_WITNESS_PATHS,
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
const EMERGENCY_ADMISSION_PATHS = [
  "/admission/infeasibilityProofId",
  "/admission/evaluatedCandidateIds",
  "/admission/exhaustedConstraintWitnesses",
  "/admission/zeroFeasibleCount",
] as const;
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

function treatmentInspectionPaths(
  paths: readonly string[] = PRODUCT_TREATMENT_CONTENT_PATHS,
): ProposedArtifact["valueInspection"]["paths"] {
  return paths.map((valuePath) => ({
    valuePath,
    valueKind: "state",
    permittedConstraints:
      valuePath === "/treatmentKind"
        ? [{ comparator: "in", value: ["flat", "gradient"] }]
        : valuePath === "/admission/kind"
          ? [
              { comparator: "in", value: ["ordinary", "emergency-flat"] },
              { comparator: "equals", value: "ordinary" },
              { comparator: "equals", value: "emergency-flat" },
            ]
          : valuePath === "/admission/allRequiredColorsOccupied"
            ? [{ comparator: "equals", value: true }]
        : [{ comparator: "equals", value: "present" }],
    notes: ["Complete treatment content."],
  }));
}

function goalInspectionPaths(): NonNullable<ArtifactType["valueInspection"]>["paths"] {
  return V3_PALETTE_REQUIRED_PATHS.map((valuePath) => ({
    valuePath,
    valueKind: valuePath.endsWith("/rgb")
      ? "collection"
      : valuePath === "/gradient"
        ? "object"
        : valuePath.endsWith("Collapsed")
          ? "state"
          : "scalar",
    permittedConstraints:
      valuePath === "/contractVersion"
        ? [{ comparator: "equals", value: "v3-contract-0.1.0" }]
        : valuePath.endsWith("/rgb")
          ? [{ comparator: "count-equals", value: 3 }]
          : valuePath.endsWith("/hex")
            ? [{ comparator: "matches", value: "^#[0-9a-f]{6}$" }]
            : valuePath === "/metadata/inputContentHash"
              ? [{ comparator: "matches", value: "^[0-9a-f]{64}$" }]
              : valuePath.endsWith("Collapsed")
                ? [{ comparator: "in", value: [true, false] }]
                : [{ comparator: "present" }],
    notes: ["Independent v3 goal contract."],
  }));
}

function treatmentPort(
  id: string,
  artifactTypeId = FINAL_TREATMENT,
  admissionKind?: "ordinary" | "emergency-flat",
): BranchPort {
  const admitted = artifactTypeId === FINAL_TREATMENT;
  return port(id, artifactTypeId, "exactly-one", [
    TREATMENT_KIND_CONSTRAINT,
    ...(admitted
      ? [
          admissionKind
            ? { valuePath: "/admission/kind", comparator: "equals", value: admissionKind } as BranchConstraint
            : { valuePath: "/admission/kind", comparator: "in", value: ["ordinary", "emergency-flat"] } as BranchConstraint,
          { valuePath: "/admission/allRequiredColorsOccupied", comparator: "equals", value: true } as BranchConstraint,
        ]
      : []),
  ], [...(admitted ? ADMITTED_TREATMENT_PATHS : PRODUCT_TREATMENT_CONTENT_PATHS)]);
}

function treatmentBindings(consumerPortId: string, producerInstanceId: string, producerPortId: string): RecipeBinding {
  return binding(
    consumerPortId,
    producerInstanceId,
    producerPortId,
    (consumerPortId === "admitted-treatment"
      ? ADMITTED_TREATMENT_PATHS
      : PRODUCT_TREATMENT_CONTENT_PATHS).map((valuePath) => ({
      producerValuePath: valuePath,
      consumerValuePath: valuePath,
    })),
  );
}

function occupancyBinding(producerInstanceId: string): RecipeBinding {
  return binding(
    "native-color-occupancy",
    producerInstanceId,
    "native-color-occupancy",
    ["/nativeRasterId", "/occupiedColorIds"].map((valuePath) => ({
      producerValuePath: valuePath,
      consumerValuePath: valuePath,
    })),
  );
}

function inspection(
  valuePath: string,
  values: readonly JsonValue[],
): NonNullable<ArtifactType["valueInspection"]> {
  return {
    notes: ["Independent test contract."],
    paths: [
      {
        valuePath,
        valueKind: "state",
        permittedConstraints: values.map((value) => ({ comparator: "equals", value })),
        notes: ["Independent test path."],
      },
    ],
  };
}

function artifact(
  id: string,
  productFocus: ArtifactType["productFocus"] = "product-flow",
  valueInspection?: ArtifactType["valueInspection"],
): ArtifactType {
  return {
    id,
    productFocus,
    label: id,
    description: id,
    category: "treatment",
    plane: "runtime",
    axisPositionId: "commitment.native-source",
    laneId: "lane.source-and-publication",
    contractMaturity: "draft",
    boundaryClassification: id === GOAL ? "product-goal" : "internal",
      valueInspection:
      valueInspection ??
      (id === GOAL
        ? {
            paths: goalInspectionPaths(),
            notes: ["Published treatment content."],
          }
        : undefined),
    sourceNotes: [],
    provenanceNotes: [],
  };
}

function proposedArtifact(
  id: string,
  kind: ProposedArtifact["kind"],
  productFocus: ProposedArtifact["productFocus"],
  paths: ProposedArtifact["valueInspection"]["paths"] = [],
): ProposedArtifact {
  const effectivePaths =
    paths.length > 0 || kind !== "product"
      ? paths
      : [
          {
            valuePath: "/domainValues",
            valueKind: "collection" as const,
            permittedConstraints: [{ comparator: "count-between-inclusive" as const, value: [1, 16] }],
            notes: ["Non-empty bounded test domain."],
          },
        ];
  return {
    id,
    kind,
    productFocus,
    label: id,
    description: id,
    payloadShape: {
      kind: "object",
      schemaRef: `schema://${id}`,
      description: `Shape for ${id}.`,
      fields: effectivePaths.map((path) => ({
        valuePath: path.valuePath,
        valueKind: path.valueKind,
        required: false,
      })),
    },
    valueInspection: { paths: effectivePaths, notes: ["Independent test contract."] },
  };
}

function port(
  id: string,
  artifactTypeId: string,
  cardinality: BranchPort["cardinality"] = "exactly-one",
  constraints: BranchConstraint[] = [],
  identityPaths: string[] = [],
): BranchPort {
  return { id, artifactTypeId, cardinality, constraints, identityPaths };
}

function binding(
  consumerPortId: string,
  producerInstanceId: string,
  producerPortId: string,
  equalityConstraints: RecipeBinding["equalityConstraints"] = [],
): RecipeBinding {
  return {
    consumerPortId,
    producerInstanceId,
    producerPortId,
    equalityConstraints,
  };
}

function proposal(
  id: string,
  productInputs: BranchInputGroup[],
  successPorts: BranchPort[],
): ProposedMechanism {
  return {
    id,
    title: id,
    layer: "test",
    workbenchLayer: "evidence",
    sourceRef: `test:${id}`,
    operation: id,
    productInputs,
    productOutputs: [
      { id: "success", ports: successPorts },
      { id: "refusal", ports: [port("refusal", REFUSAL)] },
    ],
    crossPortConstraints: [],
    readiness: {
      fixedConfigRefs: [`config.${id}`],
      requiredNonProductInputs: [],
      implementationAvailable: false,
      fixtureAvailable: false,
      visualizationAvailable: false,
      humanScoreAvailable: false,
    },
    sidecars: {
      fixtureId: `fixture.${id}.v1`,
      visualizationId: `visualization.${id}.v1`,
      humanScoreId: `human-score.${id}.v1`,
      availability: "planned-unavailable",
    },
  };
}

function graph(
  artifactTypes: ArtifactType[] = [artifact(GOAL)],
  mechanisms: MechanismRecord[] = [],
): CapabilityGraph {
  return {
    mechanisms,
    artifactTypes,
    analysis: {
      productFocus: {
        primaryMechanismIds: mechanisms
          .filter(
            (mechanism) =>
              mechanism.focusClass === "product-transformation" ||
              mechanism.focusClass === "product-admission",
          )
          .map((mechanism) => mechanism.id),
        primaryArtifactIds: artifactTypes
          .filter((entry) => entry.productFocus === "product-flow")
          .map((entry) => entry.id),
        primaryIncidences: [],
      },
    },
  } as unknown as CapabilityGraph;
}

function manifest(direct = proposal(
  "test.direct",
  [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
  [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)],
)): BranchPlanManifest {
  const directSuccessPorts = direct.productOutputs.find(
    (branch) => branch.id === "success",
  )!.ports;
  if (!directSuccessPorts.some((entry) => entry.id === "native-color-occupancy")) {
    directSuccessPorts.push(
      port(
        "native-color-occupancy",
        OCCUPANCY,
        "exactly-one",
        [],
        ["/nativeRasterId", "/occupiedColorIds"],
      ),
    );
  }
  const admission = proposal(
    "publication.exact-source-treatment-admission",
    [
      { id: "repaired-treatment", mode: "all", ports: [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)] },
      {
        id: "native-occupancy",
        mode: "all",
        ports: [port("native-color-occupancy", OCCUPANCY, "exactly-one", [], [
          "/nativeRasterId",
          "/occupiedColorIds",
        ])],
      },
    ],
    [treatmentPort("admitted-treatment", FINAL_TREATMENT, "ordinary")],
  );
  const materializer = proposal(
    "publication.ui-palette-v3-materializer",
    [{ id: "admitted-final-treatment", mode: "all", ports: [treatmentPort("admitted-treatment")] }],
    [port("ui-palette", GOAL, "exactly-one", [
      { valuePath: "/contractVersion", comparator: "equals", value: "v3-contract-0.1.0" },
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        { valuePath: `/roles/${role}/rgb`, comparator: "count-equals", value: 3 } as BranchConstraint,
        { valuePath: `/roles/${role}/hex`, comparator: "matches", value: "^#[0-9a-f]{6}$" } as BranchConstraint,
      ]),
    ], [...V3_PALETTE_REQUIRED_PATHS])],
  );
  const proposedArtifacts = [
    proposedArtifact(SOURCE, "product", "product-flow"),
    proposedArtifact(REPAIRED_TREATMENT, "product", "product-flow", treatmentInspectionPaths()),
    proposedArtifact(FINAL_TREATMENT, "product", "product-flow", treatmentInspectionPaths(ADMITTED_TREATMENT_PATHS)),
    proposedArtifact(OCCUPANCY, "product", "product-flow", [
      {
        valuePath: "/nativeRasterId",
        valueKind: "scalar",
        permittedConstraints: [{ comparator: "matches", value: ".+" }],
        notes: ["Native raster identity."],
      },
      {
        valuePath: "/occupiedColorIds",
        valueKind: "collection",
        permittedConstraints: [{ comparator: "count-between-inclusive", value: [1, 16777216] }],
        notes: ["Exactly occupied native colors."],
      },
    ]),
    proposedArtifact(REFUSAL, "product", "product-flow", [
      {
        valuePath: "/decision/reason",
        valueKind: "scalar",
        permittedConstraints: [{ comparator: "in", value: ["invalid-input", "infeasible-domain"] }],
        notes: ["Explicit refusal reason."],
      },
    ]),
    proposedArtifact(FIXTURE, "sidecar", "secondary-overlay"),
    proposedArtifact(VISUALIZATION, "sidecar", "secondary-overlay"),
    proposedArtifact(SCORE, "sidecar", "secondary-overlay"),
  ];
  return {
    documentKind: "capability-branch-plan",
    schemaVersion: "1.0.0",
    sourceArtifactTypeId: SOURCE,
    goalArtifactTypeId: GOAL,
    currentReadinessPolicy: "derive-required-nonproduct-ports-from-built-contract",
    sidecarPolicy: {
      fixtureIdTemplate: "fixture.{mechanismId}.v1",
      visualizationIdTemplate: "visualization.{mechanismId}.v1",
      humanScoreIdTemplate: "human-score.{mechanismId}.v1",
      fixtureArtifactTypeId: FIXTURE,
      visualizationArtifactTypeId: VISUALIZATION,
      humanScoreArtifactTypeId: SCORE,
    },
    fixedConfigurations: [
      { id: `config.${direct.id}`, available: true },
      { id: "config.publication.exact-source-treatment-admission", available: true },
      { id: "config.publication.ui-palette-v3-materializer", available: true },
    ],
    readinessProviders: [],
    currentMechanisms: [],
    proposedArtifacts,
    artifactTypeAliases: {},
    productArtifactDemotions: [],
    proposedMechanisms: [direct, admission, materializer],
    recipes: [
      {
        id: "recipe.test.direct",
        family: "direct",
        description: "Independent direct route.",
        preferred: false,
        declaredRootInstanceIds: [],
        steps: [
          {
            instanceId: "direct",
            mechanismId: direct.id,
            selectedOutputBranch: "success",
            productBindings: [binding("source", "$source", "encoded-artwork")],
            readinessBindings: {
              fixedConfigRefs: [`config.${direct.id}`],
              nonProductInputs: [],
            },
          },
          {
            instanceId: "admit",
            mechanismId: admission.id,
            selectedOutputBranch: "success",
            productBindings: [
              treatmentBindings("repaired-treatment", "direct", "repaired-treatment"),
              occupancyBinding("direct"),
            ],
            readinessBindings: {
              fixedConfigRefs: ["config.publication.exact-source-treatment-admission"],
              nonProductInputs: [],
            },
          },
          {
            instanceId: "materialize",
            mechanismId: materializer.id,
            selectedOutputBranch: "success",
            productBindings: [treatmentBindings("admitted-treatment", "admit", "admitted-treatment")],
            readinessBindings: {
              fixedConfigRefs: ["config.publication.ui-palette-v3-materializer"],
              nonProductInputs: [],
            },
          },
        ],
        goalBinding: { producerInstanceId: "materialize", producerPortId: "ui-palette" },
        postGoalSidecars: [],
      },
    ],
  };
}

function substitutionFixture(): BranchPlanManifest {
  const value = manifest();
  const alternatives = ["test.pass-left", "test.pass-right"].map((id) => {
    const mechanism = proposal(
      id,
      [{ id: "treatment", mode: "all", ports: [treatmentPort("treatment", REPAIRED_TREATMENT)] }],
      [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)],
    );
    mechanism.interchangeabilitySlot = "test-treatment-pass";
    value.proposedMechanisms.push(mechanism);
    value.fixedConfigurations.push({ id: `config.${id}`, available: true });
    return mechanism;
  });
  const base = value.recipes[0]!;
  const admissionIndex = base.steps.findIndex((step) => step.instanceId === "admit");
  base.steps.splice(admissionIndex, 0, {
    instanceId: "treatment-pass",
    mechanismId: alternatives[0]!.id,
    selectedOutputBranch: "success",
    productBindings: [treatmentBindings("treatment", "direct", "repaired-treatment")],
    readinessBindings: {
      fixedConfigRefs: [`config.${alternatives[0]!.id}`],
      nonProductInputs: [],
    },
  });
  base.steps.find((step) => step.instanceId === "admit")!.productBindings[0] =
    treatmentBindings("repaired-treatment", "treatment-pass", "repaired-treatment");
  base.id = "recipe.test.pass-left";
  base.family = "pass-left";
  const sibling = structuredClone(base);
  sibling.id = "recipe.test.pass-right";
  sibling.family = "pass-right";
  const siblingPass = sibling.steps.find((step) => step.instanceId === "treatment-pass")!;
  siblingPass.mechanismId = alternatives[1]!.id;
  siblingPass.readinessBindings.fixedConfigRefs = [`config.${alternatives[1]!.id}`];
  value.recipes.push(sibling);
  return value;
}

function isolateRecipe(
  value: BranchPlanManifest,
  predicate: (recipe: BranchPlanManifest["recipes"][number]) => boolean,
): BranchPlanManifest["recipes"][number] {
  for (const entry of value.currentMechanisms) delete entry.interchangeabilitySlot;
  for (const mechanism of value.proposedMechanisms) delete mechanism.interchangeabilitySlot;
  const recipe = value.recipes.find(predicate)!;
  delete recipe.compositionTestSlots;
  value.recipes = [recipe];
  return recipe;
}

function splitJoinFixture(mode: BranchInputGroup["mode"] = "all"): {
  graph: CapabilityGraph;
  manifest: BranchPlanManifest;
} {
  const left = "artifact.test.left.v1";
  const right = "artifact.test.right.v1";
  const split = proposal(
    "test.split",
    [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
    [port("left", left), port("right", right)],
  );
  const join = proposal(
    "test.join",
    [
      {
        id: "inputs",
        mode,
        ports: [
          port("left", left, mode === "all" ? "exactly-one" : "zero-or-one"),
          port("right", right, mode === "all" ? "exactly-one" : "zero-or-one"),
        ],
      },
    ],
    [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)],
  );
  const value = manifest(split);
  value.fixedConfigurations.push({ id: "config.test.join", available: true });
  value.proposedMechanisms.push(join);
  value.recipes[0] = {
    id: `recipe.test.${mode}`,
    family: mode,
    description: `Independent ${mode} route.`,
    preferred: false,
    declaredRootInstanceIds: [],
    steps: [
      {
        instanceId: "split",
        mechanismId: "test.split",
        selectedOutputBranch: "success",
        productBindings: [binding("source", "$source", "encoded-artwork")],
        readinessBindings: {
          fixedConfigRefs: ["config.test.split"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "join",
        mechanismId: "test.join",
        selectedOutputBranch: "success",
        productBindings: [
          binding("left", "split", "left"),
          ...(mode === "all" ? [binding("right", "split", "right")] : []),
        ],
        readinessBindings: {
          fixedConfigRefs: ["config.test.join"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "admit",
        mechanismId: "publication.exact-source-treatment-admission",
        selectedOutputBranch: "success",
        productBindings: [
          treatmentBindings("repaired-treatment", "join", "repaired-treatment"),
          occupancyBinding("split"),
        ],
        readinessBindings: {
          fixedConfigRefs: ["config.publication.exact-source-treatment-admission"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "materialize",
        mechanismId: "publication.ui-palette-v3-materializer",
        selectedOutputBranch: "success",
        productBindings: [treatmentBindings("admitted-treatment", "admit", "admitted-treatment")],
        readinessBindings: {
          fixedConfigRefs: ["config.publication.ui-palette-v3-materializer"],
          nonProductInputs: [],
        },
      },
    ],
    goalBinding: { producerInstanceId: "materialize", producerPortId: "ui-palette" },
    postGoalSidecars: [],
  };
  return { graph: graph([artifact(GOAL), artifact(left), artifact(right)]), manifest: value };
}

function currentMechanism(
  id: string,
  inputPorts: MechanismRecord["inputPorts"],
  outputPorts: MechanismRecord["outputPorts"],
  focusClass: MechanismRecord["focusClass"] = "review-custody",
): MechanismRecord {
  return {
    id,
    title: id,
    focusClass,
    inputPorts,
    outputPorts,
    alternativeGroups: [],
    censusStatus: {
      implementationStates: ["live"],
    },
  } as unknown as MechanismRecord;
}

function failureCodes(value: BranchPlanManifest, fixtureGraph: CapabilityGraph): string[] {
  return validateAndAnalyzeBranchPlan(value, fixtureGraph).recipes[0]?.failures.map(
    (entry) => entry.code,
  ) ?? [];
}

test("independent direct route satisfies exact source-to-success-goal closure", () => {
  const value = manifest();
  const analysis = validateAndAnalyzeBranchPlan(value, graph());
  assert.equal(
    analysis.recipes[0]?.successful,
    true,
    JSON.stringify(analysis.recipes[0]?.failures),
  );
  assert.equal(analysis.recipes[0]?.sourceReached, true);
  assert.equal(analysis.recipes[0]?.goalReached, true);
  assert.equal(analysis.recipes[0]?.executionReadiness.ready, false);
  assert.deepEqual(analysis.recipeCounts, { declared: 1, successful: 1, executionReady: 0 });
});

test("recipe modules expand into analysis and reject unknown or duplicate references", async (t) => {
  await t.test("expands module steps", () => {
    const value = manifest();
    const moduleSteps = structuredClone(value.recipes[0]!.steps);
    value.recipeModules = [{ id: "module.direct", steps: moduleSteps }];
    value.recipes[0]!.moduleRefs = ["module.direct"];
    value.recipes[0]!.steps = [];
    const analysis = validateAndAnalyzeBranchPlan(value, graph()).recipes[0]!;
    assert.deepEqual(analysis.expandedSteps, moduleSteps);
    assert.equal(analysis.successful, true);
  });
  await t.test("rejects unknown module", () => {
    const value = manifest();
    value.recipes[0]!.moduleRefs = ["module.missing"];
    assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /unknown-recipe-module/);
  });
  await t.test("rejects duplicate module before map expansion", () => {
    const value = manifest();
    const module = { id: "module.direct", steps: [] };
    value.recipeModules = [module, structuredClone(module)];
    assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /duplicate-recipe-module/);
  });
});

test("proposed mechanisms require policy sidecars and unavailable readiness evidence", async (t) => {
  await t.test("rejects invalid sidecar IDs", () => {
    const value = manifest();
    value.proposedMechanisms[0]!.sidecars.fixtureId = "fixture.other.v1";
    assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /invalid-proposed-sidecar-plan/);
  });
  await t.test("rejects sidecar availability outside the planned state", () => {
    const value = manifest();
    (value.proposedMechanisms[0]!.sidecars as { availability: string }).availability = "available";
    assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /invalid-proposed-sidecar-plan/);
  });
  await t.test("rejects implementation and evidence availability", () => {
    for (const property of [
      "implementationAvailable",
      "fixtureAvailable",
      "visualizationAvailable",
      "humanScoreAvailable",
    ] as const) {
      const value = manifest();
      value.proposedMechanisms[0]!.readiness[property] = true;
      assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /invalid-proposed-sidecar-plan/);
    }
  });
});

test("unrouted mechanisms remain independently reviewable and complete witness policy fails closed", async () => {
  const value = manifest();
  const unrouted = proposal("test.unrouted", [], [port("unrouted", REFUSAL)]);
  value.fixedConfigurations.push({ id: "config.test.unrouted", available: true });
  value.proposedMechanisms.push(unrouted);
  const fixtureGraph = graph();
  const analysis = validateAndAnalyzeBranchPlan(value, fixtureGraph);
  const entry = analysis.effectiveDispositions.find(
    (disposition) => disposition.mechanismId === unrouted.id,
  );
  assert.equal(entry?.effectiveDisposition, "unrouted");
  assert.deepEqual(entry?.witnessRecipeIds, []);
  const webModule = await import(WORKBENCH_URL.href) as {
    assertBranchPayloadIntegrity(graph: unknown, plan: unknown, analysis: unknown): void;
    buildBranchWorkbench(graph: unknown, plan: unknown, analysis: unknown): {
      mechanismById: Map<string, { witnessRecipeIds: string[] }>;
    };
  };
  assert.doesNotThrow(() => webModule.assertBranchPayloadIntegrity(fixtureGraph, value, analysis));
  const workbench = webModule.buildBranchWorkbench(fixtureGraph, value, analysis);
  assert.deepEqual(workbench.mechanismById.get(unrouted.id)?.witnessRecipeIds, []);

  value.requireCompleteActiveWitnesses = true;
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph()),
    /unrouted-active-mechanism.*test\.unrouted.*unrouted/s,
  );
});

test("proposal inventory is manifest-derived and editorial descriptions are semantic-neutral", async () => {
  const value = manifest();
  const extraArtifactId = "artifact.test.additional-domain.v1";
  const extra = proposal(
    "test.additional-proposal",
    [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
    [port("domain", extraArtifactId)],
  );
  value.proposedArtifacts.push(
    proposedArtifact(extraArtifactId, "product", "product-flow", [
      {
        valuePath: "/additionalRegionIds",
        valueKind: "collection",
        permittedConstraints: [
          { comparator: "count-between-inclusive", value: [1, 16] },
        ],
        notes: ["Independent additional proposal domain."],
      },
    ]),
  );
  value.proposedMechanisms.push(extra);
  value.fixedConfigurations.push({ id: "config.test.additional-proposal", available: true });
  const added = validateAndAnalyzeBranchPlan(value, graph());
  assert.equal(added.inventoryCounts.proposedMechanisms, 4);
  assert.equal(
    added.effectiveDispositions.find((entry) => entry.mechanismId === extra.id)
      ?.effectiveDisposition,
    "unrouted",
  );

  value.proposedArtifacts.pop();
  value.proposedMechanisms.pop();
  value.fixedConfigurations.pop();
  assert.equal(
    validateAndAnalyzeBranchPlan(value, graph()).inventoryCounts.proposedMechanisms,
    3,
  );

  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  authored.proposedArtifacts.find((artifact) => artifact.kind === "product")!.description +=
    " Editorial clarification only.";
  assert.doesNotThrow(() => validateAndAnalyzeBranchPlan(authored, builtGraph));
});

test("goal ancestry alone cannot witness a contributor-only mechanism", () => {
  const value = manifest();
  const wire = "artifact.test.contributor-wire.v1";
  const root = proposal("test.contributor-root", [], [port("wire", wire)]);
  value.proposedArtifacts.push(proposedArtifact(wire, "product", "product-flow", [
    {
      valuePath: "/contributorEvidenceIds",
      valueKind: "collection",
      permittedConstraints: [{ comparator: "count-between-inclusive", value: [1, 16] }],
      notes: ["Typed contributor evidence identities."],
    },
  ]));
  value.proposedMechanisms.push(root);
  value.fixedConfigurations.push({ id: "config.test.contributor-root", available: true });
  value.proposedMechanisms[0]!.productInputs.push({
    id: "contributor-wire",
    mode: "all",
    ports: [port("contributor-wire", wire)],
  });
  value.recipes[0]!.declaredRootInstanceIds = ["contributor-root"];
  value.recipes[0]!.steps.unshift({
    instanceId: "contributor-root",
    mechanismId: root.id,
    selectedOutputBranch: "success",
    productBindings: [],
    readinessBindings: {
      fixedConfigRefs: ["config.test.contributor-root"],
      nonProductInputs: [],
    },
  });
  value.recipes[0]!.steps.find((step) => step.instanceId === "direct")!.productBindings.push(
    binding("contributor-wire", "contributor-root", "wire"),
  );

  const recipe = validateAndAnalyzeBranchPlan(value, graph()).recipes[0]!;
  assert.ok(recipe.contributingMechanismIds.includes(root.id));
  assert.equal(recipe.witnessedMechanismIds.includes(root.id), false);
  assert.ok(recipe.failures.some((entry) => entry.code === "contributor-only-mechanism-step"));
});

test("route presence is not an essential witness when removal preserves closure", () => {
  const value = manifest();
  const wire = "artifact.test.redundant-signal.v1";
  const redundant = proposal(
    "test.redundant-signal",
    [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
    [port("signal", wire)],
  );
  value.proposedArtifacts.push(proposedArtifact(wire, "product", "product-flow", [
    {
      valuePath: "/signalIds",
      valueKind: "collection",
      permittedConstraints: [{ comparator: "count-between-inclusive", value: [1, 8] }],
      notes: ["Redundant typed signal."],
    },
  ]));
  value.proposedMechanisms.push(redundant);
  value.fixedConfigurations.push({ id: "config.test.redundant-signal", available: true });
  value.proposedMechanisms.find((mechanism) => mechanism.id === "test.direct")!.productInputs.push({
    id: "redundant-alternatives",
    mode: "one-or-more",
    ports: [
      port("source-signal", SOURCE, "zero-or-one"),
      port("redundant-signal", wire, "zero-or-one"),
    ],
  });
  value.recipes[0]!.steps.unshift({
    instanceId: "redundant",
    mechanismId: redundant.id,
    selectedOutputBranch: "success",
    productBindings: [binding("source", "$source", "encoded-artwork")],
    readinessBindings: {
      fixedConfigRefs: ["config.test.redundant-signal"],
      nonProductInputs: [],
    },
  });
  value.recipes[0]!.steps.find((step) => step.instanceId === "direct")!.productBindings.push(
    binding("source-signal", "$source", "encoded-artwork"),
    binding("redundant-signal", "redundant", "signal"),
  );

  const analysis = validateAndAnalyzeBranchPlan(value, graph());
  const recipe = analysis.recipes[0]!;
  assert.equal(recipe.successful, true, JSON.stringify(recipe.failures));
  assert.ok(recipe.witnessedMechanismIds.includes(redundant.id));
  assert.equal(recipe.essentialMechanismIds.includes(redundant.id), false);
  assert.equal(
    analysis.effectiveDispositions.find((entry) => entry.mechanismId === redundant.id)
      ?.effectiveDisposition,
    "unrouted",
  );

  value.requireCompleteActiveWitnesses = true;
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph()),
    /unrouted-active-mechanism.*test\.redundant-signal/s,
  );
});

test("interchangeability slots require clean normalized substitutions", async (t) => {
  await t.test("accepts exact substitutions and a separately declared composition", () => {
    const value = substitutionFixture();
    const composition = structuredClone(value.recipes[0]!);
    composition.id = "recipe.test.pass-composition";
    composition.family = "pass-composition";
    composition.compositionTestSlots = ["test-treatment-pass"];
    const leftIndex = composition.steps.findIndex((step) => step.instanceId === "treatment-pass");
    composition.steps.splice(leftIndex + 1, 0, {
      instanceId: "treatment-pass-right",
      mechanismId: "test.pass-right",
      selectedOutputBranch: "success",
      productBindings: [
        treatmentBindings("treatment", "treatment-pass", "repaired-treatment"),
      ],
      readinessBindings: {
        fixedConfigRefs: ["config.test.pass-right"],
        nonProductInputs: [],
      },
    });
    composition.steps.find((step) => step.instanceId === "admit")!.productBindings[0] =
      treatmentBindings("repaired-treatment", "treatment-pass-right", "repaired-treatment");
    value.recipes.push(composition);

    const analysis = validateAndAnalyzeBranchPlan(value, graph());
    const slot = analysis.interchangeabilitySlots.find(
      (entry) => entry.slotId === "test-treatment-pass",
    );
    assert.deepEqual(slot?.mechanismIds, ["test.pass-left", "test.pass-right"]);
    assert.equal(slot?.comparisons.length, 1);
    assert.equal(
      analysis.recipes.find((recipe) => recipe.recipeId === composition.id)
        ?.essentialMechanismIds.includes("test.pass-right"),
      true,
    );
  });

  await t.test("rejects bundled competitors without composition metadata", () => {
    const value = substitutionFixture();
    const bundled = structuredClone(value.recipes[0]!);
    bundled.id = "recipe.test.pass-bundled";
    bundled.family = "pass-bundled";
    const leftIndex = bundled.steps.findIndex((step) => step.instanceId === "treatment-pass");
    bundled.steps.splice(leftIndex + 1, 0, {
      instanceId: "treatment-pass-right",
      mechanismId: "test.pass-right",
      selectedOutputBranch: "success",
      productBindings: [
        treatmentBindings("treatment", "treatment-pass", "repaired-treatment"),
      ],
      readinessBindings: {
        fixedConfigRefs: ["config.test.pass-right"],
        nonProductInputs: [],
      },
    });
    bundled.steps.find((step) => step.instanceId === "admit")!.productBindings[0] =
      treatmentBindings("repaired-treatment", "treatment-pass-right", "repaired-treatment");
    value.recipes.push(bundled);
    assert.throws(
      () => validateAndAnalyzeBranchPlan(value, graph()),
      /bundled-interchangeability-competitors/,
    );
  });

  await t.test("rejects alleged siblings whose non-slot surroundings differ", () => {
    const value = substitutionFixture();
    const alternateAdmission = structuredClone(
      value.proposedMechanisms.find(
        (mechanism) => mechanism.id === "publication.exact-source-treatment-admission",
      )!,
    );
    alternateAdmission.id = "test.alternate-admission";
    alternateAdmission.title = alternateAdmission.id;
    alternateAdmission.sourceRef = `test:${alternateAdmission.id}`;
    alternateAdmission.readiness.fixedConfigRefs = [`config.${alternateAdmission.id}`];
    alternateAdmission.sidecars = {
      fixtureId: `fixture.${alternateAdmission.id}.v1`,
      visualizationId: `visualization.${alternateAdmission.id}.v1`,
      humanScoreId: `human-score.${alternateAdmission.id}.v1`,
      availability: "planned-unavailable",
    };
    value.proposedMechanisms.push(alternateAdmission);
    value.fixedConfigurations.push({
      id: `config.${alternateAdmission.id}`,
      available: true,
    });
    const siblingAdmission = value.recipes[1]!.steps.find(
      (step) => step.instanceId === "admit",
    )!;
    siblingAdmission.mechanismId = alternateAdmission.id;
    siblingAdmission.readinessBindings.fixedConfigRefs = [`config.${alternateAdmission.id}`];
    assert.throws(
      () => validateAndAnalyzeBranchPlan(value, graph()),
      /missing-clean-substitution-comparison/,
    );
  });

  await t.test("rejects composition without separate clean substitutions", () => {
    const value = substitutionFixture();
    const composition = structuredClone(value.recipes[0]!);
    composition.id = "recipe.test.composition-only";
    composition.family = "composition-only";
    composition.compositionTestSlots = ["test-treatment-pass"];
    const leftIndex = composition.steps.findIndex((step) => step.instanceId === "treatment-pass");
    composition.steps.splice(leftIndex + 1, 0, {
      instanceId: "treatment-pass-right",
      mechanismId: "test.pass-right",
      selectedOutputBranch: "success",
      productBindings: [
        treatmentBindings("treatment", "treatment-pass", "repaired-treatment"),
      ],
      readinessBindings: {
        fixedConfigRefs: ["config.test.pass-right"],
        nonProductInputs: [],
      },
    });
    composition.steps.find((step) => step.instanceId === "admit")!.productBindings[0] =
      treatmentBindings("repaired-treatment", "treatment-pass-right", "repaired-treatment");
    value.recipes = [composition];
    assert.throws(
      () => validateAndAnalyzeBranchPlan(value, graph()),
      /composition-without-clean-substitution/,
    );
  });
});

test("clone detection uses consumed typed-step signatures rather than contributor IDs", () => {
  const value = manifest();
  const replacement = structuredClone(value.proposedMechanisms[0]!);
  replacement.id = "test.typed-clone-direct";
  replacement.title = replacement.id;
  replacement.sourceRef = `test:${replacement.id}`;
  replacement.readiness.fixedConfigRefs = [`config.${replacement.id}`];
  replacement.sidecars = {
    fixtureId: `fixture.${replacement.id}.v1`,
    visualizationId: `visualization.${replacement.id}.v1`,
    humanScoreId: `human-score.${replacement.id}.v1`,
    availability: "planned-unavailable",
  };
  value.proposedMechanisms.push(replacement);
  value.fixedConfigurations.push({ id: `config.${replacement.id}`, available: true });
  const clone = structuredClone(value.recipes[0]!);
  clone.id = "recipe.test.typed-edge-clone";
  clone.family = "typed-edge-clone";
  const clonedDirect = clone.steps.find((step) => step.instanceId === "direct")!;
  clonedDirect.mechanismId = replacement.id;
  clonedDirect.readinessBindings.fixedConfigRefs = [`config.${replacement.id}`];
  value.recipes.push(clone);

  assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /clone-recipe-family/);
});

test("one route cannot pack nearly the complete active mechanism inventory", () => {
  const value = manifest();
  const recipe = value.recipes[0]!;
  const admissionIndex = recipe.steps.findIndex((step) => step.instanceId === "admit");
  const chainSteps = [];
  let producerInstanceId = "direct";
  for (let index = 0; index < 7; index += 1) {
    const id = `test.packed-pass-${index}`;
    const mechanism = proposal(
      id,
      [{ id: "treatment", mode: "all", ports: [treatmentPort("treatment-input", REPAIRED_TREATMENT)] }],
      [treatmentPort("treatment-output", REPAIRED_TREATMENT)],
    );
    value.proposedMechanisms.push(mechanism);
    value.fixedConfigurations.push({ id: `config.${id}`, available: true });
    const instanceId = `packed-pass-${index}`;
    chainSteps.push({
      instanceId,
      mechanismId: id,
      selectedOutputBranch: "success" as const,
      productBindings: [
        treatmentBindings(
          "treatment-input",
          producerInstanceId,
          index === 0 ? "repaired-treatment" : "treatment-output",
        ),
      ],
      readinessBindings: { fixedConfigRefs: [`config.${id}`], nonProductInputs: [] },
    });
    producerInstanceId = instanceId;
  }
  recipe.steps.splice(admissionIndex, 0, ...chainSteps);
  recipe.steps.find((step) => step.instanceId === "admit")!.productBindings[0] =
    treatmentBindings("repaired-treatment", producerInstanceId, "treatment-output");

  assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /packed-recipe-family/);
});

test("independent AND and alternative groups enforce exact selected-port bounds", () => {
  const and = splitJoinFixture("all");
  assert.equal(validateAndAnalyzeBranchPlan(and.manifest, and.graph).recipes[0]?.successful, true);
  and.manifest.recipes[0]!.steps[1]!.productBindings.pop();
  assert.ok(failureCodes(and.manifest, and.graph).includes("input-group-cardinality"));

  const alternative = splitJoinFixture("exactly-one");
  assert.equal(
    validateAndAnalyzeBranchPlan(alternative.manifest, alternative.graph).recipes[0]?.successful,
    true,
  );
  alternative.manifest.recipes[0]!.steps[1]!.productBindings.push(
    binding("right", "split", "right"),
  );
  assert.ok(failureCodes(alternative.manifest, alternative.graph).includes("input-group-cardinality"));

  const oneOrMore = splitJoinFixture("one-or-more");
  assert.equal(
    validateAndAnalyzeBranchPlan(oneOrMore.manifest, oneOrMore.graph).recipes[0]?.successful,
    true,
  );
  oneOrMore.manifest.recipes[0]!.steps[1]!.productBindings = [];
  assert.ok(failureCodes(oneOrMore.manifest, oneOrMore.graph).includes("input-group-cardinality"));
});

test("duplicate consumer bindings cannot bypass exactly-one cardinality", () => {
  const value = manifest();
  value.recipes[0]!.steps[0]!.productBindings.push(
    binding("source", "$source", "encoded-artwork"),
  );
  const codes = failureCodes(value, graph());
  assert.ok(codes.includes("consumer-input-cardinality"));
});

test("one emitted artifact may fan out to multiple consumer ports", () => {
  const fixture = splitJoinFixture("all");
  const rightArtifact = fixture.manifest.proposedMechanisms[0]!.productOutputs[0]!.ports[0]!.artifactTypeId;
  fixture.manifest.proposedMechanisms.find(
    (mechanism) => mechanism.id === "test.join",
  )!.productInputs[0]!.ports[1]!.artifactTypeId = rightArtifact;
  fixture.manifest.recipes[0]!.steps[1]!.productBindings[1] = binding("right", "split", "left");
  assert.equal(
    validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]?.successful,
    true,
  );
});

test("unknown product instances, ports, consumers, and artifact types fail independently", async (t) => {
  await t.test("producer instance", () => {
    const value = manifest();
    value.recipes[0]!.steps[0]!.productBindings[0]!.producerInstanceId = "missing";
    assert.ok(failureCodes(value, graph()).includes("unknown-producer-instance"));
  });
  await t.test("producer port", () => {
    const value = manifest();
    value.recipes[0]!.steps[0]!.productBindings[0]!.producerPortId = "missing";
    assert.ok(failureCodes(value, graph()).includes("unknown-producer-port"));
  });
  await t.test("consumer port", () => {
    const value = manifest();
    value.recipes[0]!.steps[0]!.productBindings[0]!.consumerPortId = "missing";
    assert.ok(failureCodes(value, graph()).includes("unknown-consumer-port"));
  });
  await t.test("artifact type", () => {
    const other = "artifact.test.other.v1";
    const value = manifest();
    value.proposedMechanisms[0]!.productInputs[0]!.ports[0]!.artifactTypeId = other;
    assert.ok(failureCodes(value, graph([artifact(GOAL), artifact(other)])).includes("artifact-type-mismatch"));
  });
  await t.test("selected output branch", () => {
    const value = manifest();
    value.recipes[0]!.steps[0]!.selectedOutputBranch = "alpha";
    assert.ok(failureCodes(value, graph()).includes("unknown-output-branch"));
  });
});

test("aliases cannot escalate non-product artifacts into product closure", () => {
  const inspector = "artifact.test.inspector.v1";
  const alias = "artifact.test.alias.v1";
  const value = manifest();
  value.artifactTypeAliases[alias] = inspector;
  value.proposedMechanisms[0]!.productInputs[0]!.ports[0]!.artifactTypeId = alias;
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph([artifact(GOAL), artifact(inspector, "inspector-metadata")])),
    /artifact-alias-forbidden/,
  );
});

function constrainedFixture(
  producerConstraint: BranchConstraint,
  consumerConstraint: BranchConstraint,
  anchored = true,
): { graph: CapabilityGraph; manifest: BranchPlanManifest } {
  const wire = "artifact.test.constrained-wire.v1";
  const producer = proposal(
    "test.constraint-producer",
    [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
    [port("wire", wire, "exactly-one", [producerConstraint])],
  );
  const consumer = proposal(
    "test.constraint-consumer",
    [
      {
        id: "wire",
        mode: "all",
        ports: [port("wire", wire, "exactly-one", [consumerConstraint], ["/state"])],
      },
    ],
    [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)],
  );
  const value = manifest(producer);
  value.fixedConfigurations.push({ id: "config.test.constraint-consumer", available: true });
  value.proposedMechanisms.push(consumer);
  value.recipes[0] = {
    id: "recipe.test.constraints",
    family: "constraints",
    description: "Independent constraint route.",
    preferred: false,
    declaredRootInstanceIds: [],
    steps: [
      {
        instanceId: "producer",
        mechanismId: producer.id,
        selectedOutputBranch: "success",
        productBindings: [binding("source", "$source", "encoded-artwork")],
        readinessBindings: {
          fixedConfigRefs: ["config.test.constraint-producer"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "consumer",
        mechanismId: consumer.id,
        selectedOutputBranch: "success",
        productBindings: [
          binding("wire", "producer", "wire", [
            { producerValuePath: "/state", consumerValuePath: "/state" },
          ]),
        ],
        readinessBindings: {
          fixedConfigRefs: ["config.test.constraint-consumer"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "admit",
        mechanismId: "publication.exact-source-treatment-admission",
        selectedOutputBranch: "success",
        productBindings: [
          treatmentBindings("repaired-treatment", "consumer", "repaired-treatment"),
          occupancyBinding("producer"),
        ],
        readinessBindings: {
          fixedConfigRefs: ["config.publication.exact-source-treatment-admission"],
          nonProductInputs: [],
        },
      },
      {
        instanceId: "materialize",
        mechanismId: "publication.ui-palette-v3-materializer",
        selectedOutputBranch: "success",
        productBindings: [treatmentBindings("admitted-treatment", "admit", "admitted-treatment")],
        readinessBindings: {
          fixedConfigRefs: ["config.publication.ui-palette-v3-materializer"],
          nonProductInputs: [],
        },
      },
    ],
    goalBinding: { producerInstanceId: "materialize", producerPortId: "ui-palette" },
    postGoalSidecars: [],
  };
  return {
    graph: graph([
      artifact(GOAL),
      artifact(wire, "product-flow", anchored ? inspection("/state", ["ok", "bad"]) : undefined),
    ]),
    manifest: value,
  };
}

test("constraints require artifact anchors and producer implication", () => {
  const ok: BranchConstraint = { valuePath: "/state", comparator: "equals", value: "ok" };
  const bad: BranchConstraint = { valuePath: "/state", comparator: "equals", value: "bad" };
  const valid = constrainedFixture(ok, ok);
  assert.equal(validateAndAnalyzeBranchPlan(valid.manifest, valid.graph).recipes[0]?.successful, true);

  const unanchored = constrainedFixture(ok, ok, false);
  assert.throws(
    () => validateAndAnalyzeBranchPlan(unanchored.manifest, unanchored.graph),
    /unanchored-value-constraint/,
  );

  const incompatible = constrainedFixture(ok, bad);
  assert.ok(
    failureCodes(incompatible.manifest, incompatible.graph).includes("incompatible-value-constraint"),
  );
});

test("current product constraints require authoritative artifact inspection paths", () => {
  const wire = "artifact.test.current-constrained-wire.v1";
  const current = currentMechanism(
    "test.current-unanchored",
    [],
    [
      {
        id: "wire",
        label: "Wire",
        artifactTypeId: wire,
        cardinality: "exactly-one",
        valueConstraints: [
          { valuePath: "/state", comparator: "equals", value: "ok", notes: [] },
        ],
        valueStateNotes: [],
        notes: [],
      },
    ],
  );
  const value = manifest();
  value.currentMechanisms = [
    {
      mechanismId: current.id,
      disposition: "retained",
      reason: "Independent current constraint.",
      workbenchLayer: "evidence",
      excludedProductPorts: [],
    },
  ];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph([artifact(GOAL), artifact(wire)], [current])),
    /unanchored-value-constraint/,
  );
});

test("count-equals is preserved from authoritative contracts and cannot satisfy a different count", () => {
  const two = { valuePath: "/stops", comparator: "count-equals" as const, value: 2 };
  const three = { valuePath: "/stops", comparator: "count-equals" as const, value: 3 };
  const valid = constrainedFixture(two, two);
  valid.manifest.proposedMechanisms.find(
    (mechanism) => mechanism.id === "test.constraint-consumer",
  )!.productInputs[0]!.ports[0]!.identityPaths = [];
  valid.manifest.recipes[0]!.steps[1]!.productBindings[0]!.equalityConstraints = [];
  valid.graph.artifactTypes[1]!.valueInspection = {
    notes: ["Count contract."],
    paths: [{ valuePath: "/stops", valueKind: "collection", permittedConstraints: [two, three], notes: ["Stop count."] }],
  };
  assert.equal(validateAndAnalyzeBranchPlan(valid.manifest, valid.graph).recipes[0]?.successful, true);
  const invalid = constrainedFixture(two, three);
  invalid.manifest.proposedMechanisms.find(
    (mechanism) => mechanism.id === "test.constraint-consumer",
  )!.productInputs[0]!.ports[0]!.identityPaths = [];
  invalid.manifest.recipes[0]!.steps[1]!.productBindings[0]!.equalityConstraints = [];
  invalid.graph.artifactTypes[1]!.valueInspection = structuredClone(valid.graph.artifactTypes[1]!.valueInspection);
  assert.ok(failureCodes(invalid.manifest, invalid.graph).includes("incompatible-value-constraint"));
});

test("equality rejects provably disjoint inspected domains without requiring identical paths", () => {
  const invalid = constrainedFixture(
    { valuePath: "/state", comparator: "equals", value: 0 },
    { valuePath: "/state", comparator: "matches", value: "^[A-Za-z][A-Za-z0-9_-]*$" },
  );
  invalid.graph.artifactTypes[1]!.valueInspection = {
    notes: ["Typed state."],
    paths: [{
      valuePath: "/state",
      valueKind: "scalar",
      permittedConstraints: [
        { comparator: "equals", value: 0 },
        { comparator: "matches", value: "^[A-Za-z][A-Za-z0-9_-]*$" } as unknown as ArtifactPermittedValueConstraint,
      ],
      notes: ["Typed state."],
    }],
  };
  assert.ok(failureCodes(invalid.manifest, invalid.graph).includes("incompatible-equality-value-domain"));

  const valid = constrainedFixture(
    { valuePath: "/state", comparator: "equals", value: "ok" },
    { valuePath: "/state", comparator: "matches", value: "^[a-z]+$" },
  );
  valid.graph.artifactTypes[1]!.valueInspection = {
    notes: ["Typed state."],
    paths: [{
      valuePath: "/state",
      valueKind: "scalar",
      permittedConstraints: [
        { comparator: "equals", value: "ok" },
        { comparator: "matches", value: "^[a-z]+$" } as unknown as ArtifactPermittedValueConstraint,
      ],
      notes: ["Typed state."],
    }],
  };
  assert.equal(validateAndAnalyzeBranchPlan(valid.manifest, valid.graph).recipes[0]?.successful, true);
});

test("self, forward, and seeded dependency cycles are rejected", () => {
  const self = manifest();
  self.recipes[0]!.steps[0]!.productBindings[0] = binding("source", "direct", "goal");
  assert.ok(failureCodes(self, graph()).includes("self-cycle"));

  const forward = splitJoinFixture("all");
  forward.manifest.recipes[0]!.steps.reverse();
  assert.ok(failureCodes(forward.manifest, forward.graph).includes("forward-binding"));

  const wire = "artifact.test.cycle-wire.v1";
  const a = proposal(
    "test.cycle-a",
    [{ id: "wire", mode: "all", ports: [port("wire-in", wire)] }],
    [port("wire-out", wire), treatmentPort("repaired-treatment", REPAIRED_TREATMENT)],
  );
  const b = proposal(
    "test.cycle-b",
    [{ id: "wire", mode: "all", ports: [port("wire-in", wire)] }],
    [port("wire-out", wire)],
  );
  const cycle = manifest(a);
  cycle.fixedConfigurations.push({ id: "config.test.cycle-b", available: true });
  cycle.proposedMechanisms.push(b);
  cycle.recipes[0]!.steps = [
    {
      instanceId: "a",
      mechanismId: a.id,
      selectedOutputBranch: "success",
      productBindings: [binding("wire-in", "b", "wire-out")],
      readinessBindings: { fixedConfigRefs: ["config.test.cycle-a"], nonProductInputs: [] },
    },
    {
      instanceId: "b",
      mechanismId: b.id,
      selectedOutputBranch: "success",
      productBindings: [binding("wire-in", "a", "wire-out")],
      readinessBindings: { fixedConfigRefs: ["config.test.cycle-b"], nonProductInputs: [] },
    },
    {
      instanceId: "admit",
      mechanismId: "publication.exact-source-treatment-admission",
      selectedOutputBranch: "success",
      productBindings: [treatmentBindings("repaired-treatment", "a", "repaired-treatment")],
      readinessBindings: { fixedConfigRefs: ["config.publication.exact-source-treatment-admission"], nonProductInputs: [] },
    },
    {
      instanceId: "materialize",
      mechanismId: "publication.ui-palette-v3-materializer",
      selectedOutputBranch: "success",
      productBindings: [treatmentBindings("admitted-treatment", "admit", "admitted-treatment")],
      readinessBindings: { fixedConfigRefs: ["config.publication.ui-palette-v3-materializer"], nonProductInputs: [] },
    },
  ];
  cycle.recipes[0]!.goalBinding = { producerInstanceId: "materialize", producerPortId: "ui-palette" };
  assert.ok(failureCodes(cycle, graph([artifact(GOAL), artifact(wire)])).includes("recipe-cycle"));
});

test("goal ancestry rejects disconnected source witnesses and undeclared zero-input roots", () => {
  const root = proposal("test.root", [], [treatmentPort("repaired-treatment", REPAIRED_TREATMENT)]);
  const fakeRoot = manifest(root);
  fakeRoot.recipes[0]!.steps[0]!.productBindings = [];
  assert.ok(failureCodes(fakeRoot, graph()).includes("undeclared-zero-input-root"));

  const wire = "artifact.test.disconnected.v1";
  const sourceProbe = proposal(
    "test.source-probe",
    [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
    [port("wire", wire)],
  );
  const disconnected = manifest(root);
  disconnected.fixedConfigurations.push({ id: "config.test.source-probe", available: true });
  disconnected.proposedMechanisms.push(sourceProbe);
  disconnected.recipes[0]!.declaredRootInstanceIds = ["root"];
  disconnected.recipes[0]!.steps = [
    {
      instanceId: "probe",
      mechanismId: sourceProbe.id,
      selectedOutputBranch: "success",
      productBindings: [binding("source", "$source", "encoded-artwork")],
      readinessBindings: { fixedConfigRefs: ["config.test.source-probe"], nonProductInputs: [] },
    },
    {
      instanceId: "root",
      mechanismId: root.id,
      selectedOutputBranch: "success",
      productBindings: [],
      readinessBindings: { fixedConfigRefs: ["config.test.root"], nonProductInputs: [] },
    },
    {
      instanceId: "admit",
      mechanismId: "publication.exact-source-treatment-admission",
      selectedOutputBranch: "success",
      productBindings: [treatmentBindings("repaired-treatment", "root", "repaired-treatment")],
      readinessBindings: { fixedConfigRefs: ["config.publication.exact-source-treatment-admission"], nonProductInputs: [] },
    },
    {
      instanceId: "materialize",
      mechanismId: "publication.ui-palette-v3-materializer",
      selectedOutputBranch: "success",
      productBindings: [treatmentBindings("admitted-treatment", "admit", "admitted-treatment")],
      readinessBindings: { fixedConfigRefs: ["config.publication.ui-palette-v3-materializer"], nonProductInputs: [] },
    },
  ];
  disconnected.recipes[0]!.goalBinding = { producerInstanceId: "materialize", producerPortId: "ui-palette" };
  const codes = failureCodes(disconnected, graph([artifact(GOAL), artifact(wire)]));
  assert.ok(codes.includes("source-not-in-goal-ancestry"));
  assert.ok(codes.includes("disconnected-product-step"));
});

test("goal requires one exact success-branch producer port", async (t) => {
  await t.test("duplicate goal outputs", () => {
    const value = manifest();
    const mechanism = value.proposedMechanisms[0]!;
    mechanism.productOutputs[0]!.ports = [port("wire", REFUSAL)];
    mechanism.productOutputs.push({
      id: "alpha",
      ports: [port("goal-one", GOAL), port("goal-two", GOAL)],
    });
    value.recipes[0]!.steps = [value.recipes[0]!.steps[0]!];
    value.recipes[0]!.steps[0]!.selectedOutputBranch = "alpha";
    value.recipes[0]!.goalBinding = { producerInstanceId: "direct", producerPortId: "goal-one" };
    assert.throws(
      () => validateAndAnalyzeBranchPlan(value, graph()),
      /unauthorized-ui-palette-v3-success-output/,
    );
  });
  await t.test("wrong declared producer port", () => {
    const value = manifest();
    value.recipes[0]!.goalBinding.producerPortId = "refusal";
    assert.ok(failureCodes(value, graph()).includes("goal-binding-mismatch"));
  });

  for (const branchId of ["alpha", "abstention", "refusal"] as const) {
    await t.test(`goal on ${branchId}`, () => {
      const wire = "artifact.test.nongoal.v1";
      const value = manifest();
      const mechanism = value.proposedMechanisms[0]!;
      mechanism.productOutputs[0]!.ports = [port("wire", wire)];
      const branch = mechanism.productOutputs.find((entry) => entry.id === branchId) ?? {
        id: branchId,
        ports: [port(branchId, GOAL)],
      };
      branch.ports = [port(branchId, GOAL)];
      if (!mechanism.productOutputs.includes(branch)) mechanism.productOutputs.push(branch);
      value.recipes[0]!.steps = [value.recipes[0]!.steps[0]!];
      value.recipes[0]!.steps[0]!.selectedOutputBranch = branchId;
      value.recipes[0]!.goalBinding = {
        producerInstanceId: "direct",
        producerPortId: branchId,
      };
      assert.throws(
        () => validateAndAnalyzeBranchPlan(value, graph([artifact(GOAL), artifact(wire)])),
        /unauthorized-ui-palette-v3-success-output/,
      );
    });
  }
});

function readinessFixture(): { graph: CapabilityGraph; manifest: BranchPlanManifest } {
  const value = manifest();
  const fixtureArtifact = value.proposedArtifacts.find((entry) => entry.id === FIXTURE)!;
  fixtureArtifact.valueInspection.paths = [
    {
      valuePath: "/id",
      valueKind: "state",
      permittedConstraints: [{ comparator: "equals", value: "known" }],
      notes: ["Fixture identity."],
    },
  ];
  fixtureArtifact.payloadShape.fields = [
    { valuePath: "/id", valueKind: "state", required: true },
  ];
  value.proposedMechanisms[0]!.readiness.requiredNonProductInputs = [
    port("fixture", FIXTURE, "exactly-one", [], ["/id"]),
  ];
  value.readinessProviders = [
    {
      id: "provider.fixture",
      available: true,
      outputPorts: [port("fixture", FIXTURE, "exactly-one", [], ["/id"])],
    },
  ];
  value.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs = [
    {
      consumerInputId: "fixture",
      producerKind: "external-provider",
      producerId: "provider.fixture",
      producerPortId: "fixture",
      equalityConstraints: [
        { producerValuePath: "/id", consumerValuePath: "/id" },
      ],
    },
  ];
  return { graph: graph(), manifest: value };
}

test("source artifact must resolve to a declared product-flow external source", () => {
  const value = manifest();
  value.proposedArtifacts = value.proposedArtifacts.filter((entry) => entry.id !== SOURCE);
  assert.throws(() => validateAndAnalyzeBranchPlan(value, graph()), /invalid-source-artifact/);
});

test("proposed readiness inputs reject duplicate IDs before contract mapping", () => {
  const value = manifest();
  value.proposedMechanisms[0]!.readiness.requiredNonProductInputs = [
    port("fixture", FIXTURE),
    port("fixture", VISUALIZATION),
  ];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph()),
    /duplicate-proposed-readiness-input/,
  );
});

test("readiness validates provider identity, port, type, availability, and fixtures", async (t) => {
  await t.test("valid external provider", () => {
    const fixture = readinessFixture();
    assert.equal(
      validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]?.executionReadiness.ready,
      false,
    );
  });
  await t.test("one emitted readiness artifact may feed multiple inputs", () => {
    const fixture = readinessFixture();
    fixture.manifest.proposedMechanisms[0]!.readiness.requiredNonProductInputs.push(
      port("fixture-copy", FIXTURE, "exactly-one", [], ["/id"]),
    );
    fixture.manifest.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs.push({
      consumerInputId: "fixture-copy",
      producerKind: "external-provider",
      producerId: "provider.fixture",
      producerPortId: "fixture",
      equalityConstraints: [{ producerValuePath: "/id", consumerValuePath: "/id" }],
    });
    const readiness = validateAndAnalyzeBranchPlan(
      fixture.manifest,
      fixture.graph,
    ).recipes[0]!.executionReadiness;
    assert.equal(
      readiness.failures.some((entry) => entry.code === "readiness-input-cardinality"),
      false,
    );
  });
  await t.test("unknown provider", () => {
    const fixture = readinessFixture();
    fixture.manifest.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs[0]!.producerId = "missing";
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "unknown-readiness-provider"));
    assert.ok(readiness.missingNonProductInputs.length > 0);
  });
  await t.test("unknown recipe instance", () => {
    const fixture = readinessFixture();
    const row = fixture.manifest.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs[0]!;
    row.producerKind = "recipe-instance";
    row.producerId = "missing";
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "unknown-readiness-instance"));
  });
  await t.test("unknown producer port", () => {
    const fixture = readinessFixture();
    fixture.manifest.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs[0]!.producerPortId = "missing";
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "unknown-readiness-producer-port"));
  });
  await t.test("missing identity binding", () => {
    const fixture = readinessFixture();
    fixture.manifest.recipes[0]!.steps[0]!.readinessBindings.nonProductInputs[0]!.equalityConstraints = [];
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "missing-identity-constraint"));
    assert.equal(readiness.ready, false);
  });
  await t.test("artifact type mismatch", () => {
    const fixture = readinessFixture();
    fixture.manifest.readinessProviders[0]!.outputPorts[0]!.artifactTypeId = VISUALIZATION;
    fixture.manifest.readinessProviders[0]!.outputPorts[0]!.identityPaths = [];
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "artifact-type-mismatch"));
  });
  await t.test("unavailable provider", () => {
    const fixture = readinessFixture();
    fixture.manifest.readinessProviders[0]!.available = false;
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.ok(readiness.failures.some((entry) => entry.code === "unavailable-readiness-producer"));
    assert.equal(readiness.ready, false);
  });
  await t.test("unavailable mechanism fixture", () => {
    const fixture = readinessFixture();
    fixture.manifest.proposedMechanisms[0]!.readiness.fixtureAvailable = false;
    const readiness = validateAndAnalyzeBranchPlan(fixture.manifest, fixture.graph).recipes[0]!.executionReadiness;
    assert.equal(readiness.ready, false);
    assert.deepEqual(readiness.unavailableFixtures, [
      "fixture.publication.exact-source-treatment-admission.v1",
      "fixture.publication.ui-palette-v3-materializer.v1",
      "fixture.test.direct.v1",
    ]);
  });
});

test("post-goal sidecars consume the exact goal downstream and never contribute to product", () => {
  const inspector = "artifact.test.sidecar-output.v1";
  const sidecar = currentMechanism(
    "test.sidecar",
    [
      {
        id: "palette",
        label: "Palette",
        artifactTypeId: GOAL,
        requirement: "required",
        cardinality: "exactly-one",
        inputClass: "natural",
        notes: [],
      },
    ],
    [
      {
        id: "inspection",
        label: "Inspection",
        artifactTypeId: inspector,
        cardinality: "exactly-one",
        valueStateNotes: [],
        notes: [],
      },
    ],
  );
  const fixtureGraph = graph([artifact(GOAL), artifact(inspector, "inspector-metadata")], [sidecar]);
  const value = manifest();
  value.currentMechanisms = [
    {
      mechanismId: sidecar.id,
      disposition: "sidecar",
      reason: "Independent sidecar.",
      excludedProductPorts: [],
    },
  ];
  value.recipes[0]!.postGoalSidecars = [
    {
      instanceId: "post-check",
      mechanismId: sidecar.id,
      consumerPortId: "palette",
      producerInstanceId: "materialize",
      producerPortId: "ui-palette",
      equalityConstraints: [],
    },
  ];
  const analysis = validateAndAnalyzeBranchPlan(value, fixtureGraph).recipes[0]!;
  assert.equal(analysis.successful, true);
  assert.deepEqual(analysis.contributingMechanismIds, [
    "publication.exact-source-treatment-admission",
    "publication.ui-palette-v3-materializer",
    "test.direct",
  ]);

  value.recipes[0]!.postGoalSidecars[0]!.producerInstanceId = "$source";
  assert.ok(failureCodes(value, fixtureGraph).includes("post-goal-sidecar-direction"));
});

test("post-goal sidecars reject a replacement contract that exceeds the built contract", () => {
  const sidecar = currentMechanism(
    "test.constrained-sidecar",
    [
      {
        id: "palette",
        label: "Palette",
        artifactTypeId: GOAL,
        requirement: "required",
        cardinality: "exactly-one",
        inputClass: "natural",
        notes: [],
      },
    ],
    [],
  );
  const fixtureGraph = graph([
    artifact(GOAL, "product-flow", inspection("/id", ["known"])),
  ], [sidecar]);
  const value = manifest();
  value.proposedMechanisms[0]!.productOutputs[0]!.ports[0] = port(
    "goal",
    GOAL,
    "exactly-one",
    [{ valuePath: "/id", comparator: "equals", value: "known" }],
    ["/id"],
  );
  value.currentMechanisms = [
    {
      mechanismId: sidecar.id,
      disposition: "sidecar",
      reason: "Independent constrained sidecar.",
      excludedProductPorts: [],
      replacementContract: {
        reason: "Constrained post-goal input.",
        productInputs: [
          {
            id: "palette",
            mode: "all",
            ports: [
              port(
                "palette",
                GOAL,
                "exactly-one",
                [{ valuePath: "/id", comparator: "equals", value: "known" }],
                ["/id"],
              ),
            ],
          },
        ],
        productOutputs: [{ id: "success", ports: [] }],
      },
    },
  ];
  value.recipes[0]!.postGoalSidecars = [
    {
      instanceId: "post-check",
      mechanismId: sidecar.id,
      consumerPortId: "palette",
      producerInstanceId: "materialize",
      producerPortId: "ui-palette",
      equalityConstraints: [{ producerValuePath: "/id", consumerValuePath: "/id" }],
    },
  ];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, fixtureGraph),
    /replacement-contract-mismatch/,
  );

});

test("current contract overrides require valid ports and an explicit replacement contract", () => {
  const wire = "artifact.test.current-wire.v1";
  const current = currentMechanism(
    "test.current",
    [],
    [
      {
        id: "wire",
        label: "Wire",
        artifactTypeId: wire,
        cardinality: "zero-or-one",
        valueStateNotes: [],
        notes: [],
      },
    ],
    "product-transformation",
  );
  const fixtureGraph = graph([artifact(GOAL), artifact(wire)], [current]);
  const stale = manifest();
  stale.currentMechanisms = [
    {
      mechanismId: current.id,
      disposition: "retained",
      reason: "Independent current contract.",
      workbenchLayer: "evidence",
      excludedProductPorts: ["output:missing"],
    },
  ];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(stale, fixtureGraph),
    /unknown-current-contract-port/,
  );

  const implicit = manifest();
  implicit.currentMechanisms = [
    {
      mechanismId: current.id,
      disposition: "retained",
      reason: "Independent current contract.",
      workbenchLayer: "evidence",
      excludedProductPorts: [],
      outputCardinalityOverrides: { wire: "exactly-one" },
    },
  ];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(implicit, fixtureGraph),
    /implicit-current-contract-rewrite/,
  );

  implicit.currentMechanisms[0]!.replacementContract = {
    reason: "Explicit test-only replacement.",
    productInputs: [],
    productOutputs: [{ id: "success", ports: [port("wire", wire)] }],
  };
  assert.doesNotThrow(() => validateAndAnalyzeBranchPlan(implicit, fixtureGraph));
});

test("replacement contracts cannot fabricate a source-to-final-treatment route", () => {
  const wire = "artifact.test.current-wire.v1";
  const current = currentMechanism(
    "test.current-replacement",
    [],
    [{ id: "wire", label: "Wire", artifactTypeId: wire, cardinality: "exactly-one", valueStateNotes: [], notes: [] }],
    "product-transformation",
  );
  const value = manifest();
  value.currentMechanisms = [{
    mechanismId: current.id,
    disposition: "retained",
    reason: "Built contract must remain authoritative.",
    workbenchLayer: "evidence",
    excludedProductPorts: [],
    replacementContract: {
      reason: "Fabricated replacement.",
      productInputs: [{ id: "source", mode: "all", ports: [port("source", SOURCE)] }],
      productOutputs: [{ id: "success", ports: [port("final-treatment", "artifact.treatment.final-exact-source-ordinary.v1")] }],
    },
  }];
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph([artifact(GOAL), artifact(wire), artifact("artifact.treatment.final-exact-source-ordinary.v1")], [current])),
    /replacement-contract-mismatch/,
  );
});

test("proposed mechanisms cannot bypass raw source directly to final treatment", () => {
  const value = manifest();
  value.proposedMechanisms[0]!.productOutputs[0]!.ports = [
    port("final-treatment", "artifact.treatment.final-exact-source-ordinary.v1"),
  ];
  value.proposedArtifacts.push(proposedArtifact("artifact.treatment.final-exact-source-ordinary.v1", "product", "product-flow"));
  assert.throws(
    () => validateAndAnalyzeBranchPlan(value, graph()),
    /raw-source-final-treatment-bypass/,
  );
});

test("the v3 materializer is the sole closed publication boundary", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);

  const missing = structuredClone(authored);
  missing.proposedMechanisms = missing.proposedMechanisms.filter(
    (mechanism) => mechanism.id !== "publication.ui-palette-v3-materializer",
  );
  assert.throws(
    () => validateAndAnalyzeBranchPlan(missing, builtGraph),
    /ui-palette-v3-materializer-cardinality/,
  );

  const duplicate = structuredClone(authored);
  duplicate.proposedMechanisms.push(
    structuredClone(duplicate.proposedMechanisms.find(
      (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
    )!),
  );
  assert.throws(
    () => validateAndAnalyzeBranchPlan(duplicate, builtGraph),
    /ui-palette-v3-materializer-cardinality/,
  );

  const alternateMaterializer = structuredClone(authored);
  const materializer = alternateMaterializer.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  )!;
  alternateMaterializer.proposedMechanisms.push({
    ...materializer,
    id: "publication.alternate-ui-palette-v3-materializer",
  });
  assert.throws(
    () => validateAndAnalyzeBranchPlan(alternateMaterializer, builtGraph),
    /unauthorized-ui-palette-v3-success-output/,
  );

  const alternateProducer = structuredClone(authored);
  alternateProducer.proposedMechanisms.find(
    (mechanism) => mechanism.id === "raster.native-artwork-decode",
  )!.productOutputs[0]!.ports.push(port("unauthorized-ui-palette", GOAL));
  assert.throws(
    () => validateAndAnalyzeBranchPlan(alternateProducer, builtGraph),
    /unauthorized-ui-palette-v3-success-output/,
  );

  const alternateNonsuccessProducer = structuredClone(authored);
  alternateNonsuccessProducer.proposedMechanisms.find(
    (mechanism) => mechanism.id === "raster.native-artwork-decode",
  )!.productOutputs.find(
    (branch) => branch.id !== "success",
  )!.ports.push(port("unauthorized-nonsuccess-ui-palette", GOAL));
  assert.throws(
    () => validateAndAnalyzeBranchPlan(alternateNonsuccessProducer, builtGraph),
    /unauthorized-ui-palette-v3-success-output/,
  );

  const duplicateMaterializerV3Output = structuredClone(authored);
  duplicateMaterializerV3Output.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  )!.productOutputs.find(
    (branch) => branch.id === "success",
  )!.ports.push(port("second-ui-palette", GOAL));
  assert.throws(
    () => validateAndAnalyzeBranchPlan(duplicateMaterializerV3Output, builtGraph),
    /materializer-must-preserve-admitted-treatment-content/,
  );

  const extraMaterializerInput = structuredClone(authored);
  extraMaterializerInput.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  )!.productInputs.push({ id: "extraneous", mode: "all", ports: [] });
  assert.throws(
    () => validateAndAnalyzeBranchPlan(extraMaterializerInput, builtGraph),
    /materializer-must-preserve-admitted-treatment-content/,
  );

  const wrongMaterializerInput = structuredClone(authored);
  wrongMaterializerInput.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  )!.productInputs[0]!.ports[0]!.artifactTypeId = "artifact.plan.repaired-treatment.v1";
  assert.throws(
    () => validateAndAnalyzeBranchPlan(wrongMaterializerInput, builtGraph),
    /materializer-must-preserve-admitted-treatment-content/,
  );

  const extraMaterializerOutput = structuredClone(authored);
  extraMaterializerOutput.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  )!.productOutputs[0]!.ports.push(port("extraneous-output", "artifact.decision.alpha-not-opaque-refusal.v1"));
  assert.throws(
    () => validateAndAnalyzeBranchPlan(extraMaterializerOutput, builtGraph),
    /materializer-must-preserve-admitted-treatment-content/,
  );
});

test("the built goal authoritatively declares publication inspection paths", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const goal = builtGraph.artifactTypes.find((artifact) => artifact.id === GOAL);
  assert.ok(goal);
  assert.ok(goal.valueInspection);
  assert.ok(
    V3_PALETTE_REQUIRED_PATHS.every((valuePath) =>
      goal.valueInspection?.paths.some((path) => path.valuePath === valuePath),
    ),
  );

  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const materializer = authored.proposedMechanisms.find(
    (mechanism) => mechanism.id === "publication.ui-palette-v3-materializer",
  );
  assert.ok(materializer);
  assert.deepEqual(
    materializer.productOutputs.find((branch) => branch.id === "success")?.ports[0]?.identityPaths,
    [...V3_PALETTE_REQUIRED_PATHS],
  );
});

test("native witness redemption rejects unrelated family endpoints", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const invalid = structuredClone(authored);
  const pool = invalid.proposedMechanisms.find(
    (mechanism) => mechanism.id === "candidate.native-witness-redemption",
  );
  assert.ok(pool);
  pool.productInputs.push({
    id: "unrelated-gradient-path",
    mode: "all",
    ports: [port("unrelated-gradient-path", "artifact.gradient.gradient-exact-path-election.v1")],
  });
  assert.throws(
    () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
    /native-witness-redemption-contract/,
  );
});

test("explicit generic route, mint, and custody product shims are rejected", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  for (const id of [
    "artifact.plan.route.disguised.v1",
    "artifact.evidence.renamed-route-result.v1",
    "artifact.evidence.renamed-mint-result.v1",
    "artifact.evidence.renamed-custody-result.v1",
  ]) {
    await t.test(id, () => {
      const invalid = structuredClone(authored);
      invalid.proposedArtifacts.push(proposedArtifact(id, "product", "product-flow"));
      assert.throws(
        () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
        /generic-closure-artifact/,
      );
    });
  }

  await t.test("semantic rename with an innocuous ID", () => {
    const invalid = structuredClone(authored);
    const shim = proposedArtifact(
      "artifact.evidence.renamed-output.v1",
      "product",
      "product-flow",
    );
    shim.label = "Closure output";
    shim.description = "A generic handoff output.";
    shim.payloadShape.description = "Generic result token.";
    shim.valueInspection.notes = ["Generic custody handoff output."];
    invalid.proposedArtifacts.push(shim);
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /generic-closure-artifact/,
    );
  });
});

test("legitimate minimal refusal and domain products are not closure shims", () => {
  const value = manifest();
  value.proposedArtifacts.push(
    proposedArtifact("artifact.test.minimal-refusal.v1", "product", "product-flow", [
      {
        valuePath: "/decision/reason",
        valueKind: "scalar",
        permittedConstraints: [{ comparator: "in", value: ["invalid-input", "infeasible-domain"] }],
        notes: ["Explicit domain refusal."],
      },
    ]),
    proposedArtifact("artifact.domain.minimal-color-set.v1", "product", "product-flow", [
      {
        valuePath: "/acceptedColorIds",
        valueKind: "collection",
        permittedConstraints: [{ comparator: "count-between-inclusive", value: [0, 4] }],
        notes: ["Accepted domain colors."],
      },
    ]),
  );
  assert.doesNotThrow(() => validateAndAnalyzeBranchPlan(value, graph()));
});

test("authored semantics reject occupancy loss, clone recipes, raster fanout, and renamed admission", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);

  await t.test("unconsumed native occupancy", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
    for (const step of recipe.steps) {
      step.productBindings = step.productBindings.filter(
        (entry) => entry.consumerPortId !== "native-color-occupancy",
      );
    }
    const analysis = validateAndAnalyzeBranchPlan(invalid, builtGraph);
    const checked = analysis.recipes.find((entry) => entry.recipeId === recipe.id)!;
    assert.ok(checked.failures.some((entry) => entry.code === "unconsumed-native-occupancy"));
  });

  await t.test("one-mechanism clone", () => {
    const invalid = structuredClone(authored);
    const clone = structuredClone(invalid.recipes[0]!);
    clone.id = "recipe.adversarial-clone.v1";
    clone.family = "adversarial-clone";
    invalid.recipes.push(clone);
    assert.throws(() => validateAndAnalyzeBranchPlan(invalid, builtGraph), /clone-recipe-family/);
  });

  await t.test("native raster fanout", () => {
    const invalid = structuredClone(authored);
    const mechanism = invalid.proposedMechanisms.find(
      (entry) => entry.id === "selection.structured-objective-construction",
    )!;
    mechanism.productInputs = [{
      id: "native-raster",
      mode: "all",
      ports: [port("native-raster", "artifact.raster.native-srgb8-opaque.v1")],
    }];
    assert.throws(() => validateAndAnalyzeBranchPlan(invalid, builtGraph), /omniscient-native-raster-fanout/);
  });

  await t.test("renamed generic admission", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.ordinary-exact-source-admission",
    )!.id = "publication.renamed-generic-admission";
    assert.throws(() => validateAndAnalyzeBranchPlan(invalid, builtGraph), /unauthorized-admitted-treatment-admission/);
  });

  await t.test("stale goal-contract admission despite exact occupancy contract", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.ordinary-exact-source-admission",
    )!.id = "publication.goal-contract-admission";
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /unauthorized-admitted-treatment-admission/,
    );
  });

  await t.test("exact-source admission missing occupied-color identity", () => {
    const invalid = structuredClone(authored);
    const admission = invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.ordinary-exact-source-admission",
    )!;
    const occupancy = admission.productInputs.flatMap((group) => group.ports).find(
      (entry) => entry.artifactTypeId === OCCUPANCY,
    )!;
    occupancy.identityPaths = ["/nativeRasterId"];
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /admission-must-preserve-complete-treatment-content/,
    );
  });

  await t.test("pre-reification mechanism mints a near-complete treatment", () => {
    const invalid = structuredClone(authored);
    const early = invalid.proposedMechanisms.find(
      (entry) => entry.id === "treatment.swapped-candidate-domain-insertion",
    )!;
    early.productOutputs.find((branch) => branch.id === "success")!.ports[0] =
      treatmentPort("premature-treatment", "artifact.treatment.selected-source-ordinary.v1");
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /near-complete-treatment-mint/,
    );
  });

  await t.test("metadata-only emergency infeasibility proof", () => {
    const invalid = structuredClone(authored);
    const proofArtifact = invalid.proposedArtifacts.find(
      (entry) => entry.id === "artifact.proof.exact-source-selection-infeasibility.v1",
    )!;
    const metadataPaths = proofArtifact.valueInspection.paths.filter((entry) =>
      ["/sourceFingerprint", "/nativeRasterId", "/provenanceChain"].includes(entry.valuePath),
    );
    proofArtifact.valueInspection.paths = metadataPaths;
    proofArtifact.payloadShape.fields = proofArtifact.payloadShape.fields.filter((entry) =>
      metadataPaths.some((path) => path.valuePath === entry.valuePath),
    );
    const proof = invalid.proposedMechanisms.find(
      (entry) => entry.id === "selection.exact-source-infeasibility-proof",
    )!;
    const proofOutput = proof.productOutputs.find((branch) => branch.id === "success")!.ports[0]!;
    proofOutput.constraints = [];
    proofOutput.identityPaths = metadataPaths.map((entry) => entry.valuePath);
    const emergencyAdmission = invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.emergency-exact-source-admission",
    )!;
    const proofInput = emergencyAdmission.productInputs.flatMap((group) => group.ports).find(
      (entry) => entry.artifactTypeId === proofOutput.artifactTypeId,
    )!;
    proofInput.constraints = [];
    proofInput.identityPaths = [...proofOutput.identityPaths];
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /emergency-infeasibility-proof-contract/,
    );
  });

  await t.test("emergency admission without typed proof binding", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const emergency = isolateRecipe(invalid, (entry) => entry.family === "emergency");
    const admission = emergency.steps.find(
      (entry) => entry.mechanismId === "publication.emergency-exact-source-admission",
    )!;
    admission.productBindings = admission.productBindings.filter(
      (entry) => entry.consumerPortId !== "infeasibility-proof",
    );
    const analysis = validateAndAnalyzeBranchPlan(invalid, builtGraph);
    const checked = analysis.recipes.find((entry) => entry.recipeId === emergency.id)!;
    assert.equal(checked.successful, false);
    assert.ok(
      checked.failures.some((entry) => entry.code === "emergency-typed-evidence-binding"),
    );
  });

  await t.test("nominal occupancy carriage without certificate consumption", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
    const materializer = recipe.steps.find(
      (entry) => entry.mechanismId === "publication.ui-palette-v3-materializer",
    )!;
    materializer.productBindings[0]!.equalityConstraints =
      materializer.productBindings[0]!.equalityConstraints.filter(
        (entry) => entry.consumerValuePath !== "/roles/accent/nativePixelWitness",
      );
    const analysis = validateAndAnalyzeBranchPlan(invalid, builtGraph);
    const checked = analysis.recipes.find((entry) => entry.recipeId === recipe.id)!;
    assert.ok(
      checked.failures.some(
        (entry) => entry.code === "materializer-admission-certificate-binding",
      ),
    );
  });

  await t.test("broad mechanism cannot add an unrelated arbitrary output", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms.find(
      (entry) => entry.id === "evidence.native-raster-primitives",
    )!.productOutputs.find((branch) => branch.id === "success")!.ports.push(
      port("unrelated-decision", "artifact.decision.alpha-not-opaque-refusal.v1"),
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /unrelated-proposed-output/,
    );
  });

  await t.test("materializer rejects an unadmitted emergency-flat input", () => {
    const invalid = structuredClone(authored);
    const materializer = invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.ui-palette-v3-materializer",
    )!;
    materializer.productInputs[0]!.ports = [
      treatmentPort("admitted-treatment", REPAIRED_TREATMENT),
    ];
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /materializer-must-preserve-admitted-treatment-content/,
    );
  });

  await t.test("decode rejects source identity, opaque condition, and alpha refusal gaps", () => {
    for (const mutate of [
      (decode: ProposedMechanism) => {
        decode.productInputs[0]!.ports[0]!.identityPaths = [];
      },
      (decode: ProposedMechanism) => {
        decode.productOutputs.find((branch) => branch.id === "success")!.ports[0]!.constraints = [];
      },
      (decode: ProposedMechanism) => {
        decode.productOutputs = decode.productOutputs.filter((branch) => branch.id !== "alpha");
      },
    ]) {
      const invalid = structuredClone(authored);
      mutate(invalid.proposedMechanisms.find(
        (entry) => entry.id === "raster.native-artwork-decode",
      )!);
      assert.throws(
        () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
        /decode-source-identity-alpha-contract/,
      );
    }
  });
});

test("proposal products reject renamed generic envelopes and broad packers", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  for (const mechanismId of [
    "evidence.native-raster-primitives",
    "field.accepted-domain-measurement",
    "selection.structured-objective-construction",
    "gradient.native-transition-stage-midpoint",
    "publication.exact-native-pixel-admission",
  ]) {
    await t.test(mechanismId, () => {
      const invalid = structuredClone(authored);
      const mechanism = invalid.proposedMechanisms.find((entry) => entry.id === mechanismId)!;
      const artifactId = mechanism.productOutputs[0]!.ports[0]!.artifactTypeId;
      const artifact = invalid.proposedArtifacts.find((entry) => entry.id === artifactId)!;
      const paths = [
        {
          valuePath: "/renamedOpaqueBundleIds",
          valueKind: "collection" as const,
          permittedConstraints: [{ comparator: "count-between-inclusive" as const, value: [1, 4096] }],
          notes: ["Renamed generic bundle."],
          semanticRole: `domain.${mechanism.layer}`,
        },
        {
          valuePath: "/unrelatedPackedProducts",
          valueKind: "collection" as const,
          permittedConstraints: [{ comparator: "count-between-inclusive" as const, value: [1, 4096] }],
          notes: ["Broad unrelated product packer."],
          semanticRole: `domain.${mechanism.layer}`,
        },
      ];
      artifact.payloadShape.fields = paths.map((path) => ({
        valuePath: path.valuePath,
        valueKind: path.valueKind,
        required: true,
      }));
      artifact.valueInspection.paths = paths;
      assert.throws(
        () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
        /mechanism-specific-computational-contract|missing-artifact-domain-semantics|undeclared-inspection-semantic-role/,
      );
    });
  }

  await t.test("innocuously renamed primary wrapper", () => {
    const invalid = structuredClone(authored);
    const mechanism = invalid.proposedMechanisms.find(
      (entry) => entry.id === "evidence.fixed-soft-morphology-regionization",
    )!;
    const wrapperId = "artifact.evidence.innocuous-derived-observation.v1";
    const wrapper = proposedArtifact(wrapperId, "product", "product-flow", [
      {
        valuePath: "/derivedObservationIds",
        valueKind: "collection",
        permittedConstraints: [{ comparator: "count-between-inclusive", value: [1, 4096] }],
        notes: ["Renamed broad observations."],
        semanticRole: "partition.morphology-regions",
      },
      {
        valuePath: "/packedDomainProducts",
        valueKind: "collection",
        permittedConstraints: [{ comparator: "count-between-inclusive", value: [1, 4096] }],
        notes: ["Unrelated packed products."],
        semanticRole: "partition.morphology-membership",
      },
    ]);
    wrapper.semanticRoles = [`mechanism.${mechanism.id}`, "partition.morphology-regions"];
    invalid.proposedArtifacts.push(wrapper);
    mechanism.productOutputs[0]!.ports[0]!.artifactTypeId = wrapperId;
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /mechanism-specific-computational-contract|missing-artifact-domain-semantics|undeclared-inspection-semantic-role/,
    );
  });

});

test("selected identity continuity rejects decision, reification, and transitive swaps", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  for (const [mechanismId, path, expected] of [
    ["selection.total-order-election", "/selectedCandidateId", /selected-decision-domain-membership-contract/],
    ["selection.total-order-election", "/paletteDomainId", /selected-decision-domain-membership-contract/],
    ["treatment.selected-treatment-role-reification", "/selectedCandidateId", /selected-treatment-exact-member-reification|treatment-selected-member-preservation/],
    ["treatment.selected-treatment-role-reification", "/selectionObjectiveId", /selected-treatment-exact-member-reification|treatment-selected-member-preservation/],
    ["treatment.selected-treatment-role-reification", "/selectedTreatmentRecord", /selected-treatment-exact-member-reification|treatment-selected-member-preservation/],
    ["treatment.selected-treatment-role-reification", "/selectedTreatmentRecords", /selected-treatment-exact-member-reification|treatment-selected-member-preservation/],
  ] as const) {
    await t.test(`${mechanismId} ${path}`, () => {
      const invalid = structuredClone(authored);
      const mechanism = invalid.proposedMechanisms.find((entry) => entry.id === mechanismId)!;
      mechanism.crossPortConstraints = mechanism.crossPortConstraints.filter(
        (constraint) => constraint.leftValuePath !== path,
      );
      assert.throws(() => validateAndAnalyzeBranchPlan(invalid, builtGraph), expected);
    });
  }

  for (const valuePath of [
    "/candidateDomainId",
    "/paletteDomainId",
    "/selectionObjectiveId",
    "/selectedCandidateId",
    "/selectedHypothesisId",
    "/selectedCandidateIds",
    "/selectedTreatmentRecord",
    "/selectedTreatmentRecords",
  ]) {
    await t.test(`recipe ${valuePath}`, () => {
      const invalid = structuredClone(authored);
      invalid.requireCompleteActiveWitnesses = false;
      const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
      const reification = recipe.steps.find(
        (step) => step.mechanismId === "treatment.selected-treatment-role-reification",
      )!;
      const binding = reification.productBindings.find(
        (entry) => entry.consumerPortId === "selected-decision",
      )!;
      binding.equalityConstraints = binding.equalityConstraints.filter(
        (constraint) => constraint.consumerValuePath !== valuePath,
      );
      const checked = validateAndAnalyzeBranchPlan(invalid, builtGraph).recipes.find(
        (entry) => entry.recipeId === recipe.id,
      )!;
      assert.equal(checked.successful, false);
      assert.ok(checked.failures.some((failure) =>
        failure.code === "selected-treatment-reification-continuity-binding" ||
        failure.code === "missing-identity-constraint"));
    });
  }

  await t.test("selected to repaired to final candidate identity", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
    const repair = recipe.steps.find(
      (step) => step.mechanismId === "repair.exact-source-admission",
    )!;
    repair.productBindings[0]!.equalityConstraints = repair.productBindings[0]!.equalityConstraints.filter(
      (constraint) => constraint.consumerValuePath !== "/selectedCandidateId",
    );
    const checked = validateAndAnalyzeBranchPlan(invalid, builtGraph).recipes.find(
      (entry) => entry.recipeId === recipe.id,
    )!;
    assert.equal(checked.successful, false);
    assert.ok(checked.failures.some((failure) => failure.code === "missing-identity-constraint"));
  });

  await t.test("selected treatment record cannot be minted after reification", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
    const repairInput = recipe.steps.find(
      (step) => step.mechanismId === "repair.winner-input-construction",
    )!;
    repairInput.productBindings[0]!.equalityConstraints =
      repairInput.productBindings[0]!.equalityConstraints.filter(
        (constraint) => constraint.consumerValuePath !== "/selectedTreatmentRecords",
      );
    const checked = validateAndAnalyzeBranchPlan(invalid, builtGraph).recipes.find(
      (entry) => entry.recipeId === recipe.id,
    )!;
    assert.equal(checked.successful, false);
    assert.ok(checked.failures.some((failure) => failure.code === "missing-identity-constraint"));
  });

  await t.test("selected record treatment, role, and gradient values cannot be minted during reification", () => {
    for (const valuePath of [
      "/selectedTreatmentRecord/treatmentId",
      "/selectedTreatmentRecord/roles/accent/color",
      "/selectedTreatmentRecord/gradient/stops",
    ]) {
      const invalid = structuredClone(authored);
      const reification = invalid.proposedMechanisms.find(
        (entry) => entry.id === "treatment.selected-treatment-role-reification",
      )!;
      reification.crossPortConstraints = reification.crossPortConstraints.filter(
        (constraint) => constraint.leftValuePath !== valuePath,
      );
      assert.throws(
        () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
        /selected-treatment-exact-member-reification/,
      );
    }
  });
});

test("emergency proof and admission reject disconnected domains, occupancy, and shortcuts", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  for (const path of [
    "/candidateDomainId",
    "/occupiedColorIds",
    "/nativeRasterId",
    "/repairedTreatmentId",
  ]) {
    await t.test(path, () => {
      const invalid = structuredClone(authored);
      const proof = invalid.proposedMechanisms.find(
        (entry) => entry.id === "selection.exact-source-infeasibility-proof",
      )!;
      proof.crossPortConstraints = proof.crossPortConstraints.filter(
        (constraint) => constraint.leftValuePath !== path,
      );
      assert.throws(
        () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
        /emergency-infeasibility-proof-contract/,
      );
    });
  }

  await t.test("proof predicate bypass", () => {
    const invalid = structuredClone(authored);
    const proof = invalid.proposedMechanisms.find(
      (entry) => entry.id === "selection.exact-source-infeasibility-proof",
    )!;
    proof.productOutputs[0]!.ports[0]!.constraints = proof.productOutputs[0]!.ports[0]!.constraints.filter(
      (constraint) => constraint.valuePath !== "/proof/ordinaryImpossibilityCertified",
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /emergency-infeasibility-proof-contract/,
    );
  });

  await t.test("proof native occupancy raster swap", () => {
    const invalid = structuredClone(authored);
    const proof = invalid.proposedMechanisms.find(
      (entry) => entry.id === "selection.exact-source-infeasibility-proof",
    )!;
    proof.crossPortConstraints = proof.crossPortConstraints.filter(
      (constraint) => !(
        constraint.leftValuePath === "/nativeRasterId" &&
        constraint.rightPortId === "native-color-occupancy"
      ),
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /emergency-infeasibility-proof-contract/,
    );
  });

  await t.test("emergency repaired raster swap", () => {
    const invalid = structuredClone(authored);
    const admission = invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.emergency-exact-source-admission",
    )!;
    admission.crossPortConstraints = admission.crossPortConstraints.filter(
      (constraint) => !(
        constraint.leftValuePath === "/nativeRasterId" &&
        constraint.rightPortId === "repaired-flat-treatment"
      ),
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /emergency-exact-source-admission-contract/,
    );
  });

  await t.test("recipe nativeRasterId swap", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = isolateRecipe(invalid, (entry) => entry.family === "emergency");
    const admission = recipe.steps.find(
      (step) => step.mechanismId === "publication.emergency-exact-source-admission",
    )!;
    const occupancy = admission.productBindings.find(
      (binding) => binding.consumerPortId === "native-color-occupancy",
    )!;
    occupancy.equalityConstraints = occupancy.equalityConstraints.filter(
      (constraint) => constraint.consumerValuePath !== "/nativeRasterId",
    );
    const checked = validateAndAnalyzeBranchPlan(invalid, builtGraph).recipes.find(
      (entry) => entry.recipeId === recipe.id,
    )!;
    assert.equal(checked.successful, false);
    assert.ok(checked.failures.some((failure) =>
      failure.code === "emergency-admission-membership-source-binding" ||
      failure.code === "missing-identity-constraint"));
  });

  await t.test("emergency materializer shortcut", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms.find(
      (entry) => entry.id === "publication.emergency-exact-source-admission",
    )!.productOutputs[0]!.ports[0]!.artifactTypeId = GOAL;
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /unauthorized-ui-palette-v3-success-output|emergency-exact-source-admission-contract/,
    );
  });
});

test("authored relational union and operation contracts fail closed", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);

  await t.test("missing occupancy membership predicate", () => {
    const invalid = structuredClone(authored);
    const admitted = invalid.proposedArtifacts.find((artifact) => artifact.id === FINAL_TREATMENT)!;
    admitted.valueInspection.relations = admitted.valueInspection.relations!.filter(
      (relation) => relation.id !== "background-occupied",
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /missing-admission-membership-relation/,
    );
  });

  await t.test("inconsistent membership relation kinds", () => {
    const invalid = structuredClone(authored);
    const admitted = invalid.proposedArtifacts.find((artifact) => artifact.id === FINAL_TREATMENT)!;
    const relation = admitted.valueInspection.relations!.find(
      (entry) => entry.id === "gradient-colors-occupied",
    )!;
    relation.subjectPath = "/roles/background/occupiedColorId";
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /inspection-relation-kind-mismatch/,
    );
  });

  await t.test("missing and inconsistent union variants", () => {
    const missing = structuredClone(authored);
    const missingArtifact = missing.proposedArtifacts.find((artifact) => artifact.id === FINAL_TREATMENT)!;
    missingArtifact.payloadShape.variants = missingArtifact.payloadShape.variants!.filter(
      (variant) => variant.id !== "gradient",
    );
    assert.throws(
      () => validateAndAnalyzeBranchPlan(missing, builtGraph),
      /invalid-admitted-treatment-union/,
    );

    const inconsistent = structuredClone(authored);
    const gradient = inconsistent.proposedArtifacts.find(
      (artifact) => artifact.id === FINAL_TREATMENT,
    )!.payloadShape.variants!.find((variant) => variant.id === "gradient")!;
    gradient.forbiddenPaths.push("/gradient/stops");
    assert.throws(
      () => validateAndAnalyzeBranchPlan(inconsistent, builtGraph),
      /invalid-admitted-treatment-union-variant/,
    );
  });

  await t.test("renamed shells without domain semantics", () => {
    const invalid = structuredClone(authored);
    const artifact = invalid.proposedArtifacts.find(
      (entry) => entry.id === "artifact.gradient.gradient-native-transition-path-construction.v1",
    )!;
    artifact.semanticRoles = ["mechanism.gradient.native-transition-path-construction", "identity.source"];
    for (const path of artifact.valueInspection.paths) path.semanticRole = "identity.source";
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /missing-artifact-domain-semantics/,
    );
  });

  await t.test("removing a required mechanism input breaks its recipe bindings", () => {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    isolateRecipe(invalid, (recipe) => recipe.steps.some(
      (step) => step.mechanismId === "gradient.native-transition-path-construction",
    ));
    invalid.proposedMechanisms.find(
      (mechanism) => mechanism.id === "gradient.native-transition-path-construction",
    )!.productInputs = [];
    const analysis = validateAndAnalyzeBranchPlan(invalid, builtGraph);
    assert.ok(
      analysis.recipes.some((recipe) =>
        recipe.failures.some((failure) => failure.code === "unknown-consumer-port"),
      ),
    );
  });

  await t.test("swapping a mechanism output onto an unrelated domain fails", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms.find(
      (mechanism) => mechanism.id === "selection.multicriteria-table-construction",
    )!.productOutputs[0]!.ports[0]!.artifactTypeId =
      "artifact.gradient.gradient-exact-path-election.v1";
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /mechanism-specific-computational-contract/,
    );
  });
});

test("native occupancy producers and admissions reject every required continuity relation", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored, analysis } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  assert.ok(analysis.recipes.every((recipe) => recipe.successful));

  type CrossPortConstraint = ProposedMechanism["crossPortConstraints"][number];
  const sameRelation = (left: CrossPortConstraint, right: CrossPortConstraint): boolean =>
    left.leftPortId === right.leftPortId &&
    left.leftValuePath === right.leftValuePath &&
    left.relation === right.relation &&
    left.rightPortId === right.rightPortId &&
    left.rightValuePath === right.rightValuePath;
  const rejectRelations = (
    mechanismId: string,
    select: (constraint: CrossPortConstraint) => boolean,
    expected: RegExp,
  ): void => {
    const source = authored.proposedMechanisms.find((mechanism) => mechanism.id === mechanismId)!;
    const required = source.crossPortConstraints.filter(select);
    assert.ok(required.length > 0, `${mechanismId} must declare selected occupancy relations`);
    for (const relation of required) {
      for (const mutation of ["remove", "mutate"] as const) {
        const invalid = structuredClone(authored);
        const mechanism = invalid.proposedMechanisms.find(
          (entry) => entry.id === mechanismId,
        )!;
        if (mutation === "remove") {
          mechanism.crossPortConstraints = mechanism.crossPortConstraints.filter(
            (candidate) => !sameRelation(candidate, relation),
          );
        } else {
          mechanism.crossPortConstraints.find(
            (candidate) => sameRelation(candidate, relation),
          )!.relation = "derived-from";
        }
        assert.throws(() => validateAndAnalyzeBranchPlan(invalid, builtGraph), expected);
      }
    }
  };

  rejectRelations(
    "evidence.native-color-occupancy-measurement",
    (constraint) =>
      constraint.leftPortId === "from-evidence-native-family-evidence-construction" &&
      constraint.rightPortId === "native-color-occupancy",
    /native-occupancy-producer-contract/,
  );
  rejectRelations(
    "repair.winner-input-construction",
    (constraint) => constraint.leftPortId === "native-color-occupancy",
    /repair-native-occupancy-continuity-contract/,
  );
  rejectRelations(
    "publication.ordinary-exact-source-admission",
    (constraint) =>
      constraint.leftPortId === "native-color-occupancy" ||
      constraint.rightPortId === "native-color-occupancy",
    /admission-must-preserve-complete-treatment-content|ordinary-admission-relational-membership-contract/,
  );
  rejectRelations(
    "publication.emergency-exact-source-admission",
    (constraint) =>
      constraint.leftPortId === "native-color-occupancy" ||
      constraint.rightPortId === "native-color-occupancy",
    /emergency-exact-source-admission-contract|emergency-admission-relational-membership-contract/,
  );
  rejectRelations(
    "publication.ordinary-exact-source-admission",
    (constraint) =>
      constraint.leftPortId === "repaired-treatment" &&
      constraint.leftValuePath === "/candidateDomainId" &&
      constraint.rightPortId === "admitted-treatment" &&
      constraint.rightValuePath === "/admission/candidateDomainId",
    /admission-must-preserve-complete-treatment-content/,
  );

  for (const valuePath of ["/sourceImageId", "/nativeRasterId", "/occupiedColorIds", "/treatmentVariant"]) {
    const invalid = structuredClone(authored);
    invalid.requireCompleteActiveWitnesses = false;
    const recipe = invalid.recipes.find((entry) => entry.family !== "emergency")!;
    const materializer = recipe.steps.find(
      (step) => step.mechanismId === "publication.ui-palette-v3-materializer",
    )!;
    materializer.productBindings[0]!.equalityConstraints =
      materializer.productBindings[0]!.equalityConstraints.filter(
        (constraint) => constraint.consumerValuePath !== valuePath,
      );
    const checked = validateAndAnalyzeBranchPlan(invalid, builtGraph).recipes.find(
      (entry) => entry.recipeId === recipe.id,
    )!;
    assert.ok(
      checked.failures.some(
        (failure) => failure.code === "materializer-admission-certificate-binding",
      ),
      valuePath,
    );
  }
});

test("branch analysis digest rejects a stale or tampered plan relationship", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { analysis } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const value = (await readStrictJson<BranchPlanManifest>(BRANCH_PLAN_PATH)).value;
  assert.doesNotThrow(() => assertBranchAnalysisPlanDigest(value, analysis));

  const changedPlan = structuredClone(value);
  changedPlan.recipes[0]!.description += " Changed after analysis generation.";
  assert.throws(
    () => assertBranchAnalysisPlanDigest(changedPlan, analysis),
    /Branch analysis plan digest mismatch/,
  );

  const tamperedAnalysis = structuredClone(analysis);
  tamperedAnalysis.branchPlanDigest.sha256 = `${
    analysis.branchPlanDigest.sha256.startsWith("0") ? "1" : "0"
  }${analysis.branchPlanDigest.sha256.slice(1)}`;
  assert.throws(
    () => assertBranchAnalysisPlanDigest(value, tamperedAnalysis),
    /Branch analysis plan digest mismatch/,
  );
});

test("branch analysis binds the exact canonical capability graph bytes", async () => {
  const graphPath = new URL("../data/capability-graph.json", import.meta.url);
  const [graphBytes, { graph: builtGraph }] = await Promise.all([
    readFile(graphPath),
    loadFixtures(),
  ]);
  const { analysis } = await loadValidateAndAnalyzeBranchPlan(
    builtGraph,
    graphBytes.toString("utf8"),
  );
  assert.deepEqual(analysis.capabilityGraphDigest, {
    algorithm: "sha256",
    basis: "canonical-json-utf8",
    sha256: sha256(graphBytes),
  });
  assert.doesNotThrow(() =>
    assertBranchAnalysisCapabilityGraphDigest(
      builtGraph,
      analysis,
      graphBytes.toString("utf8"),
    ));

  const changedGraph = structuredClone(builtGraph);
  changedGraph.artifactTypes[0]!.description += " Same-count graph mutation.";
  assert.equal(changedGraph.mechanisms.length, builtGraph.mechanisms.length);
  assert.equal(changedGraph.artifactTypes.length, builtGraph.artifactTypes.length);
  assert.throws(
    () => assertBranchAnalysisCapabilityGraphDigest(changedGraph, analysis),
    /capability graph digest mismatch/,
  );
  const plan = (await readStrictJson<BranchPlanManifest>(BRANCH_PLAN_PATH)).value;
  const changedAnalysis = validateAndAnalyzeBranchPlan(plan, changedGraph);
  assert.notEqual(
    changedAnalysis.capabilityGraphDigest.sha256,
    analysis.capabilityGraphDigest.sha256,
  );
});

test("workbench layers are explicit, closed, complete generated data", async (t) => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored, analysis } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const expectedLayerCounts = [
    ["raster", 0, 1],
    ["evidence", 16, 20],
    ["literature", 6, 0],
    ["saliency", 3, 1],
    ["field", 0, 7],
    ["candidate", 8, 4],
    ["role", 7, 3],
    ["color", 1, 0],
    ["gradient", 10, 7],
    ["treatment", 0, 4],
    ["search", 2, 0],
    ["selection", 10, 8],
    ["repair", 8, 3],
    ["publication", 0, 4],
  ] as const;
  assert.deepEqual(
    analysis.workbenchLayers.map((layer) => [
      layer.workbenchLayer,
      layer.currentMechanismIds.length,
      layer.proposedMechanismIds.length,
    ]),
    expectedLayerCounts,
  );
  assert.equal(analysis.workbenchMechanisms.length, 133);
  assert.equal(new Set(analysis.workbenchMechanisms.map((entry) => entry.mechanismId)).size, 133);

  await t.test("a declared layer change alters UI-facing analysis data", () => {
    const changed = structuredClone(authored);
    const entry = changed.currentMechanisms.find(
      (candidate) => candidate.mechanismId === "candidate.canonical-deduplication",
    )!;
    assert.equal(entry.workbenchLayer, "candidate");
    entry.workbenchLayer = "role";
    const changedAnalysis = validateAndAnalyzeBranchPlan(changed, builtGraph);
    assert.equal(
      changedAnalysis.workbenchMechanisms.find(
        (candidate) => candidate.mechanismId === entry.mechanismId,
      )?.workbenchLayer,
      "role",
    );
    assert.notDeepEqual(changedAnalysis.workbenchLayers, analysis.workbenchLayers);
    assert.deepEqual(changedAnalysis.recipeCounts, analysis.recipeCounts);
    assert.deepEqual(changedAnalysis.essentialWitnesses, analysis.essentialWitnesses);
  });

  await t.test("missing current assignment", () => {
    const invalid = structuredClone(authored);
    delete invalid.currentMechanisms.find((entry) => entry.disposition === "retained")!
      .workbenchLayer;
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /missing-workbench-layer-assignment/,
    );
  });

  await t.test("missing proposed assignment", () => {
    const invalid = structuredClone(authored);
    delete (invalid.proposedMechanisms[0] as Partial<ProposedMechanism>).workbenchLayer;
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /missing-workbench-layer-assignment/,
    );
  });

  await t.test("unknown assignment", () => {
    const invalid = structuredClone(authored);
    invalid.proposedMechanisms[0]!.workbenchLayer = "unknown" as never;
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /unknown-workbench-layer-assignment/,
    );
  });

  await t.test("duplicate assignment", () => {
    const invalid = structuredClone(authored);
    invalid.currentMechanisms.push(structuredClone(
      invalid.currentMechanisms.find((entry) => entry.disposition === "retained")!,
    ));
    assert.throws(
      () => validateAndAnalyzeBranchPlan(invalid, builtGraph),
      /duplicate-workbench-layer-assignment/,
    );
  });
});

test("branch generator check compares exact bytes and never writes on mismatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "palette-branch-generator-"));
  const planPath = join(directory, "branch-plan.json");
  const generatorPath = fileURLToPath(BRANCH_GENERATOR_PATH);
  try {
    await execFileAsync(process.execPath, [generatorPath, "--plan", planPath]);
    const generated = await readFile(planPath, "utf8");
    await execFileAsync(process.execPath, [generatorPath, "--plan", planPath, "--check"]);

    const stale = `${generated}\n`;
    await writeFile(planPath, stale, "utf8");
    await assert.rejects(
      execFileAsync(process.execPath, [generatorPath, "--plan", planPath, "--check"]),
      /branch-plan\.json is stale/,
    );
    assert.equal(await readFile(planPath, "utf8"), stale);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("branch schema accepts the independent explicit contract without fixed snapshot counts", async () => {
  const schema = (await readStrictJson<Record<string, unknown>>(BRANCH_SCHEMA_PATH)).value;
  const validate = new Ajv2020({ strict: true, strictRequired: false }).compile(schema);
  const value = manifest();
  assert.equal(validate(value), true, JSON.stringify(validate.errors));

  const moduleOnly = manifest();
  moduleOnly.recipeModules = [{
    id: "module.direct",
    steps: structuredClone(moduleOnly.recipes[0]!.steps),
  }];
  moduleOnly.recipes[0]!.moduleRefs = ["module.direct"];
  moduleOnly.recipes[0]!.steps = [];
  assert.equal(validate(moduleOnly), true, JSON.stringify(validate.errors));

  const empty = manifest();
  empty.recipes[0]!.steps = [];
  assert.equal(validate(empty), false, "recipes must contain inline or module-provided steps");

  const { graph: builtGraph } = await loadFixtures();
  const { manifest: authored } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const invalid = structuredClone(authored);
  invalid.proposedArtifacts.find(
    (artifact) => artifact.id === FINAL_TREATMENT,
  )!.valueInspection.relations![0]!.subjectPath = "";
  assert.equal(validate(invalid), false, "empty relational paths must fail schema validation");
});

test("generated branch research report names exact mechanisms, ports, routes, and researched failures", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: value, analysis, markdown } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const reportSection = (heading: string, nextHeading: string): string => {
    const start = markdown.indexOf(heading);
    const end = markdown.indexOf(nextHeading, start + heading.length);
    assert.notEqual(start, -1, heading);
    assert.notEqual(end, -1, nextHeading);
    return markdown.slice(start, end);
  };

  assert.match(
    markdown,
    /A type-closed planned recipe means all declared product ports connect on paper; code and evidence do not yet exist\./,
  );
  for (const countLine of [
    "Current retained mechanisms: 71.",
    "Proposed mechanisms to build: 62.",
    "Condemned current formulations: 9.",
    "Total current sidecar/inspector mechanisms: 69.",
    "Type-closed planned recipes: 88.",
    "Execution-ready recipes: 0.",
  ]) {
    assert.ok(markdown.includes(countLine), countLine);
  }
  assert.ok(markdown.includes(
    `Exact canonical capability-graph JSON SHA-256: \`${analysis.capabilityGraphDigest.sha256}\`.`,
  ));

  const layers = reportSection("## Workbench Layers", "## 62 Missing Mechanisms To Build");
  const layerRows = layers.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(layerRows.length, 14);
  for (const layer of analysis.workbenchLayers) {
    const row = layerRows.find((line) => line.startsWith(`| \`${layer.workbenchLayer}\` |`));
    assert.ok(row, layer.workbenchLayer);
    assert.ok(row.includes(`| ${layer.currentMechanismIds.length} | ${layer.proposedMechanismIds.length} |`));
  }

  const missing = reportSection(
    "## 62 Missing Mechanisms To Build",
    "## Exact Missing Handoffs",
  );
  assert.ok(missing.includes(
    "| Missing mechanism | Workbench layer | Planned product inputs (group; port -> type [cardinality]) | Operation | Success outputs (branch; port -> type [cardinality]) | First downstream product consumer(s) | Implementation status |",
  ));
  const missingRows = missing.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(missingRows.length, 62);
  for (const mechanism of value.proposedMechanisms) {
    const row = missingRows.find((line) => line.startsWith(`| \`${mechanism.id}\` |`));
    assert.ok(row, `${mechanism.id} missing-mechanism row`);
    assert.ok(row.includes(`| ${mechanism.workbenchLayer} |`), `${mechanism.id} layer`);
    assert.ok(row.includes(mechanism.operation), `${mechanism.id} operation`);
    assert.ok(row.includes("Proposed; implementation unavailable"), `${mechanism.id} status`);
    for (const group of mechanism.productInputs) {
      assert.ok(row.includes(`group \`${group.id}\` [${group.mode}]`), `${mechanism.id}:${group.id}`);
      for (const port of group.ports) {
        assert.ok(
          row.includes(`\`${port.id}\` -> \`${port.artifactTypeId}\` [${port.cardinality}]`),
          `${mechanism.id}:${port.id}`,
        );
      }
    }
    for (const port of mechanism.productOutputs.find((branch) => branch.id === "success")!.ports) {
      assert.ok(
        row.includes(`\`${port.id}\` -> \`${port.artifactTypeId}\` [${port.cardinality}]`),
        `${mechanism.id}:success:${port.id}`,
      );
    }
    assert.match(row, / -> `artifact\.[^`]+` -> /, `${mechanism.id} downstream edge`);
  }

  const handoffs = reportSection("## Exact Missing Handoffs", "## Type-Closed Planned Recipe Routes");
  assert.ok(handoffs.includes(
    "| Product producer output -> proposed input | Missing mechanism operation | Proposed output -> first downstream product input |",
  ));
  const handoffRows = handoffs.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(handoffRows.length, 62);
  for (const mechanism of value.proposedMechanisms) {
    assert.ok(
      handoffRows.some((row) => row.includes(`| \`${mechanism.id}\`: ${mechanism.operation} |`)),
      `${mechanism.id} missing handoff`,
    );
  }
  assert.doesNotMatch(
    handoffs,
    /artifact\.(?:configuration|custody|review|report)\.|fixture\.|visualization\.|human-score\./,
  );

  const routes = reportSection("## Type-Closed Planned Recipe Routes", "## 133 Active Mechanisms");
  assert.equal((routes.match(/<summary><code>/g) ?? []).length, 88);
  assert.match(routes, /None is default, preferred, selected, or execution-ready\./);
  assert.match(routes, /## Interchangeability Slots/);
  for (const recipe of analysis.recipes) {
    const summary = `<summary><code>${recipe.recipeId}</code> (${recipe.family})</summary>`;
    const start = routes.indexOf(summary);
    const end = routes.indexOf("</details>", start);
    assert.notEqual(start, -1, `${recipe.recipeId} summary`);
    assert.notEqual(end, -1, `${recipe.recipeId} details`);
    const details = routes.slice(start, end);
    assert.ok(details.includes("Essential by removal test:"));
    assert.ok(details.includes("Explicit composition tests:"));
    assert.ok(details.includes("Analyzer-derived clean substitutions:"));
    assert.ok(details.includes("Ordered route sequence:"));
    for (const mechanismId of recipe.essentialMechanismIds) {
      assert.ok(details.includes(`\`${mechanismId}\``), `${recipe.recipeId}:${mechanismId}`);
    }
    for (const [index, step] of recipe.expandedSteps.entries()) {
      assert.ok(
        details.includes(
          `${index + 1}. \`${step.mechanismId}\` (instance \`${step.instanceId}\`; branch \`${step.selectedOutputBranch}\`)`,
        ),
        `${recipe.recipeId}:${step.instanceId}`,
      );
    }
  }

  const active = reportSection("## 133 Active Mechanisms", "## Demoted Product Mechanisms");
  assert.ok(active.includes(
    "| Mechanism | Origin | Workbench layer | Implementation status | Planned product inputs (group; port -> type [cardinality]) | Operation | Product outputs (branch; port -> type [cardinality]) | First downstream product consumer(s) | Essential witness recipes | Planned fixture | Planned visualization | Planned human score |",
  ));
  const activeRows = active.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(activeRows.length, 133);
  for (const entry of analysis.effectiveDispositions.filter(
    (candidate) =>
      candidate.effectiveDisposition === "retained" || candidate.effectiveDisposition === "proposed",
  )) {
    const row = activeRows.find((line) => line.startsWith(`| \`${entry.mechanismId}\` |`));
    assert.ok(row, `${entry.mechanismId} active row`);
    assert.ok(
      row.includes(`| ${entry.origin === "current" ? "Existing" : "Proposed"} |`),
      `${entry.mechanismId} origin`,
    );
    assert.ok(row.includes("implementation unavailable") || row.includes("Existing repository state:"));
    assert.ok(row.includes("(planned, unavailable)"), `${entry.mechanismId} sidecar status`);
    assert.match(row, / -> `artifact\.[^`]+` -> /, `${entry.mechanismId} downstream edge`);
  }

  const demoted = reportSection("## Demoted Product Mechanisms", "## Condemned Formulations");
  const exactDemotionReasons = new Map([
    [
      "raster.transparency-policy",
      "Demoted because refusal and matte handling are non-palette historical behavior; successful product flow starts from the replacement decoder's explicit opacity decision.",
    ],
    [
      "validation.contract-invariants",
      "Demoted because it verifies the completed contract after the product goal rather than transforming a product toward that goal.",
    ],
    [
      "publication.exact-native-pixel",
      "Demoted because its current contract records publication custody only; proposed exact native-pixel admission replaces the missing product admission handoff.",
    ],
  ]);
  const demotedRows = demoted.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(demotedRows.length, 3);
  for (const [mechanismId, reason] of exactDemotionReasons) {
    const row = demotedRows.find((line) => line.startsWith(`| \`${mechanismId}\` |`));
    assert.ok(row?.includes(reason), mechanismId);
  }

  const condemned = reportSection("## Condemned Formulations", "## Unrouted Active Mechanisms");
  assert.ok(condemned.includes(
    "| Mechanism | Origin | Exact current inputs | Exact current outputs | Researched failure | Repository source |",
  ));
  const condemnedEntries = value.currentMechanisms.filter((entry) => entry.disposition === "condemned");
  const condemnedRows = condemned.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(condemnedRows.length, 9);
  assert.equal(new Set(condemnedEntries.map((entry) => entry.reason)).size, 9);
  assert.equal(new Set(condemnedEntries.flatMap((entry) => entry.evidenceRefs ?? [])).size, 9);
  for (const entry of condemnedEntries) {
    const mechanism = builtGraph.mechanisms.find((candidate) => candidate.id === entry.mechanismId)!;
    const row = condemnedRows.find((line) => line.startsWith(`| \`${entry.mechanismId}\` |`));
    assert.ok(row, `${entry.mechanismId} condemned row`);
    assert.ok(entry.evidenceRefs?.includes(`${mechanism.source.path}:${mechanism.source.headingLine}`));
    assert.ok(row.includes(entry.reason), `${entry.mechanismId} reason`);
    assert.ok(row.includes(`\`${mechanism.source.path}:${mechanism.source.headingLine}\``));
    for (const port of mechanism.inputPorts) {
      assert.ok(row.includes(`\`${port.id}\` -> \`${port.artifactTypeId}\``), `${entry.mechanismId}:${port.id}`);
    }
    for (const port of mechanism.outputPorts) {
      assert.ok(row.includes(`\`${port.id}\` -> \`${port.artifactTypeId}\``), `${entry.mechanismId}:${port.id}`);
    }
  }
  for (const researchedFailure of [
    "invalid predecode opacity",
    "224px discovery copy",
    "neither a complete producer side nor a product sink",
    "legacy saliency/cluster dependency",
    "Independent role-by-role election",
    "diagnostic-only",
  ]) {
    assert.ok(condemned.includes(researchedFailure), researchedFailure);
  }

  assert.doesNotMatch(
    markdown,
    /Known product inputs|semantic audit|consumed typed-step witnesses|planned-connected|successful complete recipe|planned-unavailable evidence/i,
  );
});

test("authored branch plan has the corrected complete registry and independent route witnesses", async () => {
  const { graph: builtGraph } = await loadFixtures();
  const { manifest: value, analysis } = await loadValidateAndAnalyzeBranchPlan(builtGraph);
  const condemned = [
    "candidate.band-local-endpoints",
    "evidence.area-integral-extent-substrate",
    "evidence.legacy-structural-text-heuristics",
    "evidence.slic-region-graph",
    "gradient.spatial-midpoint-band",
    "gradient.transition-stage-midpoint",
    "gradient.transition-support-and-flat-fallback",
    "raster.native-opaque-decode",
    "role.legacy-independent-election",
  ].sort();
  const demoted = [
    "publication.exact-native-pixel",
    "raster.transparency-policy",
    "validation.contract-invariants",
  ].sort();
  const proposed = [
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
  ].sort();

  assert.equal(analysis.inventoryCounts.currentRetained, 71);
  assert.equal(analysis.inventoryCounts.currentCondemned, 9);
  assert.equal(analysis.inventoryCounts.currentDemoted, 3);
  assert.equal(analysis.inventoryCounts.existingSidecars, 66);
  assert.equal(analysis.inventoryCounts.totalSidecarInspectors, 69);
  assert.equal(analysis.inventoryCounts.proposedMechanisms, 62);
  assert.deepEqual(value.currentMechanisms.filter((entry) => entry.disposition === "condemned").map((entry) => entry.mechanismId).sort(), condemned);
  assert.deepEqual(value.currentMechanisms.filter((entry) => entry.disposition === "sidecar" && demoted.includes(entry.mechanismId)).map((entry) => entry.mechanismId).sort(), demoted);
  assert.deepEqual(value.proposedMechanisms.map((entry) => entry.id).sort(), proposed);
  assert.deepEqual(value.artifactTypeAliases, {});
  assert.equal(value.recipes.every((recipe) => recipe.preferred === false), true);
  assert.ok(new Set(value.recipes.map((recipe) => recipe.family)).size >= 10);
  assert.deepEqual(analysis.recipeCounts, { declared: 88, successful: 88, executionReady: 0 });
  assert.equal(analysis.recipeCounts.executionReady, 0);
  assert.equal(analysis.inventoryCounts.fullPlannedRegistry, 211);
  assert.equal(analysis.plannedConnected.currentMechanismIds.length, 71);
  assert.equal(analysis.plannedConnected.proposedMechanismIds.length, 62);
  assert.deepEqual(analysis.unresolvedActiveContracts, []);
  assert.equal(
    analysis.effectiveDispositions.filter((entry) => entry.witnessRecipeIds.length > 0).length,
    133,
  );
  assert.equal(analysis.essentialWitnesses.length, 133);
  assert.ok(analysis.essentialWitnesses.every((entry) => entry.recipeIds.length > 0));
  assert.equal(analysis.interchangeabilitySlots.length, 10);
  assert.ok(analysis.interchangeabilitySlots.every((slot) =>
    slot.mechanismIds.every((mechanismId) =>
      slot.comparisons.some((comparison) =>
        comparison.leftMechanismId === mechanismId || comparison.rightMechanismId === mechanismId,
      ),
    ),
  ));
  assert.equal(analysis.effectiveDispositions.filter((entry) => entry.effectiveDisposition === "unrouted").length, 0);
  assert.ok(analysis.recipes.every((recipe) =>
    recipe.successful &&
    recipe.essentialMechanismIds.length >= 4 &&
    recipe.essentialMechanismIds.every((mechanismId) =>
      recipe.witnessedMechanismIds.includes(mechanismId),
    )
  ));
  const decode = value.proposedMechanisms.find((entry) => entry.id === "raster.native-artwork-decode")!;
  const nativeOccupancy = value.proposedMechanisms.find(
    (entry) => entry.id === "evidence.native-color-occupancy-measurement",
  )!;
  assert.deepEqual(decode.productOutputs.find((branch) => branch.id === "success")!.ports, [
    port(
      "native-raster",
      "artifact.raster.native-srgb8-opaque.v1",
      "exactly-one",
      [{ valuePath: "/allPixelsOpaque", comparator: "equals", value: true }],
      ["/sourceImageId", "/nativeRasterId"],
    ),
  ]);
  assert.ok(
    nativeOccupancy.productOutputs
      .find((branch) => branch.id === "success")!
      .ports.some(
        (entry) =>
          entry.id === "native-color-occupancy" &&
          entry.artifactTypeId === "artifact.measurement.native-color-occupancy.v1" &&
          entry.cardinality === "exactly-one",
      ),
  );
  assert.ok(
    value.proposedArtifacts
      .filter((artifact) => artifact.kind === "product")
      .every((artifact) => artifact.payloadShape.fields.length > 0 && artifact.valueInspection.paths.length > 0),
  );
  assert.equal(
    value.proposedArtifacts.some((artifact) => artifact.id.startsWith("artifact.plan.route.")),
    false,
  );
  assert.ok(new Set(analysis.recipes.map((recipe) => recipe.family)).size >= 10);
  const activeMechanisms = new Set([
    ...analysis.plannedConnected.currentMechanismIds,
    ...analysis.plannedConnected.proposedMechanismIds,
  ]);
  const sharedMechanisms = new Set([
    "raster.native-artwork-decode",
    "candidate.archetypoid-observation-construction",
    "evidence.native-raster-primitives",
    "evidence.native-pixel-graph-construction",
    "evidence.native-edge-dissimilarity-measurement",
    "evidence.native-component-local-measurement",
    "evidence.native-family-evidence-construction",
    "evidence.salient-mark-measurement",
    "field.domain-evidence-election",
    "field.accepted-domain-measurement",
    "saliency.source-color-proposal-extraction",
    "role.artwork-family-relation-measurement",
    "role.treatment-swap-legality-measurement",
    "role.text-cue-measurement",
    "candidate.native-witness-redemption",
    "evidence.native-color-occupancy-measurement",
    "publication.exact-native-pixel-admission",
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
    "repair.exact-source-admission",
    "repair.result-role-reification",
    "publication.ordinary-exact-source-admission",
    "publication.ui-palette-v3-materializer",
  ]);
  for (const mechanismId of activeMechanisms) {
    if (sharedMechanisms.has(mechanismId)) continue;
    const witnesses = analysis.recipes.filter((recipe) => recipe.essentialMechanismIds.includes(mechanismId));
    assert.ok(witnesses.length >= 1, `${mechanismId} must have a route witness`);
    assert.ok(
      analysis.recipes.some((recipe) => !recipe.essentialMechanismIds.includes(mechanismId)),
      `${mechanismId} must have a peer-omitting route`,
    );
  }
  assert.equal(value.proposedMechanisms.every((entry) => entry.sidecars.availability === "planned-unavailable" && !entry.readiness.implementationAvailable && !entry.readiness.fixtureAvailable && !entry.readiness.visualizationAvailable && !entry.readiness.humanScoreAvailable), true);
  assert.ok(value.fixedConfigurations.length > 0);
  assert.ok(value.fixedConfigurations.every((config) => !config.available));
  assert.ok(value.readinessProviders.length > 0);
  assert.ok(value.readinessProviders.every((provider) => !provider.available));
  const materializer = value.proposedMechanisms.find((entry) => entry.id === "publication.ui-palette-v3-materializer")!;
  const admission = value.proposedMechanisms.find((entry) => entry.id === "publication.ordinary-exact-source-admission")!;
  const admittedTreatment = value.proposedArtifacts.find((artifact) => artifact.id === "artifact.treatment.admitted-final.v1")!;
  assert.deepEqual(
    admittedTreatment.payloadShape.fields.map((field) => field.valuePath),
    ["/sourceFingerprint", ...ADMITTED_TREATMENT_PATHS, ...EMERGENCY_ADMISSION_PATHS],
  );
  assert.deepEqual(
    admittedTreatment.valueInspection.paths.map((entry) => entry.valuePath),
    ["/sourceFingerprint", ...ADMITTED_TREATMENT_PATHS, ...EMERGENCY_ADMISSION_PATHS],
  );
  assert.deepEqual(admission.productInputs[0]!.ports[0]!.identityPaths, REPAIRED_TREATMENT_ADMISSION_PATHS);
  assert.deepEqual(admission.productOutputs[0]!.ports[0]!.identityPaths, ADMITTED_TREATMENT_PATHS);
  assert.deepEqual(admission.productInputs[0]!.ports[0]!.constraints, [{ valuePath: "/treatmentKind", comparator: "in", value: ["flat", "gradient"] }]);
  assert.ok(value.recipes.every((recipe) => recipe.steps.some((step) => step.instanceId === "materialize")));
  const admittedConstraints: BranchConstraint[] = [
    { valuePath: "/treatmentKind", comparator: "in", value: ["flat", "gradient"] },
    { valuePath: "/treatmentVariant", comparator: "in", value: ["flat", "gradient", "emergency-flat"] },
    { valuePath: "/admission/kind", comparator: "in", value: ["ordinary", "emergency-flat"] },
    { valuePath: "/admission/allRequiredColorsOccupied", comparator: "equals", value: true },
  ];
  assert.deepEqual(materializer.productInputs, [{ id: "admitted-final-treatment", mode: "all", ports: [
    port("admitted-treatment", "artifact.treatment.admitted-final.v1", "exactly-one", admittedConstraints, [...ADMITTED_TREATMENT_PATHS]),
  ] }]);
  assert.deepEqual(materializer.productOutputs[0]!.ports, [
    port("ui-palette", GOAL, "exactly-one", [
      { valuePath: "/contractVersion", comparator: "equals", value: "v3-contract-0.1.0" },
      ...["background", "surface", "foreground", "accent"].flatMap((role) => [
        { valuePath: `/roles/${role}/rgb`, comparator: "count-equals", value: 3 } as BranchConstraint,
        { valuePath: `/roles/${role}/hex`, comparator: "matches", value: "^#[0-9a-f]{6}$" } as BranchConstraint,
      ]),
    ], [...V3_PALETTE_REQUIRED_PATHS]),
  ]);
  const candidatePool = value.proposedMechanisms.find(
    (entry) => entry.id === "candidate.native-witness-redemption",
  )!;
  const poolOutput = candidatePool.productOutputs.find((branch) => branch.id === "success")!.ports[0]!;
  assert.equal(poolOutput.identityPaths.includes("/treatmentId"), false);
  const progressiveStageIds = [
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
    "repair.exact-source-admission",
    "repair.result-role-reification",
  ];
  for (const recipe of value.recipes) {
    const indexes = progressiveStageIds.map((mechanismId) =>
      recipe.steps.findIndex((step) => step.mechanismId === mechanismId),
    ).filter((index) => index >= 0);
    assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right), recipe.id);
  }
  const completeEmitterIds = new Set([
    "treatment.selected-treatment-role-reification",
    "repair.winner-input-construction",
    "repair.exact-source-admission",
    "repair.result-role-reification",
    "publication.ordinary-exact-source-admission",
    "publication.emergency-exact-source-admission",
    "publication.ui-palette-v3-materializer",
  ]);
  assert.equal(
    value.proposedMechanisms.every((mechanism) =>
      completeEmitterIds.has(mechanism.id) ||
      mechanism.productOutputs.flatMap((branch) => branch.ports).every(
        (entry) => PRODUCT_TREATMENT_CONTENT_PATHS.filter((path) => entry.identityPaths.includes(path)).length < PRODUCT_TREATMENT_CONTENT_PATHS.length - 2,
      ),
    ),
    true,
  );
  const infeasibilityProof = value.proposedMechanisms.find(
    (entry) => entry.id === "selection.exact-source-infeasibility-proof",
  )!;
  assert.deepEqual(
    infeasibilityProof.productInputs.flatMap((group) => group.ports).map((entry) => entry.artifactTypeId).sort(),
    [
      "artifact.measurement.native-color-occupancy.v1",
      "artifact.treatment.repaired-source-ordinary.v1",
      "artifact.treatment.swap-legal-candidate-domain.v1",
    ].sort(),
  );
  const emergencyAdmission = value.proposedMechanisms.find(
    (entry) => entry.id === "publication.emergency-exact-source-admission",
  )!;
  assert.deepEqual(
    emergencyAdmission.productInputs.flatMap((group) => group.ports).map((entry) => entry.artifactTypeId).sort(),
    [
      "artifact.proof.exact-source-selection-infeasibility.v1",
      "artifact.measurement.native-color-occupancy.v1",
      "artifact.treatment.repaired-source-ordinary.v1",
    ].sort(),
  );
  assert.equal(value.recipes.every((recipe) => recipe.postGoalSidecars.length === 0), true);
  const recipeConfigRefs = new Set(value.recipes.flatMap((recipe) => recipe.steps.flatMap((step) => step.readinessBindings.fixedConfigRefs)));
  assert.equal(value.fixedConfigurations.every((config) => recipeConfigRefs.has(config.id)), true);
  assert.equal(value.proposedMechanisms.every((entry) => entry.readiness.fixedConfigRefs.every((config) => value.fixedConfigurations.some((registered) => registered.id === config))), true);
  assert.equal(analysis.recipes.every((recipe) => recipe.executionReadiness.failures.every((failure) => failure.code !== "unexpected-fixed-config")), true);
  assert.equal(analysis.recipes.every((recipe) => recipe.executionReadiness.failures.every((failure) => failure.code !== "unknown-fixed-config" && failure.code !== "unknown-readiness-provider")), true);
  assert.equal(analysis.recipes.every((recipe) => recipe.executionReadiness.failures.every((failure) => failure.code !== "readiness-input-cardinality")), true);
  const materializerRecipes = value.recipes.filter((recipe) => recipe.goalBinding.producerInstanceId === "materialize");
  assert.equal(materializerRecipes.every((recipe) => {
    const binding = recipe.steps.find((step) => step.instanceId === "materialize")!.productBindings[0]!;
    return binding.producerPortId === "admitted-treatment" &&
      binding.equalityConstraints.length === ADMITTED_TREATMENT_PATHS.length &&
      binding.equalityConstraints.every((entry) => entry.producerValuePath === entry.consumerValuePath && ADMITTED_TREATMENT_PATHS.includes(entry.consumerValuePath as typeof ADMITTED_TREATMENT_PATHS[number]));
  }), true);
});
