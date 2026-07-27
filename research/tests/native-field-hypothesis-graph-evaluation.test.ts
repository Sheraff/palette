import assert from "node:assert/strict"
import test from "node:test"
import { parseNativeFieldHypothesisGraphArguments } from "../evaluate-native-field-hypothesis-graph.ts"

test("native field graph evaluation requires a bounded development prefix", () => {
	assert.deepEqual(parseNativeFieldHypothesisGraphArguments(["--limit", "3"]), { limit: 3, write: false })
	assert.deepEqual(parseNativeFieldHypothesisGraphArguments(["--limit", "37", "--write"]), { limit: 37, write: true })
	assert.throws(() => parseNativeFieldHypothesisGraphArguments([]), /Usage/)
	assert.throws(() => parseNativeFieldHypothesisGraphArguments(["--limit", "0"]), /Usage|between/)
	assert.throws(() => parseNativeFieldHypothesisGraphArguments(["--limit", "38"]), /between/)
	assert.throws(() => parseNativeFieldHypothesisGraphArguments(["--limit", "3", "--write"]), /complete 37-source/)
})
