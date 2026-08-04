"""Pinned configuration for the v3 image-embedding stage (oracle pipeline stage 1).

Spec: research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md sections 2.1 and 6.
Conventions: research/v3/CONVENTIONS.md — every constant is named and carries a
provenance tag plus one line saying where the value comes from.
"""

from pathlib import Path

# [MEASURED] This file lives at research/v3/oracle/embeddings/config.py, so the
# repository root is four directories up. Checked against the real tree 2026-08-02.
REPO_ROOT = Path(__file__).resolve().parents[4]

# [REVIEWED] Spec section 2.1 asks for a SigLIP 2 so400m checkpoint when open_clip
# supports one, falling back to ViT-SO400M-14-SigLIP-384/webli otherwise.
# open_clip 3.3.0 does list a SigLIP 2 so400m family; this is the 384 px member,
# which matches the resolution the spec's fallback would have used.
MODEL_NAME = "ViT-SO400M-16-SigLIP2-384"

# [REVIEWED] The only pretrained tag open_clip 3.3.0 publishes for this architecture.
PRETRAINED_TAG = "webli"

# [MEASURED] Hugging Face repository that open_clip resolves the tag above to, and
# the commit `refs/main` pointed at when the weights were fetched on 2026-08-02.
# open_clip 3.3.0 has no way to pin a revision through create_model_and_transforms,
# so this is verified after the fact against the local hub cache.
MODEL_HF_REPO = "timm/ViT-SO400M-16-SigLIP2-384"
MODEL_HF_REVISION = "fec784dabb3081a5f101fc74eefaf9d1ed08237b"

# [MEASURED] sha256 of the checkpoint file open_clip loaded, computed 2026-08-02.
# This is the real pin: it survives a hub retag or a cache rebuild.
MODEL_WEIGHTS_FILENAME = "open_clip_model.safetensors"
MODEL_WEIGHTS_SHA256 = (
    "8ceec00df3c462d155d172933339cd9178a86bfab72f4458dbe84bd54f5ad026"
)

# [MEASURED] Read off open_clip.get_model_config(MODEL_NAME)["embed_dim"] and
# confirmed by a forward pass on 2026-08-02. Matches the FLOAT[1152] column the
# warehouse schema (spec section 9.2) already declares for artwork_embeddings.
EMBED_DIM = 1152

# [MEASURED] The square side the bundled preprocessing transform resizes to, read
# off the returned torchvision Compose on 2026-08-02.
MODEL_INPUT_SIDE_PX = 384

# [INHERITED] Collection names are the values the warehouse schema (spec section
# 9.2, `oracle_raw.collection`) already declares.
COLLECTION_SHARDED = "sharded"
COLLECTION_MUSIC_ARTWORKS = "music_artworks"
COLLECTIONS = (COLLECTION_SHARDED, COLLECTION_MUSIC_ARTWORKS)

# [MEASURED] Fresh-shard import drill, 2026-08-04 (loose end A11). The reviewer
# added shard directory `15/` at the repo root: 378 files, all JPEG by magic
# bytes, zero exact byte-duplicates against the 7,550 pinned files.
#
# It is deliberately NOT added to SHARDED_DIR_NAMES and NOT added to COLLECTIONS.
# Widening either one would move the denominator behind every completeness check
# in this package (`common.enumerate_collection`, `eval_pairs.discover_arms`,
# `embed.py`, `query.py`), which would retroactively mark all five already-
# embedded arms incomplete and would silently recompute the bake-off pool, the
# near-duplicate census pool and the coverage-set universe over 7,928 files while
# every committed number was measured over 7,550. A fresh shard is therefore
# imported as its OWN collection, which lands in its own
# `<collection>.<arm>.npy` / `.ids.jsonl` sidecar and touches nothing existing.
#
# Promoting `15/` into the pinned `sharded` collection is a separate, deliberate
# act: it means appending "15" to SHARDED_DIR_NAMES, re-pinning
# EXPECTED_FILE_COUNTS[COLLECTION_SHARDED] to 7928, re-pinning
# EXPECTED_SHARDED_FILES in src/coverage-set/corpus.ts, and regenerating every
# downstream artifact. See src/coverage-set/FRESH_SHARD_DRILL.md.
COLLECTION_SHARDED_FRESH_15 = "sharded_fresh_15"

