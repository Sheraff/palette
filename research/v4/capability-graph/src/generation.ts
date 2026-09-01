import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  GenerationInputReference,
  SourceSnapshot,
} from "./types.ts";

export const EXPECTED_SOURCE_FRAGMENT_MANIFEST = [
  {
    fragmentId: "fragment.02-raster-color-publication.v1",
    path: "research/v4/capability-graph/data/fragments/02-raster-color-publication.json",
  },
  {
    fragmentId: "fragment.03-image-evidence.v1",
    path: "research/v4/capability-graph/data/fragments/03-image-evidence.json",
  },
  {
    fragmentId: "fragment.06-treatment-search-selection.v1",
    path: "research/v4/capability-graph/data/fragments/06-treatment-search-selection.json",
  },
  {
    fragmentId: "fragment.07-validation-review.v1",
    path: "research/v4/capability-graph/data/fragments/07-validation-review.json",
  },
  {
    fragmentId: "fragment.09-model-oracles.v1",
    path: "research/v4/capability-graph/data/fragments/09-model-oracles.json",
  },
  {
    fragmentId: "fragment.10a-literature-vision.v1",
    path: "research/v4/capability-graph/data/fragments/10a-literature-vision.json",
  },
  {
    fragmentId: "fragment.10b-literature-decision.v1",
    path: "research/v4/capability-graph/data/fragments/10b-literature-decision.json",
  },
  {
    fragmentId: "fragment.candidates-roles.v1",
    path: "research/v4/capability-graph/data/fragments/04-candidates-roles.json",
  },
  {
    fragmentId: "fragment.gradients.section-05.v1",
    path: "research/v4/capability-graph/data/fragments/05-gradients.json",
  },
] as const;

export const EXPECTED_GENERATION_INPUT_PATHS: readonly string[] = Object.freeze([
  "research/v4/MECHANISMS.md",
  "research/v4/capability-graph/data/capability-groups.json",
  ...EXPECTED_SOURCE_FRAGMENT_MANIFEST.map(({ path }) => path).sort(compareCodeUnits),
  "research/v4/capability-graph/schema/capability-graph.schema.json",
  "research/v4/capability-graph/schema/fragment.schema.json",
]);

export interface StrictTextFile {
  bytes: Buffer;
  text: string;
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function serializeCanonical(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function computeGenerationDigest(input: {
  generator: { name: string; version: string };
  generatedAt: string;
  sourceSnapshot: SourceSnapshot;
  generationInputs: readonly GenerationInputReference[];
}): string {
  return sha256(serializeCanonical(input));
}

export function assertNoDuplicateJsonKeys(text: string, path: string): void {
  let index = 0;

  function fail(message: string): never {
    throw new Error(`${path}: ${message} at character ${index}.`);
  }

  function whitespace(): void {
    while (/\s/.test(text[index] ?? "")) index += 1;
  }

  function stringValue(): string {
    const start = index;
    if (text[index] !== '"') fail("Expected a JSON string");
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index)) as string;
        } catch (error: unknown) {
          fail(error instanceof Error ? error.message : String(error));
        }
      }
      if (character === "\\") {
        index += 1;
        if (index >= text.length) fail("Unterminated JSON escape");
        if (text[index] === "u") index += 4;
      }
      index += 1;
    }
    fail("Unterminated JSON string");
  }

  function value(): void {
    whitespace();
    const character = text[index];
    if (character === "{") {
      objectValue();
      return;
    }
    if (character === "[") {
      arrayValue();
      return;
    }
    if (character === '"') {
      stringValue();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      text.slice(index),
    );
    if (!number) fail("Expected a JSON value");
    index += number[0].length;
  }

  function objectValue(): void {
    const keys = new Set<string>();
    index += 1;
    whitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      whitespace();
      const key = stringValue();
      if (keys.has(key)) fail(`Duplicate JSON object key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (text[index] !== ":") fail("Expected ':' after an object key");
      index += 1;
      value();
      whitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("Expected ',' or '}' in an object");
      index += 1;
    }
    fail("Unterminated JSON object");
  }

  function arrayValue(): void {
    index += 1;
    whitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      value();
      whitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("Expected ',' or ']' in an array");
      index += 1;
    }
    fail("Unterminated JSON array");
  }

  value();
  whitespace();
  if (index !== text.length) fail("Unexpected trailing JSON content");
}

export function decodeUtf8(bytes: Buffer, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error: unknown) {
    throw new Error(
      `${path}: invalid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseStrictJsonBytes<T>(bytes: Buffer, path: string): T {
  const text = decodeUtf8(bytes, path);
  assertNoDuplicateJsonKeys(text, path);
  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function readStrictText(path: string): Promise<StrictTextFile> {
  const bytes = await readFile(path);
  return { bytes, text: decodeUtf8(bytes, path) };
}

export async function readStrictJson<T>(
  path: string,
): Promise<StrictTextFile & { value: T }> {
  const file = await readStrictText(path);
  return { ...file, value: parseStrictJsonBytes<T>(file.bytes, path) };
}
