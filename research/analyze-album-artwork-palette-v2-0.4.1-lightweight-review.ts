import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Quality =
  | "strong"
  | "acceptable"
  | "weak-fallback"
  | "unacceptable"
  | "uncertain";

interface ReviewCase {
  caseId: string;
  sourceSha256: string;
  winnerTreatmentId: string;
  alternatives: Array<{ id: string }>;
}

interface ReviewManifest {
  schemaVersion: number;
  reviewVersion: string;
  manifestId: string;
  candidateVersion: string;
  implementationHash: string;
  scientificSha256: string;
  cases: ReviewCase[];
}

interface FeedbackEntry {
  caseId: string;
  sourceSha256: string;
  treatmentId: string;
  quality: Quality;
  comment: string;
  submittedAt: string;
}

interface ReviewFeedback {
  schemaVersion: number;
  reviewVersion: string;
  manifestId: string;
  entries: FeedbackEntry[];
}

interface FailureClassDefinition {
  failureClass: string;
  description: string;
  caseIds: string[];
  nextEvidenceNeed: string;
}

const root = process.cwd();
const experimentDirectory = path.join(
  root,
  "research/data/experiments/album-artwork-palette-v2-0.4.1-development",
);
const manifestPath = path.join(experimentDirectory, "review-manifest.json");
const feedbackPath = path.join(
  root,
  "research/data/album-artwork-palette-v2-0.4.1-lightweight-feedback.json",
);
const targetedAnalysisPath = path.join(
  experimentDirectory,
  "targeted-review-analysis.json",
);
const outputPath = path.join(
  experimentDirectory,
  "lightweight-review-analysis.json",
);