# [MEASURED] The one directory the fresh-shard collection enumerates, 2026-08-04.
SHARDED_FRESH_15_DIR_NAMES = ("15",)

# [REVIEWED] Every collection this package knows how to enumerate, as opposed to
# COLLECTIONS, which is the set a default run embeds. `embed.py` offers this as
# its `--collections` choices while keeping COLLECTIONS as the default, so an
# unqualified `embed.py` behaves exactly as it did before the fresh shard existed.
ALL_COLLECTIONS = COLLECTIONS + (COLLECTION_SHARDED_FRESH_15,)

# [MEASURED] The 21 shard directories that exist at the repository root, listed
# 2026-08-02: 00-09, 0a-0f, 10-14. 7,550 files total, matching spec section 7.
SHARDED_DIR_NAMES = (
    "00", "01", "02", "03", "04", "05", "06", "07", "08", "09",
    "0a", "0b", "0c", "0d", "0e", "0f",
    "10", "11", "12", "13", "14",
)

# [MEASURED] The second collection's root, surveyed in spec section 7.4.
MUSIC_ARTWORKS_DIR_NAME = "music-artworks"

# [MEASURED] Files each collection must enumerate to. Counted from the ids files
# and the tree on 2026-08-02 and re-counted 2026-08-03; the same two numbers are
# already asserted on the TypeScript side (`src/coverage-set/corpus.ts`
# EXPECTED_SHARDED_FILES / EXPECTED_MUSIC_ARTWORKS_FILES, enforced in
# build-coverage-set.ts).
#
# Why this exists (adversarial review 2026-08-03, MINOR-11): the glob in
# `common.enumerate_collection` is the denominator behind EVERY completeness
# check on the Python side -- `eval_pairs.discover_arms` asks "did this arm
# resolve as many rows as the collection has files?", and `embed.py` asks the
# same. It raised on a MISSING shard directory but never on a short count, so a
# partial sync silently lowered the denominator and a truncated arm certified
# itself complete. 7,550 + 8,595 = 16,145, the pool size every bake-off and
# census number is computed over.
# The two pinned numbers below are UNCHANGED by the 2026-08-04 fresh-shard
# import; `15/` is a separate collection precisely so they stay put.
EXPECTED_FILE_COUNTS = {
    COLLECTION_SHARDED: 7550,
    COLLECTION_MUSIC_ARTWORKS: 8595,
    # [MEASURED] `ls 15 | wc -l` on 2026-08-04: 378 files, no subdirectories, no
    # dotfiles, no zero-byte files. Pinned the day the shard arrived so a partial
    # re-sync of a FRESH shard fails the same way a partial sync of the pinned
    # corpus does.
    COLLECTION_SHARDED_FRESH_15: 378,
}

# [MEASURED] The root those counts were measured under, captured at import and
# never reassigned. `selftest.py` swaps `REPO_ROOT` for a temporary directory
# holding a five-file synthetic corpus, which is a DIFFERENT corpus and must not
# be measured against these numbers. Comparing the enumeration root against this
# constant is what tells the two cases apart.
PINNED_CORPUS_ROOT = REPO_ROOT

# Extensions are deliberately not used to decide what to decode. The sharded set
# is 6,090 extension-less files plus 1,460 `.jpg`, all JPEG by magic bytes
# (measured 2026-08-02); music-artworks is .avif/.jpg/.jpeg/.png. PIL sniffs the
# content, and anything it cannot read becomes a `failed` row.

# [UNCALIBRATED] Files whose bytes are smaller than this cannot be a decodable
# image and are recorded as failed rather than attempted. No such file exists in
# either collection today (spec sections 7 and 7.4 report zero zero-byte files);
# the guard is here so a truncated download becomes a `failed` row, not a crash.
MIN_PLAUSIBLE_IMAGE_BYTES = 64

# [REVIEWED] Spec section 5.1 fixes the attempt cap at 3 before a `failed` row is
# written. Counted across process restarts, not just within one process.
MAX_ATTEMPTS_PER_FILE = 3

