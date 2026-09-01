import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_SOURCE_FRAGMENT_MANIFEST,
  readStrictJson,
  readStrictText,
} from "../src/generation.ts";
import type {
  CapabilityGraph,
  CapabilityGroups,
  GeneratedAnalysis,
  MappingFragment,
} from "../src/types.ts";

export const GRAPH_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const REPOSITORY_ROOT = resolve(GRAPH_ROOT, "../../..");
export const SOURCE_PATH = resolve(GRAPH_ROOT, "../MECHANISMS.md");
export const GRAPH_PATH = resolve(GRAPH_ROOT, "data/capability-graph.json");
export const ANALYSIS_PATH = resolve(GRAPH_ROOT, "data/orphan-analysis.json");
export const GROUPS_PATH = resolve(GRAPH_ROOT, "data/capability-groups.json");
export const GRAPH_SCHEMA_PATH = resolve(
  GRAPH_ROOT,
  "schema/capability-graph.schema.json",
);
export const FRAGMENT_SCHEMA_PATH = resolve(GRAPH_ROOT, "schema/fragment.schema.json");
export const INDEX_PATH = resolve(GRAPH_ROOT, "web/index.html");
export const APP_PATH = resolve(GRAPH_ROOT, "web/app.js");
export const STYLES_PATH = resolve(GRAPH_ROOT, "web/styles.css");

export interface LoadedFragment {
  fileName: string;
  path: string;
  value: MappingFragment;
}

export interface Fixtures {
  graph: CapabilityGraph;
  analysis: GeneratedAnalysis;
  groups: CapabilityGroups;
  sourceText: string;
  graphSchema: Record<string, unknown>;
  fragmentSchema: Record<string, unknown>;
  fragments: LoadedFragment[];
}

let fixturesPromise: Promise<Fixtures> | undefined;

export function loadFixtures(): Promise<Fixtures> {
  fixturesPromise ??= (async () => {
    const [graph, analysis, groups, source, graphSchema, fragmentSchema, fragments] =
      await Promise.all([
        readStrictJson<CapabilityGraph>(GRAPH_PATH),
        readStrictJson<GeneratedAnalysis>(ANALYSIS_PATH),
        readStrictJson<CapabilityGroups>(GROUPS_PATH),
        readStrictText(SOURCE_PATH),
        readStrictJson<Record<string, unknown>>(GRAPH_SCHEMA_PATH),
        readStrictJson<Record<string, unknown>>(FRAGMENT_SCHEMA_PATH),
        Promise.all(
          EXPECTED_SOURCE_FRAGMENT_MANIFEST.map(async (expected): Promise<LoadedFragment> => {
            const path = resolve(REPOSITORY_ROOT, expected.path);
            return {
              fileName: expected.path.slice(expected.path.lastIndexOf("/") + 1),
              path,
              value: (await readStrictJson<MappingFragment>(path)).value,
            };
          }),
        ),
      ]);
    return {
      graph: graph.value,
      analysis: analysis.value,
      groups: groups.value,
      sourceText: source.text,
      graphSchema: graphSchema.value,
      fragmentSchema: fragmentSchema.value,
      fragments,
    };
  })();
  return fixturesPromise;
}

export async function loadWebFiles(): Promise<{
  html: string;
  javascript: string;
  css: string;
}> {
  const [html, javascript, css] = await Promise.all([
    readFile(INDEX_PATH, "utf8"),
    readFile(APP_PATH, "utf8"),
    readFile(STYLES_PATH, "utf8"),
  ]);
  return { html, javascript, css };
}
