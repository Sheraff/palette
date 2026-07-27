import assert from "node:assert/strict"
import test from "node:test"
import {
	UI_ACCENT_CONTRAST_PROFILE,
	defineAccentContrastProfile,
} from "../src/accent-contrast.ts"

test("UI accent contrast profile is immutable and exact", () => {
	assert.deepEqual(UI_ACCENT_CONTRAST_PROFILE, {
		algorithm: "apca-w3-0.1.9",
		backgroundMinimumLc: 10,
		surfaceMinimumLc: 10,
	})
	assert.equal(Object.isFrozen(UI_ACCENT_CONTRAST_PROFILE), true)
	assert.throws(() => defineAccentContrastProfile({
		algorithm: "apca-w3-0.1.9",
		backgroundMinimumLc: 0,
		surfaceMinimumLc: 15,
	}), /profile is invalid/)
	assert.throws(() => defineAccentContrastProfile({
		algorithm: "apca-w3-0.1.9",
		backgroundMinimumLc: 15,
		surfaceMinimumLc: 109,
	}), /profile is invalid/)
})
