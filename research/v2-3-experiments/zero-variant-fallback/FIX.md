# Zero-variant fallback — a reachable exception in `buildCompletePaletteTreatmentDomain`

MICRO defect arm on trunk `3d43e2b`. One defect, one fix, no ruler moved.

**Status: zero behaviour change on trunk, verified. Recommended for integration without review.**

---

## 1. The defect

`buildFieldVariants` (`research/v2-3/src/internal/palette-core.ts:4008`) can return an empty array.
Its caller `buildCompletePaletteTreatmentDomain` treats that as unreachable and throws:

```ts
const fieldVariants = buildFieldVariants(hypotheses)
if (fieldVariants.length === 0) throw new Error("No field variants are available")   // :4851
```

So the pipeline raises an exception instead of returning a palette. For a library consumer this is
worse than any colour disagreement: there is no answer at all.

Trunk never reaches it on the 7,587-artwork corpus — this is a latent landmine, not a live bug — but
it is armed by any change that moves which field hypothesis survives refinement.

### How the empty set is produced

Every guard inside `buildFieldVariants` exists to refuse a **gradient claim**. None of them is a
judgement that the artwork has no field. But one of them refuses the claim by dropping the whole
**pair**, and a pair is also the only thing that carries the collapsed (single-field) reading:

| line | guard | what it drops |
| --- | --- | --- |
| `:4054` | `hypothesis.kind === "gradient-field" && okDistance(background.oklab, surface.oklab) < 0.028` → `continue` | **the pair** — gradient variant *and* the collapsed variant below it |
| `:4062` | `perceptualDifference(background.rgb, surface.rgb) >= DISTINCTNESS.gradientEndpoints` gates only the gradient push | **the gradient claim only**; the collapsed `one-field` push at `:4081` is left standing |

The second guard's own comment states the principle the first one violates:

> the gradient claim is refused here while the pair's collapsed variant below is left standing: the
> honest treatment of two colours that are one colour is the one that says so.

Track Q recorded the asymmetry knowingly when it added the ΔE gate
(`research/v2-3-experiments/track-q/EXPERIMENT.md:478-483`): *"The existing endpoint guard on the
line above is `okDistance(...) < 0.028` and `continue`s — it drops the pair. The new gate drops only
the gradient claim… It also sits after the OKLab guard rather than replacing it: they refuse
different things, and the OKLab one is load-bearing for reasons this track did not measure."*

When endpoint refinement narrows the hypothesis list to a **single** gradient-field proposal and that
one proposal's only pair is dropped at `:4054`, the result is the empty set and the caller throws.

### The reproduction

Documented by the grain sweep (`research/v2-3-experiments/grain-derivation/EXPERIMENT.md` §1.5, on
branch `worktree-agent-aef45cee9b35058c5` @ `a5ad2aa`) and reproduced here from scratch by overlaying
that branch's `family-grain.ts` + its 21-line `palette-core.ts` patch onto a pristine `3d43e2b`
checkout with `FAMILY_GRAIN = "on"`. Scaffolding is read-only reproduction material and is **not**
part of this fix.

Artwork: `0d/ab67616d00001e02000d546b7750701bc1b7dc75` (the 300 px rendition; the 640 px sibling is
fine), read from the shared checkout `/Users/Flo/github/palette`, never from the worktree's scrambled
decoys.

Instrumented dump at the throw — exactly one surviving hypothesis:

```
kind: gradient-field
id:   endpoint-refinement:band-local-refinement:field-domain-0:radial-upper-center:center-out:family-10804
backgrounds[0]: rgb(233,237,238)
surfaces[0]:    rgb(245,245,245)
```

`min(3 backgrounds, 1 surface, CONTROL_FIELD_VARIANT_PAIRS=2)` = one pair. Measured with the tree's
own functions:

| ruler | value | bar | verdict |
| --- | --- | --- | --- |
| `okDistance` (bare literal, runs **first**) | **0.027184** | `< 0.028` | refused — "one colour" |
| `perceptualDifference` (CIE76 ΔE) | **3.402906** | `DISTINCTNESS.gradientEndpoints = 3.3` | kept — "two colours" |

**The two rulers disagree, and the un-reviewed one wins.** The reviewed same-colour bar — 3.3, set by
six bracketing midpoint judgements and pinned in `configuration.test.ts` across three fields — says
these are two distinct colours. A bare `0.028` OKLab literal says they are one, and it runs first and
drops the pair.

### Provenance of the `0.028` literal

`git log -S` finds no rationale commit anywhere in the v2-3 line: the literal arrives with the
`v2-3` scaffold commit `c9395ac` ("exact v2-2 duplicate") and before that with the `v2-2` squash
`14903fe`. It has no design record, no sweep, and no review — exactly the `[INHERITED]` bare-literal
class the provenance sweep tagged (`research/v2-3-experiments/track-q/EXPERIMENT.md:26`, and the
`track-p/LEDGER.md` constant registry). It also duplicates, at a different value and on a different
ruler, a judgement the campaign has already made explicitly.

---

## 2. The fix

**A fallback, not a ruler change.** Both were on the table; only one is free.

*Rejected — repairing the `:4054` guard* to drop only the gradient claim (making it behave like its
`:4062` sibling, or replacing it with the reviewed ΔE bar). This is arguably the *correct* long-term
shape, and the evidence above supports it. But the guard fires on many artworks where **other pairs
survive**, and in those cases the repair **adds** a collapsed candidate to a non-empty candidate set —
which can change the winner. That is a behaviour change owing a corpus sweep and a human review
batch. Out of scope for a MICRO defect arm, and it would bundle a ruler argument into a crash fix.

