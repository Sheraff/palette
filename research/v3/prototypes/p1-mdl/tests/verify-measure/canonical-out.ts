/**
 * VERIFIER-OWNED. Prints the canonical JSON of a measurement to stdout, so two *separate node
 * processes* can be diffed byte for byte from the shell rather than inside one test process.
 */

import { canonicalJson, measureImage } from "../../src/measure/index.ts"

const measurement = await measureImage(process.argv[2])
// `source.path` is provenance and is identical for both runs by construction; nothing is stripped.
process.stdout.write(canonicalJson(measurement))
