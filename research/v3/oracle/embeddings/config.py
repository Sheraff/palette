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

# [MEASURED] The 21 shard directories that exist at the repository root, listed
# 2026-08-02: 00-09, 0a-0f, 10-14. 7,550 files total, matching spec section 7.
SHARDED_DIR_NAMES = (
    "00", "01", "02", "03", "04", "05", "06", "07", "08", "09",
    "0a", "0b", "0c", "0d", "0e", "0f",
    "10", "11", "12", "13", "14",
)

# [MEASURED] The second collection's root, surveyed in spec section 7.4.
MUSIC_ARTWORKS_DIR_NAME = "music-artworks"

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
