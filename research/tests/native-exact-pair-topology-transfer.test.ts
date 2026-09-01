import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import {
	parseNativeExactPairPayload,
	resolveNativeExactPairSource,
} from "../native-exact-pair-topology-transfer-child.ts"

const projectRoot = resolve(import.meta.dirname, "../..")

test("native exact-pair source resolver admits only frozen source roots", () => {
	assert.equal(resolveNativeExactPairSource(projectRoot, "images/birdsofprey.jpg"),
		resolve(projectRoot, "images/birdsofprey.jpg"))
	assert.equal(resolveNativeExactPairSource(projectRoot, "music-artworks/a/0/2/source.png"),
		resolve(projectRoot, "music-artworks/a/0/2/source.png"))
	assert.throws(() => resolveNativeExactPairSource(projectRoot, "07/source.jpg"), /not authorized/)
	assert.throws(() => resolveNativeExactPairSource(projectRoot, "10/source.jpg"), /not authorized/)
	assert.throws(() => resolveNativeExactPairSource(projectRoot, "images/../source.jpg"), /invalid/)
})

test("native exact-pair payload parser requires one directed byte-RGB pair", () => {
	assert.deepEqual(parseNativeExactPairPayload(JSON.stringify({
		backgroundRgb: [1, 2, 3],
		surfaceRgb: [250, 251, 252],
	})), { backgroundRgb: [1, 2, 3], surfaceRgb: [250, 251, 252] })
	assert.throws(() => parseNativeExactPairPayload(JSON.stringify({
		backgroundRgb: [1, 2, 3],
		surfaceRgb: [256, 0, 0],
	})), /invalid/)
})
