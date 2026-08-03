/* A block comment holding 999, which is not a literal. */
// A line comment holding 888, which is not a literal.

/** JSDoc mentioning 444, which is not a literal. */
export const STRING_DOUBLE = "there are 777 sheep"
export const STRING_SINGLE = 'and 555 goats'
export const TEMPLATE_TEXT = `template 666 text, no substitution`
export const REGEX = /[0-9]{3,4}/g

// The only three numeric literals in this file: two in a template substitution, one bare.
export const SUBSTITUTION = `sum ${1 + 2} done`
export const BARE = 42