# [MEASURED] Batch size for the MPS forward pass. Benchmarked 2026-08-02 on 384
# images per setting, interleaved to cancel thermal drift: 8, 16 and 32 were
# indistinguishable (132-182 ms/image, run-to-run spread larger than the
# between-setting spread) and 64 was clearly worse (~30% slower). 8 wins the tie
# because a kill loses at most 8 images of in-flight work.
DEFAULT_BATCH_SIZE = 8

# [REVIEWED] Torch dtype for the forward pass. float32 rather than float16 because
# these vectors are a stored, committed feature (spec section 6.1) and half
# precision on MPS costs ~3 decimal digits for a speedup the run does not need.
TORCH_DTYPE = "float32"

# [UNCALIBRATED] Background used when an image carries an alpha channel. PIL's
# plain .convert("RGB") keeps whatever bytes sit under a transparent pixel, which
# is usually black and occasionally garbage; compositing onto white matches how a
# player would actually show the artwork. 980 PNGs in music-artworks can hit this.
ALPHA_FLATTEN_BACKGROUND_RGB = (255, 255, 255)

# [REVIEWED] Chunk size for content hashing. Any value works; 1 MiB keeps the
# hash off the critical path without holding a large file in memory.
HASH_CHUNK_BYTES = 1 << 20

# [INHERITED] Output layout required by the task spec (item 5) and consistent with
# the .gitignore already committed at research/v3/.gitignore.
DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "embeddings"
SHARD_SUBDIR_NAME = "shards"
MANIFEST_FILENAME = "manifest.json"

# [MEASURED] float32 is 4 bytes; used to map row index to byte offset in the
# append-only shard file.
BYTES_PER_FLOAT32 = 4


# ---------------------------------------------------------------------------
# Model arms (the bake-off)
# ---------------------------------------------------------------------------
#
# We never query these embeddings by text. The three uses — near-duplicate
# detection, visual stratification, failure-class retrieval — are all
# image-to-image, so a pure-vision encoder may beat a text-aligned one. Each arm
# below produces the same contract: one L2-normalized vector per file, over both
# collections, scored by eval_pairs.py against ground truth we own.
#
# Every arm keeps the *same framing* as the others: the whole image is squashed
# to a square, never center-cropped. This matters because album art puts text
# and badges at the edges, and because a framing difference between arms would
# confound the bake-off. Resolution still differs per arm (each runs at or near
# its pretraining size) and that IS a live confound — see ARM_RESOLUTION_CONFOUND.

# [REVIEWED] Arm identifiers. These become filename infixes
# (<collection>.<tag>.npy), so they are short, lowercase, and filesystem-safe.
ARM_SIGLIP2 = "siglip2-so400m"
ARM_DINOV2 = "dinov2-vitl14"
ARM_DINOV2_HIRES = "dinov2-vitl14-392"
ARM_PE_CORE = "pe-core-l14"
ARM_DINOV3 = "dinov3-vitl16"
ARM_DINOV3_HPLUS = "dinov3-vith16plus"

# [MEASURED] DINOv3 is the reviewer's preferred pure-vision arm and access has
# been requested. Re-probed 2026-08-02 after the request was filed: the repo
# still reports gated="manual" and a download still returns 401 GatedRepoError,
# with no token at ~/.cache/huggingface/token and no HF_TOKEN in the environment.
# The arm below is therefore REGISTERED BUT UNVERIFIED — everything is pinned
# except the weights hash, which cannot be computed until the bytes are readable.
DINOV3_REPO_BLOCKED = "facebook/dinov3-vitl16-pretrain-lvd1689m"
DINOV3_BLOCK_REASON = "gated=manual; 401 GatedRepoError with no HF_TOKEN available"

# [REVIEWED] A weights_sha256 of None means "this arm is registered but its bytes
# have never been seen here". load_arm() refuses --verify-weights for such an arm
# and warns on every load; `embed.py --pin-arm-weights <tag>` fills it in.
UNPINNED_WEIGHTS = None