*Chosen — a fallback at the throwing caller.* When the ordinary reading returns nothing at all, build
the collapsed reading of the same hypotheses instead of throwing:

```ts
const proposedVariants = buildFieldVariants(hypotheses)
const fieldVariants = proposedVariants.length > 0
	? proposedVariants
	: buildFieldVariants(hypotheses, { representatives: "control", pairing: "same-index", treatments: "collapsed-only" })
if (fieldVariants.length === 0) throw new Error("No field variants are available")
```

The new `treatments: "collapsed-only"` mode emits, for each pair, exactly the degenerate single-field
variant the ordinary path already builds beside every pair it keeps (`:4075-4087`) — same fidelity
discount, same zero band spread, same dropped midpoint — and skips the gradient guards, which have
nothing to say about a field read as one colour.

**Why this is provably zero-behaviour on trunk.** The fallback sits in the `else` of
`proposedVariants.length > 0`. The old code threw on exactly that same condition. So the new branch
executes *if and only if* the old code threw — any input that previously produced a palette takes the
identical path with the identical array. This is a property of the control flow, not of a sample.

**The throw is kept**, and is still correct: if no hypothesis carries a representative there is no
colour to collapse to, and inventing one is not this function's business.

**One-field hypotheses are unaffected, unreachably so.** The collapsed-only push applies the
`one-field` discount and a zero band spread to *every* kind, which for a hypothesis that is already
`kind: "one-field"` differs from its ordinary push in `endpointBandSpread` (0 rather than the
measured pair spread). That difference can never be observed: a `one-field` hypothesis passes all
three ordinary guards, so if one exists with a non-empty representative list the ordinary path
returns at least one variant and the fallback is not taken — and if its representative list *is*
empty it yields no pairs in the fallback either. Its `surfaceContribution` is `0` at construction, so
the fidelity discount is the identity in any case.

**Other call sites untouched.** `buildFieldVariants` has two further callers
(`buildSourceRegistry`'s cross-pair walk at `:5157`, `SeedMechanics.fieldVariants` at `:5387`). Both
already tolerate an empty array — one is a `for…of`, the other stores it — so the fallback was
deliberately **not** put inside `buildFieldVariants`, where it would have handed those two callers
variants they do not get today. Scoping it to the one caller that cannot proceed is what makes the
zero-behaviour claim provable.

**Scope note — the downstream throws are untouched.** `buildCompletePaletteTreatmentDomain` feeds a
second empty-set guard (`:5076`, "No legal complete palette treatment could be generated") and there
is a third upstream (`:5417`, "No defensible field hypothesis was found"). This fix does not claim to
make either unreachable; it only stops the *field-variant* stage from throwing on a state it can
legitimately produce. On the reproduced artwork the collapsed variants do carry through to a full
palette, so the downstream guard is satisfied there — but that is an observation, not a proof, and a
general audit of those two is separate work.

### Files changed

- `research/v2-3/src/internal/palette-core.ts` — `+52 −1`, three hunks: the `treatments` option, the
  collapsed-only branch, the caller fallback. No new file, no constant moved, no ruler touched.

---

## 3. Verification

All measurements on the unscrambled corpus at `/Users/Flo/github/palette` (fixtures from
`images/`, artworks from the `<2-hex>/` sample caches).

| check | result |
| --- | --- |
| Reproduction: grain-ON **trunk** on the trigger artwork | `Error: No field variants are available` |
| Reproduction: grain-ON **fixed** on the trigger artwork | returns a palette — `#cdd5d8` / `#fcffff` / `#010101` / `#3b9fae`, gradient `true` |
| Byte-identity, whole `PaletteExtraction` JSON, pristine `3d43e2b` vs fixed, shipped config | **0 differences / 237 compared** (37 fixtures — a superset of the 34 parity fixtures — + 200 artworks on an even stride across all 21 hex roots of the 7,550-artwork corpus) |
| Throws on either side across those 237 | **0 / 0** — no artwork reached the fallback |
| Determinism, fallback path (grain-ON, trigger artwork, run twice) | STABLE |
| Determinism, shipped config (`artofficial`, `black`, run twice) | STABLE |
| `tsc -p research/v2-3/tsconfig.json` | clean |
| `architecture.test.ts` + `configuration.test.ts` | **13 / 13 pass** |

Note on the byte-identity run: trunk threw on **none** of the 237, and by the control-flow argument
above that is equivalent to "the fallback fired on none of them". The 0-difference result is the
independent confirmation that nothing else in the diff moved.

The grain sweep's own shipped-configuration arm is the wider evidence: it ran the full
7,587-artwork corpus and never reached this state (only its ON arm did, on one artwork).

---

## 4. Recommendation

**Integrate without review.** The change is zero-behaviour on trunk by construction and by
measurement; it converts a reachable exception into the collapsed reading the surrounding code
already treats as the honest answer; and it leaves every ruler, constant and reviewed outcome exactly
where it was.

### Follow-on, deliberately not done here

Reconciling the `okDistance < 0.028` literal at `:4054` with the reviewed ΔE 3.3 bar is a real and
well-posed arm, and this defect is the evidence that the two rulers disagree in practice. It is a
one-line change with a measurable blast radius, it **will** move outputs, and it therefore needs a
corpus sweep and a human review batch of its own. This fix removes the crash so that arm can be run
on its merits rather than under time pressure.