const qualityValues: Quality[] = [
  "strong",
  "acceptable",
  "weak-fallback",
  "unacceptable",
  "uncertain",
];
const failureClassDefinitions: FailureClassDefinition[] = [
  {
    failureClass: "field-identity-and-gradient-availability",
    description:
      "The selected field can be too bland or omit a visually important chromatic progression.",
    caseIds: [
      "development-03",
      "development-06",
      "development-15",
      "development-16",
      "development-22",
    ],
    nextEvidenceNeed:
      "Improve chromatic field-identity and progression evidence without adding image-specific gradient rules.",
  },
  {
    failureClass: "foreground-polarity-and-typography-evidence",
    description:
      "The foreground role can choose the wrong light/dark polarity relative to prominent title or text evidence.",
    caseIds: [
      "development-03",
      "development-04",
      "development-26",
    ],
    nextEvidenceNeed:
      "Represent repeated high-contrast typography-like regions separately from generic contrast scoring.",
  },
  {
    failureClass: "optional-role-coverage-and-distinction",
    description:
      "Surface or accent roles can be omitted, collapsed, or insufficiently specific despite visible subordinate artwork structure.",
    caseIds: [
      "development-04",
      "development-16",
      "development-18",
    ],
    nextEvidenceNeed:
      "Strengthen earned optional-role evidence and role distinction while retaining collapse when no distinct region exists.",
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortedRecord<T extends string>(
  values: readonly T[],
  entries: FeedbackEntry[],
  select: (entry: FeedbackEntry) => T,
): Record<T, number> {
  return Object.fromEntries(
    values.map((value) => [
      value,
      entries.filter((entry) => select(entry) === value).length,
    ]),
  ) as Record<T, number>;
}

async function main(): Promise<void> {
  const [manifestRaw, feedbackRaw, targetedAnalysisRaw] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(feedbackPath, "utf8"),
    readFile(targetedAnalysisPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw) as ReviewManifest;
  const feedback = JSON.parse(feedbackRaw) as ReviewFeedback;
  const targetedAnalysis = JSON.parse(targetedAnalysisRaw) as {
    mechanismGate: { pass: boolean };
    phaseDisposition: string;
  };

  assert(
    feedback.reviewVersion === manifest.reviewVersion,
    "Feedback review version does not match the manifest.",
  );
  assert(
    feedback.manifestId === manifest.manifestId,
    "Feedback manifest ID does not match the manifest.",
  );
  assert(
    feedback.entries.length === manifest.cases.length,
    "Feedback must cover every review case exactly once.",
  );

  const caseById = new Map(
    manifest.cases.map((reviewCase) => [reviewCase.caseId, reviewCase]),
  );
  const seenCaseIds = new Set<string>();
  for (const entry of feedback.entries) {
    const reviewCase = caseById.get(entry.caseId);
    assert(reviewCase, `Unknown feedback case: ${entry.caseId}`);
    assert(!seenCaseIds.has(entry.caseId), `Duplicate feedback case: ${entry.caseId}`);
    seenCaseIds.add(entry.caseId);
    assert(
      qualityValues.includes(entry.quality),
      `Invalid quality for ${entry.caseId}`,
    );
    assert(
      Number.isFinite(Date.parse(entry.submittedAt)),
      `Invalid submission timestamp for ${entry.caseId}`,
    );
    assert(
      entry.sourceSha256 === reviewCase.sourceSha256,
      `Source identity does not match the manifest for ${entry.caseId}`,
    );
    assert(
      entry.treatmentId === reviewCase.winnerTreatmentId &&
        reviewCase.alternatives.some(({ id }) => id === entry.treatmentId),
      `Treatment does not match the frozen winner for ${entry.caseId}`,
    );
  }

  const qualityCounts = sortedRecord(
    qualityValues,
    feedback.entries,
    (entry) => entry.quality,
  );
  const positiveCount = qualityCounts.strong + qualityCounts.acceptable;
  const weakOrWorseCount =
    qualityCounts["weak-fallback"] + qualityCounts.unacceptable;

  const failureClasses = failureClassDefinitions.map((definition) => {
    const evidence = definition.caseIds.map((caseId) => {
      const entry = feedback.entries.find((candidate) => candidate.caseId === caseId);
      assert(entry, `Failure-class evidence case is absent: ${caseId}`);
      return {
        caseId,
        absoluteQuality: entry.quality,
        comment: entry.comment,
      };
    });
    return {
      ...definition,
      caseCount: evidence.length,
      weakOrWorseCount: evidence.filter(
        (item) =>
          item.absoluteQuality === "weak-fallback" ||
          item.absoluteQuality === "unacceptable",
      ).length,
      evidence,
    };
  });

  assert(
    targetedAnalysis.mechanismGate.pass,
    "The prerequisite targeted gate did not pass.",
  );

  const analysis = {
    analysisVersion: "album-artwork-palette-v2-lightweight-analysis-v1",
    analyzedAt: new Date().toISOString(),
    implementationVersion: manifest.candidateVersion,
    implementationHash: manifest.implementationHash,
    scientificConfigHash: manifest.scientificSha256,
    manifestId: manifest.manifestId,
    reviewVersion: manifest.reviewVersion,
    reviewedAt: feedback.entries.reduce(
      (latest, entry) => (entry.submittedAt > latest ? entry.submittedAt : latest),
      "",
    ),
    sourceClass: "bounded-development-only",
    freshSampleOpened: false,
    inputHashes: {
      manifestSha256: sha256(manifestRaw),
      feedbackSha256: sha256(feedbackRaw),
      targetedAnalysisSha256: sha256(targetedAnalysisRaw),
    },
    validation: {
      valid: true,
      expectedCaseCount: manifest.cases.length,
      reviewedCaseCount: feedback.entries.length,
      uniqueCaseCount: seenCaseIds.size,
      nonEmptyCommentCount: feedback.entries.filter(
        (entry) => entry.comment.trim().length > 0,
      ).length,
      optionalCommentsPreservedVerbatim: true,
      sourceIdentitiesMatchManifest: true,
      treatmentsMatchFrozenWinners: true,
    },
    distribution: {
      qualityCounts,
      positiveCount,
      weakOrWorseCount,
      positiveShare: positiveCount / feedback.entries.length,
      weakOrWorseShare: weakOrWorseCount / feedback.entries.length,
    },
    prerequisiteTargetedGate: {
      pass: targetedAnalysis.mechanismGate.pass,
      disposition: targetedAnalysis.phaseDisposition,
    },
    failureClasses,
    caseResults: feedback.entries.map((entry) => ({
      caseId: entry.caseId,
      sourceSha256: entry.sourceSha256,
      treatmentId: entry.treatmentId,
      absoluteQuality: entry.quality,
      submittedAt: entry.submittedAt,
      comment: entry.comment,
    })),
    decision: {
      phase3EvidenceCollectionComplete: true,
      completeTopTreatmentsCommonlyStrongOrAcceptable: positiveCount > weakOrWorseCount,
      freezeForPhase4: false,
      openFreshSample: false,
      disposition: "continue-bounded-development-do-not-open-fresh",
      rationale: [
        `${positiveCount}/${feedback.entries.length} deterministic tops are strong or acceptable, demonstrating substantial product progress.`,
        `${weakOrWorseCount}/${feedback.entries.length} deterministic tops remain weak-fallback or unacceptable, so the broad top-one result is not yet reliable enough to freeze.`,
        "Verbatim comments expose repeated development-only failure classes in field identity, foreground polarity, and optional role coverage.",
        "The sealed fresh sample should remain unopened until those classes receive a bounded architectural response and another targeted quality check.",
      ],
      nextBoundedWork: [
        "Improve field identity and gradient availability from general chromatic progression evidence.",
        "Add typography-sensitive evidence for foreground polarity without weakening contrast safety.",
        "Improve earned surface and accent coverage while preserving justified role collapse.",
      ],
    },
  };

  await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath,
        distribution: analysis.distribution,
        disposition: analysis.decision.disposition,
      },
      null,
      2,
    ),
  );
}

await main();
