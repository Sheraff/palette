/*
 * The one keymap every review page reads (REVIEW_UI.md §6: "keyboard-only … 1–5 for enums").
 *
 * The reviewer works on a French Mac (AZERTY), where the digit row is unshifted **letters and
 * punctuation**: pressing the key that says `1` sends `&`, the key that says `2` sends `é`, and so
 * on. Every page here binds digits somewhere — grades, swatches, oracle enums — so on that keyboard
 * every one of those bindings needed a modifier held down to work at all. Their words, 2026-08-03:
 *
 *   "we should accept keys &é\"'(§è!çà mapped to 1234567890 (in order)"
 *
 * So both rows answer, everywhere, and the mapping lives here rather than in five copies: a page
 * that grew its own copy would be a page where a mis-mapped key silently records the wrong answer,
 * and a wrong answer in a closed vocabulary is unfindable afterwards.
 *
 * Nothing here lowercases or otherwise rewrites a key it does not recognise — `T` must stay `T` for
 * the composer, and `Escape` must stay `Escape`. `normalizeKey` is the identity on everything that
 * is not one of the twenty keys below.
 */

/** The digit row as printed, in order. `à` maps to `0`, which is the 10th answer where one exists. */
export const DIGIT_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]

/**
 * The French (Mac AZERTY) unshifted digit row, in the same order — the reviewer's own sequence,
 * verbatim, character for character. [REVIEWED] — reviewer, 2026-08-03, live testing session.
 */
export const AZERTY_DIGIT_ROW = ["&", "é", '"', "'", "(", "§", "è", "!", "ç", "à"]

/**
 * Every non-digit key the review pages bind, so the collision check has something to check against.
 *
 * Four of the AZERTY characters are letters (`é è ç à`), which is exactly how a keymap like this
 * quietly steals a binding. `review-server-keymap.test.ts` asserts the two sets stay disjoint, and
 * it reads this list — so a page that binds a new letter adds it here, and the test keeps its word.
 */
export const RESERVED_LETTER_KEYS = [
	// pairwise (app.js): grades and preference, comment, confound, veto, composer, movement
	"a", "b", "n", "c", "x", "v", "e", "j", "k",
	// composer.js
	"t", "T", "g", "s", "w",
	// calibration.js
	// (c, v, j, k above)
	// bracketing.js / oracle.js
	"y", "u", "r",
	// oracle-review.js
	"d", "m",
	// amend.js
	// (s, x, e, j, k above)
]

const BY_KEY = new Map(AZERTY_DIGIT_ROW.map((key, index) => [key, DIGIT_ROW[index]]))

/**
 * The digit a key stands for, or null when it stands for none.
 *
 * Digits map to themselves, so a caller can use this as its only test for "is this a number key"
 * without asking twice.
 */
export function digitFor(key) {
	if (typeof key !== "string") return null
	if (DIGIT_ROW.includes(key)) return key
	return BY_KEY.get(key) ?? null
}

/**
 * The key a page should act on: the digit when it is one of the twenty digit-row keys, and the key
 * itself otherwise. Pages call this once, at the top of their key handler.
 */
export function normalizeKey(key) {
	return digitFor(key) ?? key
}
