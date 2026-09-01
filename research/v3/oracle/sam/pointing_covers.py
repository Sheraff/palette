"""The 15-cover pointing test set, and the reviewer's own words as the answer key.

Pre-registered by `POINTING_SCOUT_NOTES.md` §4.2/§4.4 before any pointer was run. Kept in
its own module so the Qwen probe and the MolmoPoint probe read the identical list and the
comparison is like-for-like by construction rather than by care.

The 9 free-text covers are `cascade-ground-truth-1-analysis.json` ->
`verdict.vocabulary_misfit_covers`: the covers where the reviewer first pressed "none
discernible" for ground type and then described the ground in prose anyway. That prose is
the answer key, and it is unusually spatial ("on the left", "at the top", "in the four
corners"), which is the whole reason a *coordinate* can be scored against it.

`decidable` marks the 6 the synthesis calls palette-decidable — those are scored for
correctness. The 3 marked ambiguous are scored for BEHAVIOUR only: there is no correct
answer, and per the scout's §6, a pointer that is confident where a careful human could
not commit is exhibiting a prior, not a perception, and must be reported as such.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Cover:
    id: str
    path: str                 # relative to the repo root
    role: str                 # "misfit" | "control"
    ground_type: str          # reviewer's enum answer, or "none discernible"
    reviewer_ground: str      # the reviewer's own prose, verbatim where quoted
    decidable: bool           # scored for correctness, or behaviour only
    ground_regions: tuple[str, ...] = ()   # what a correct point may land on
    subject_regions: tuple[str, ...] = ()  # what a correct point must NOT land on
    notes: str = ""


COVERS: tuple[Cover, ...] = (
    # ---------------- the 9 vocabulary-misfit covers ----------------
    Cover(
        id="00014fb4", path="01/ab67616d0000b27300014fb430dd1b693e653121.jpg",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground="green on the left and red on the right - two fields",
        ground_regions=("green field, left", "red field, right"),
        subject_regions=("the woman", "the dragons", "the footballs"),
        notes="Bonus signal: points in BOTH fields => the plural/object_id grouping works.",
    ),
    Cover(
        id="00030075", path="03/ab67616d00001e02000300752f338b6aedff856c.jpg",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground="one green wall, 'maybe 30% of the entire picture'",
        ground_regions=("the green wall",),
        subject_regions=(),
    ),
    Cover(
        id="00066a61", path="06/ab67616d00001e0200066a61bbcbeadd632f7f38",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground="many pink squares ... one coherent background",
        ground_regions=("the pink squares",),
        subject_regions=(),
    ),
    Cover(
        id="00075841", path="07/ab67616d0000b27300075841f68d8cd71db368d8",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground=("white banner 'about maybe 15% of the height'; "
                         "hardwood floor behind the objects"),
        ground_regions=("the white top banner", "the hardwood floor"),
        subject_regions=("the shoes", "the hat", "the guitar"),
    ),
    Cover(
        id="000c4d52", path="0c/ab67616d00001e02000c4d52300a016ee65f1622",
        role="misfit", ground_type="none discernible", decidable=False,
        reviewer_ground="AMBIGUOUS — 'none of it really feels like a background'",
        notes="Behaviour only. Confidence here is suspicious, not a win.",
    ),
    Cover(
        id="000f0a78", path="0f/ab67616d00001e02000f0a78a1791248aec707e3",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground="black bar at the top, then a champagne bar, then a red field",
        ground_regions=("the black top bar", "the champagne bar", "the red field"),
        subject_regions=(),
        notes="Ideally one point per band — a three-band plural test.",
    ),
    Cover(
        id="000fa9b5", path="0f/ab67616d0000b273000fa9b53f161dc999ef557d",
        role="misfit", ground_type="none discernible", decidable=False,
        reviewer_ground="AMBIGUOUS — collage; grey dots on white, a shaded yellow field",
        notes="Behaviour only.",
    ),
    Cover(
        id="artofficial", path="images/artofficial.jpg",
        role="misfit", ground_type="none discernible", decidable=True,
        reviewer_ground=("one face near the middle is the subject, "
                         "'everything else feels like the background'"),
        ground_regions=("the illustrated field, anywhere but the central face",),
        subject_regions=("the one central face",),
    ),
    Cover(
        id="krafty", path="images/krafty.jpg",
        role="misfit", ground_type="none discernible", decidable=False,
        reviewer_ground=("AMBIGUOUS — black flat field behind everything; "
                         "pink leaves either ground or figure"),
        notes=("Behaviour only. Does it include the pink leaves? Either answer is "
               "acceptable; AN answer is the point. Also the reviewer's 'flowers on the "
               "four corners' plural case."),
    ),

    # ---------------- 6 controls, from the same 19 ----------------
    Cover(
        id="000bc98f", path="0b/ab67616d0000b273000bc98f315aba36374f9f93",
        role="control", ground_type="flat_field", decidable=True,
        reviewer_ground="a flat field",
        ground_regions=("the flat field",),
        notes="Easiest possible target; also the coordinate gate image.",
    ),
    Cover(
        id="0002dfdc", path="02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg",
        role="control", ground_type="multiple_distinct_fields", decidable=True,
        reviewer_ground="multiple distinct fields",
        ground_regions=("the distinct fields",),
        notes="Reviewer and model D matched exactly.",
    ),
    Cover(
        id="0000269e", path="00/ab67616d00001e020000269ead63cf2376a6b67d.jpg",
        role="control", ground_type="multiple_distinct_fields", decidable=True,
        reviewer_ground="multiple distinct fields",
        ground_regions=("the distinct fields",),
        notes="Reviewer and model D matched exactly.",
    ),
    Cover(
        id="disney", path="images/disney.avif",
        role="control", ground_type="multiple_distinct_fields", decidable=True,
        reviewer_ground="multiple distinct fields",
        ground_regions=("the distinct fields",),
        notes="Exact match; also exercises AVIF decode.",
    ),
    Cover(
        id="elephunk", path="images/elephunk.jpg",
        role="control", ground_type="multiple_distinct_fields", decidable=True,
        reviewer_ground="multiple distinct fields",
        ground_regions=("the distinct fields",),
        notes="Reviewer and model D matched exactly.",
    ),
    Cover(
        id="skap", path="images/skap.jpg",
        role="control", ground_type="full_scene", decidable=False,
        reviewer_ground="a full scene with no separable ground",
        notes=("Negative-ish control. A well-behaved pointer should DECLINE or scatter. "
               "Confident tight pointing here is a bad sign, not a good one."),
    ),
)

BY_ID = {c.id: c for c in COVERS}
MISFITS = tuple(c for c in COVERS if c.role == "misfit")
CONTROLS = tuple(c for c in COVERS if c.role == "control")
DECIDABLE = tuple(c for c in COVERS if c.decidable)
AMBIGUOUS = tuple(c for c in COVERS if not c.decidable)

# --------------------------------------------------------------------------- prompts
# Fixed before the run, per POINTING_SCOUT_NOTES.md §4.3. Same three for both pointers.

PROMPTS: tuple[tuple[str, str], ...] = (
    ("plain", "point to the background"),
    ("plural", "point to all parts of the background"),
    ("figure_ground", "point to the background surface behind the subject"),
)

#: Record the raw generation for every call. A parse that silently yields zero points and
#: a genuine "no more points" decline are different events and the row must tell them
#: apart — that distinction is the single most valuable property of a pointing model here
#: (the whole ground problem started with a reviewer pressing "none discernible" and then
#: saying it was not true).
RECORD_RAW_OUTPUT = True