# [MEASURED] The resolution confound was real but has now been SETTLED, on
# 2026-08-02, by running ARM_DINOV2_HIRES (the same DINOv2 weights at 392 px
# instead of 224 px) over the full corpus.
#
# The result went the opposite way to the worry. More pixels made retrieval
# WORSE: R@1 fell from 0.7892 at 224 px to 0.7544 at 392 px, a paired McNemar
# p=2e-81 over 24,648 pairs. So DINOv2's standing was never propped up by
# resolution -- it was the LOWEST-resolution arm in the bake-off and still led.
# Any remaining differences between arms are architectural, not per-pixel budget.
ARM_RESOLUTION_CONFOUND = (
    "settled 2026-08-02: raising DINOv2 from 224 px to 392 px LOWERED R@1 from "
    "0.7892 to 0.7544 (McNemar p=2e-81, n=24648), so the arms' differing input "
    "resolutions do not explain the ranking; the lowest-resolution arm led"
)

# [INHERITED] ImageNet channel statistics, the normalization DINOv2 was trained
# with (from facebook/dinov2-large preprocessor_config.json, read 2026-08-02).
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

# [MEASURED] Every field below was read off the model config or the local
# Hugging Face cache on 2026-08-02, and every weights hash was computed with
# `shasum -a 256` against the file the loader actually opens.
ARMS = {
    ARM_SIGLIP2: {
        "loader": "open_clip",
        "model_id": MODEL_NAME,
        "pretrained": PRETRAINED_TAG,
        "hf_repo": MODEL_HF_REPO,
        "hf_revision": MODEL_HF_REVISION,
        "weights_filename": MODEL_WEIGHTS_FILENAME,
        "weights_sha256": MODEL_WEIGHTS_SHA256,
        "dim": EMBED_DIM,
        "input_side_px": MODEL_INPUT_SIDE_PX,
        "pooling": "attention-pool projection head (open_clip encode_image)",
        "text_aligned": True,
        "legacy_untagged_paths": True,  # the first run predates arm tagging
    },
    ARM_DINOV2: {
        "loader": "hf_dino",
        "model_id": "facebook/dinov2-large",
        "pretrained": None,
        "hf_repo": "facebook/dinov2-large",
        "hf_revision": "47b73eefe95e8d44ec3623f8890bd894b6ea2d6c",
        "weights_filename": "model.safetensors",
        "weights_sha256": (
            "399fba97a95f22c36834418bc69373364a99af3a1153da1c0fb31db567c92e23"
        ),
        "dim": 1024,
        "input_side_px": 224,
        "pooling": "CLS token",
        "text_aligned": False,
        "legacy_untagged_paths": False,
    },
    ARM_DINOV2_HIRES: {
        "loader": "hf_dino",
        "model_id": "facebook/dinov2-large",
        "pretrained": None,
        "hf_repo": "facebook/dinov2-large",
        "hf_revision": "47b73eefe95e8d44ec3623f8890bd894b6ea2d6c",
        "weights_filename": "model.safetensors",
        "weights_sha256": (
            "399fba97a95f22c36834418bc69373364a99af3a1153da1c0fb31db567c92e23"
        ),
        "dim": 1024,
        # 392 = 28 x 14, the nearest multiple of the patch size to SigLIP2's 384.
        # DINOv2 interpolates its position embeddings, so this is supported.
        "input_side_px": 392,
        "pooling": "CLS token",
        "text_aligned": False,
        "legacy_untagged_paths": False,
    },
    ARM_DINOV3: {
        "loader": "hf_dino",
        "model_id": "facebook/dinov3-vitl16-pretrain-lvd1689m",
        "pretrained": None,
        "hf_repo": "facebook/dinov3-vitl16-pretrain-lvd1689m",
        # [MEASURED] Repo metadata stays readable while the weights are gated, so
        # the revision could be pinned before access landed (probed 2026-08-02).
        "hf_revision": "ea8dc2863c51be0a264bab82070e3e8836b02d51",
        "weights_filename": "model.safetensors",
        # [MEASURED] Pinned by `embed.py --pin-arm-weights dinov3-vitl16` on
        # 2026-08-02 after the reviewer's gated-access grant landed.
        "weights_sha256": (
            "dcb2e45127cccbf1601e5f42fef165eea275c8e5213197e8dcf3f48822718179"
        ),
        # [INHERITED] ViT-L/16 is 1024-wide, as its DINOv2 ViT-L/14 counterpart
        # is. Asserted against the loaded model on first successful load.
        "dim": 1024,
        # [REVIEWED] 224 matches the DINOv2 arm exactly, so DINOv3-vs-DINOv2 is a
        # clean architecture comparison with resolution held constant.
        "input_side_px": 224,
        # DINOv3 prepends register tokens after CLS; index 0 is still CLS, so the
        # shared DINO encode path applies unchanged.
        "pooling": "CLS token",
        "text_aligned": False,
        "legacy_untagged_paths": False,
        "gated": True,
    },
    ARM_DINOV3_HPLUS: {
        "loader": "hf_dino",
        "model_id": "facebook/dinov3-vith16plus-pretrain-lvd1689m",
        "pretrained": None,
        "hf_repo": "facebook/dinov3-vith16plus-pretrain-lvd1689m",
        # [MEASURED] refs/main on 2026-08-02, with the reviewer's token in place.
        # Gated the same way as the ViT-L/16 repo, and the same acceptance covers
        # both -- verified by downloading from each before adding this entry.
        "hf_revision": "c807c9eeea853df70aec4069e6f56b28ddc82acc",
        "weights_filename": "model.safetensors",
        # [MEASURED] sha256 of the 3.36 GB checkpoint the loader opens, computed
        # by `embed.py --pin-arm-weights dinov3-vith16plus` on 2026-08-02.
        "weights_sha256": (
            "3e1d4d18b9bfa9f28fad8e9de6a783f1313532d3460efa4cd0b12521d81d1a4d"
        ),
        # [MEASURED] hidden_size from the repo's config.json: 1280, against the
        # ViT-L/16's 1024. 32 layers and 20 heads, against 24 and 16.
        "dim": 1280,
        # [MEASURED] image_size in config.json is 224, identical to the ViT-L/16
        # arm. The two DINOv3 arms therefore differ ONLY in model scale, with no
        # resolution difference to confound the v3-L vs v3-H+ comparison. Its
        # preprocessor_config.json also has no center crop, so the whole-frame
        # squash this pipeline already applies matches the official recipe.
        "input_side_px": 224,
        "pooling": "CLS token",
        "text_aligned": False,
        "legacy_untagged_paths": False,
        "gated": True,
    },
    ARM_PE_CORE: {
        "loader": "open_clip",
        "model_id": "PE-Core-L-14-336",
        "pretrained": "meta",
        "hf_repo": "timm/PE-Core-L-14-336",
        "hf_revision": "8eff41b3f687e50a323662c2dda5eb3588c6dd35",
        "weights_filename": "open_clip_model.safetensors",
        "weights_sha256": (
            "b1fff7093c32a01d98a2d82098f9adf788b30f0efee639916520b3e4302f786b"
        ),
        "dim": 1024,
        "input_side_px": 336,
        "pooling": "attention-pool projection head (open_clip encode_image)",
        "text_aligned": True,
        "legacy_untagged_paths": False,
    },
}

# [REVIEWED] The arm the pipeline runs when none is named. Keeps every existing
# command, and the job currently in flight, behaving exactly as before.
DEFAULT_ARM = ARM_SIGLIP2

# [REVIEWED] Arms the bake-off compares by default. ARM_DINOV2_HIRES is excluded
# because it is a tiebreaker, not a contender — enable it deliberately.
# [REVIEWED] Display order for the bake-off table. This is an ORDERING hint only:
# eval_pairs.discover_arms() derives what actually gets scored from config.ARMS
# plus completeness on disk. It used to be the gate, which is why the
# ARM_DINOV2_HIRES tiebreaker was silently never scored despite having output.
BAKEOFF_ARMS = (
    ARM_SIGLIP2, ARM_DINOV2, ARM_PE_CORE, ARM_DINOV3, ARM_DINOV2_HIRES,
)

BAKEOFF_FILENAME = "bakeoff.json"
