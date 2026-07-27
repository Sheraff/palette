import assert from "node:assert/strict"
import test from "node:test"
import { parseNativeExactPairTransferArguments } from "../evaluate-native-exact-pair-topology-transfer.ts"

test("native exact-pair transfer arguments reserve writes for the complete audit", () => {
	assert.deepEqual(parseNativeExactPairTransferArguments(["--limit", "1"]), { limit: 1, write: false })
	assert.deepEqual(parseNativeExactPairTransferArguments(["--limit", "274", "--write"]), { limit: 274, write: true })
	assert.throws(() => parseNativeExactPairTransferArguments(["--limit", "1", "--write"]), /complete/)
	assert.throws(() => parseNativeExactPairTransferArguments(["--limit", "275"]), /between/)
})
