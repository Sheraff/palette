"""Shared machinery for the SAM geometry stage: identity, decode, RLE, sinks, model.

Nothing here prints. Nothing here writes outside research/v3/data/sam/.
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np

import config


# --------------------------------------------------------------------------- small helpers

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, chunk: int = 1 << 22) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def git_head() -> str:
    """Best-effort repo state stamp. Never fails the run, never writes."""
    try:
        out = subprocess.run(["git", "-C", str(config.REPO_ROOT), "rev-parse", "HEAD"],
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() if out.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def concept_set_hash() -> str:
    """Identity of the prompt union. Change a phrasing or the order and every row redoes."""
    payload = json.dumps(list(config.CONCEPT_PROMPTS), separators=(",", ":"))
    return sha256_bytes(payload.encode("utf-8"))


# --------------------------------------------------------------------------- identity

def collection_of(rel_path: str) -> str:
    head = rel_path.split("/", 1)[0]
    if head == config.MUSIC_ARTWORKS_DIR_NAME:
        return config.COLLECTION_MUSIC_ARTWORKS
    if head in config.SHARDED_DIR_NAMES:
        return config.COLLECTION_SHARDED
    # Anything else (e.g. the loose `images/` directory the premise eval set draws on) is
    # named after its top directory rather than silently folded into a real collection.
    return f"other:{head}"


def artwork_id_of(rel_path: str, collection: str) -> str:
    """§9.1: artwork_id is the identity, image_id is a rendition of it.

    sharded: the 24-char suffix of the stem (`sharded-suffix`, as the premise eval set
    calls it). music_artworks: the 32-hex prefix of the basename, before any `_WxH`
    rendition suffix (§7.4). Anything else: the stem, unparsed.
    """
    stem = Path(rel_path).stem
    if collection == config.COLLECTION_SHARDED:
        return stem[-24:] if len(stem) >= 24 else stem
    if collection == config.COLLECTION_MUSIC_ARTWORKS:
        return stem.split("_", 1)[0]
    return stem


@dataclass(frozen=True)
class ImageRef:
    rel_path: str
    abs_path: Path
    collection: str
    image_id: str
    artwork_id: str

    @staticmethod
    def from_rel(rel_path: str) -> "ImageRef":
        rel_path = rel_path.strip().lstrip("./")
        collection = collection_of(rel_path)
        return ImageRef(
            rel_path=rel_path,
            abs_path=config.REPO_ROOT / rel_path,
            collection=collection,
            # image_id is the rendition. For music_artworks the basename alone is not
            # unique across the hash fan-out in principle, so the relative path is the id.
            image_id=(Path(rel_path).name if collection == config.COLLECTION_SHARDED
                      else rel_path),
            artwork_id=artwork_id_of(rel_path, collection),
        )


def read_list_file(path: Path) -> list[ImageRef]:
    """One repo-relative path per line. `#` comments and blank lines ignored."""
    refs = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        refs.append(ImageRef.from_rel(line))
    return refs


def eval_set_refs() -> list[ImageRef]:
    """The 142 included premise eval-set images — the standard small run."""
    doc = json.loads(config.EVAL_SET_PATH.read_text())
    return [ImageRef.from_rel(e["image"]["imagePath"]) for e in doc["entries"] if e["included"]]


def enumerate_collection(collection: str) -> list[ImageRef]:
    """Sorted, so work order is identical on every run (embeddings/common.py does the same)."""
    paths: list[str] = []
    if collection == config.COLLECTION_SHARDED:
        for name in config.SHARDED_DIR_NAMES:
            shard = config.REPO_ROOT / name
            if not shard.is_dir():
                raise FileNotFoundError(f"missing shard directory: {shard}")
            paths += [str(p.relative_to(config.REPO_ROOT)) for p in shard.iterdir()
                      if p.is_file() and not p.name.startswith(".")]
    elif collection == config.COLLECTION_MUSIC_ARTWORKS:
        base = config.REPO_ROOT / config.MUSIC_ARTWORKS_DIR_NAME
        if not base.is_dir():
            raise FileNotFoundError(f"missing collection directory: {base}")
        paths += [str(p.relative_to(config.REPO_ROOT)) for p in base.rglob("*")
                  if p.is_file() and not p.name.startswith(".")]
    else:
        raise ValueError(f"unknown collection: {collection}")
    paths.sort()
    return [ImageRef.from_rel(p) for p in paths]


# --------------------------------------------------------------------------- decode

_avif_registered = False


def register_image_plugins() -> None:
    """Over half of music-artworks is AVIF (§7.4.1 trap 3)."""
    global _avif_registered
    if _avif_registered:
        return
    try:
        import pillow_avif  # noqa: F401  (import registers the plugin with PIL)
    except ImportError:
        pass
    _avif_registered = True


def decode_image(path: Path, cap_px: int = config.RESOLUTION_CAP_PX):
    """Return (PIL RGB image, source_long_edge, processed_long_edge).

    Dimensions come from the decoded header, never the filename (§7.4.1 trap 1).
    Downscale only — never upscale (PHASE_0_DECISIONS §1).
    """
    from PIL import Image, ImageOps

    register_image_plugins()
    image = Image.open(path)
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    source_long_edge = max(image.size)
    if cap_px and source_long_edge > cap_px:
        scale = cap_px / source_long_edge
        target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(target, Image.LANCZOS)
    return image, source_long_edge, max(image.size)


# --------------------------------------------------------------------------- COCO RLE

def rle_encode(mask: np.ndarray) -> str:
    """Binary mask (H,W) -> COCO compressed-RLE counts string.

    Column-major runs starting with a zero-run, delta-coded from index 2, packed 5 bits
    per character with a continuation bit at 0x20 and a sign bit at 0x10, offset by 48.
    Byte-identical to pycocotools.mask.encode()['counts'].
    """
    flat = np.asarray(mask, dtype=np.uint8).reshape(-1, order="F")
    if flat.size == 0:
        return ""
    # Run boundaries. The first run is always the count of zeros, possibly 0.
    changes = np.flatnonzero(flat[1:] != flat[:-1]) + 1
    edges = np.concatenate(([0], changes, [flat.size]))
    counts = np.diff(edges).tolist()
    if flat[0] == 1:
        counts = [0] + counts

    out: list[str] = []
    for i, value in enumerate(counts):
        x = int(value)
        if i > 2:
            x -= int(counts[i - 2])
        more = True
        while more:
            c = x & 0x1F
            x >>= 5  # arithmetic shift; matches C's >> on signed ints in pycocotools
            if c & 0x10:
                more = x != -1
            else:
                more = x != 0
            if more:
                c |= 0x20
            out.append(chr(c + 48))
    return "".join(out)


def rle_decode_counts(counts_str: str) -> list[int]:
    counts: list[int] = []
    p = 0
    n = len(counts_str)
    while p < n:
        x = 0
        k = 0
        more = True
        while more:
            c = ord(counts_str[p]) - 48
            p += 1
            x |= (c & 0x1F) << (5 * k)
            more = bool(c & 0x20)
            k += 1
            if not more and (c & 0x10):
                x |= -1 << (5 * k)
        if len(counts) > 2:
            x += counts[-2]
        counts.append(x)
    return counts


def rle_decode(counts_str: str, height: int, width: int) -> np.ndarray:
    flat = np.zeros(height * width, dtype=np.uint8)
    pos = 0
    value = 0
    for run in rle_decode_counts(counts_str):
        if value:
            flat[pos:pos + run] = 1
        pos += run
        value ^= 1
    return flat.reshape((height, width), order="F")


# --------------------------------------------------------------------------- sinks

class JsonlSink:
    """Append-only JSONL, flushed and fsynced after every record (§5.1). Never truncates."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = open(path, "a", encoding="utf-8")

    def write(self, record: dict[str, Any]) -> None:
        self._handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        self._handle.flush()
        os.fsync(self._handle.fileno())

    def close(self) -> None:
        self._handle.close()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # A record truncated by a hard kill mid-write. Drop it; the work redoes.
                continue
    return rows


def row_key(image_sha256: str) -> str:
    """Resume identity, per image. Excludes run_id so a resumed run skips work an earlier
    run already did with the same weights, prompts and threshold (§5.1). Includes every
    knob that changes the answer, so changing one re-runs everything.
    """
    return "|".join([
        image_sha256,
        config.SCHEMA_VERSION,
        config.MODEL_REVISION,
        concept_set_hash()[:16],
        f"{config.SCORE_THRESHOLD:g}",
        f"{config.RESOLUTION_CAP_PX:d}",
    ])


# Per-image statuses that mean "this image is settled, do not queue it again". 'failed' is
# terminal and queryable (§5.1); 'duplicate' records a path whose identical bytes were processed
# under another path, and is terminal for the same reason.
TERMINAL_IMAGE_STATUSES = ("ok", "failed", "duplicate")


def completed_keys(path: Path) -> set[str]:
    """Keys carrying a terminal per-image row."""
    return {r["row_key"] for r in read_jsonl(path)
            if r.get("record_type") == config.RECORD_TYPE_IMAGE
            and r.get("status") in TERMINAL_IMAGE_STATUSES and "row_key" in r}


def completed_paths(path: Path) -> set[str]:
    """Image paths that already carry a terminal per-image row.

    Keyed by path, not by content hash: the resume key is the content hash, so on a collection run
    two paths with identical bytes share one key and only one of them ever gets a real row. This
    is how the runner tells "the second path of a duplicate pair, which still needs its own
    marker" from "a path that already has one".
    """
    return {r["image_path"] for r in read_jsonl(path)
            if r.get("record_type") == config.RECORD_TYPE_IMAGE
            and r.get("status") in TERMINAL_IMAGE_STATUSES and "image_path" in r}


class AttemptLedger:
    """Per-image attempt counter, persisted BEFORE inference (§5.1).

    Without this, an image that reliably crashes the process leaves no row, the supervisor
    restarts, the queue is unchanged, and the run spins forever producing nothing.
    """

    def __init__(self, path: Path):
        self.path = path
        self.counts: dict[str, int] = {}
        for row in read_jsonl(path):
            key = row.get("row_key")
            if key:
                self.counts[key] = max(self.counts.get(key, 0), int(row.get("attempt", 0)))
        path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = open(path, "a", encoding="utf-8")

    def attempts(self, key: str) -> int:
        return self.counts.get(key, 0)

    def record(self, key: str, rel_path: str) -> int:
        attempt = self.counts.get(key, 0) + 1
        self.counts[key] = attempt
        self._handle.write(json.dumps(
            {"row_key": key, "attempt": attempt, "image_path": rel_path,
             "started_at": utc_now()}) + "\n")
        self._handle.flush()
        os.fsync(self._handle.fileno())
        return attempt

    def close(self) -> None:
        self._handle.close()


# --------------------------------------------------------------------------- the model

@dataclass
class SamRuntime:
    model: Any
    processor: Any
    predictor: Any
    snapshot_path: Path
    load_seconds: float
    runtime_version: str
    mlx_version: str


def snapshot_path() -> Path:
    from mlx_vlm.utils import get_model_path
    return Path(get_model_path(config.MODEL_REPO, revision=config.MODEL_REVISION))


def load_sam(score_threshold: float = config.SCORE_THRESHOLD,
             verify_weights: bool = True) -> SamRuntime:
    """Load SAM 3.1 from the MLX bf16 snapshot.

    See config.WEIGHT_LOAD_NOTE: mlx_vlm.utils.load_model() double-transposes the conv
    weights for this repo, so the weights are loaded straight onto a Model built from its
    own config, strict=True (which is what proves nothing was skipped).
    """
    import mlx.core as mx
    import mlx_vlm
    from mlx_vlm.utils import load_config
    from mlx_vlm.models.sam3_1 import Model, ModelConfig
    from mlx_vlm.models.sam3_1.processing_sam3_1 import Sam31Processor
    from mlx_vlm.models.sam3.generate import Sam3Predictor

    path = snapshot_path()
    if verify_weights:
        actual = sha256_file(path / config.MODEL_WEIGHTS_FILE)
        if actual != config.MODEL_WEIGHTS_SHA256:
            raise RuntimeError(
                f"weights hash mismatch: {actual} != pinned {config.MODEL_WEIGHTS_SHA256}")

    started = time.time()
    cfg = load_config(str(path), trust_remote_code=True)
    model = Model(ModelConfig.from_dict(cfg))
    weights: dict[str, Any] = {}
    for f in sorted(glob.glob(os.path.join(path, "*.safetensors"))):
        weights.update(mx.load(f))
    model.load_weights(list(weights.items()), strict=True)
    model.eval()
    mx.eval(model.parameters())
    processor = Sam31Processor.from_pretrained(str(path))
    predictor = Sam3Predictor(model, processor, score_threshold=score_threshold)
    load_seconds = time.time() - started

    return SamRuntime(
        model=model,
        processor=processor,
        predictor=predictor,
        snapshot_path=path,
        load_seconds=load_seconds,
        runtime_version=mlx_vlm.__version__,
        mlx_version=mx.__version__,
    )


# --------------------------------------------------------------------------- inference

@dataclass
class Instance:
    concept: str
    instance_idx: int
    score: float
    bbox: tuple[float, float, float, float]   # normalized x, y, w, h
    area_fraction: float
    mask: np.ndarray                          # (H, W) uint8


@dataclass
class ImageResult:
    instances: list[Instance] = field(default_factory=list)
    seconds_by_concept: dict[str, float] = field(default_factory=dict)
    seconds_total: float = 0.0
    height: int = 0
    width: int = 0


def segment_concepts(runtime: SamRuntime, image, prompts=config.CONCEPT_PROMPTS) -> ImageResult:
    """Run the whole prompt union over one image.

    mlx-vlm's predict_multi runs the vision backbone once and then text+DETR+mask head per
    prompt, with NMS applied per prompt and never across prompts — which is exactly the
    §9.2 row grain (image, concept, instance). Instances keep their concept label.
    """
    from mlx_vlm.models.sam3_1.generate import predict_multi

    width, height = image.size
    result = ImageResult(height=height, width=width)
    pixel_area = float(height * width)

    started_all = time.time()
    prompt_texts = [text for _, text in prompts]
    concept_of_prompt = {text: concept for concept, text in prompts}
    started = time.time()
    detections = predict_multi(runtime.predictor, image, prompt_texts)
    elapsed = time.time() - started

    per_concept_counts: dict[str, int] = {concept: 0 for concept, _ in prompts}
    labels = detections.labels or []
    for i in range(len(detections.scores)):
        prompt_text = labels[i] if i < len(labels) else prompt_texts[0]
        concept = concept_of_prompt.get(prompt_text, prompt_text)
        mask = np.asarray(detections.masks[i], dtype=np.uint8)
        if mask.shape != (height, width):
            # Defensive: postprocess resizes to the image, but a 0-detection path returns
            # a (0,1,1) placeholder and a future version could change the contract.
            from PIL import Image as _Image
            mask = np.asarray(
                _Image.fromarray(mask * 255).resize((width, height), _Image.NEAREST)
            ) // 255
        x0, y0, x1, y1 = (float(v) for v in detections.boxes[i])
        # Clamp per axis. mlx-vlm clamps both axes to max(H,W), which is wrong for
        # non-square images (§7.4.2: banners are 400x155).
        x0 = min(max(x0, 0.0), width)
        x1 = min(max(x1, 0.0), width)
        y0 = min(max(y0, 0.0), height)
        y1 = min(max(y1, 0.0), height)
        idx = per_concept_counts[concept]
        per_concept_counts[concept] = idx + 1
        result.instances.append(Instance(
            concept=concept,
            instance_idx=idx,
            score=float(detections.scores[i]),
            bbox=(x0 / width, y0 / height, (x1 - x0) / width, (y1 - y0) / height),
            area_fraction=float(mask.sum()) / pixel_area,
            mask=mask,
        ))

    # predict_multi shares one backbone pass across prompts, so per-concept time is not
    # separable. Record the shared cost once under the whole union.
    result.seconds_by_concept = {"__union__": elapsed}
    result.seconds_total = time.time() - started_all
    return result


def union_mask(instances: Iterable[Instance], height: int, width: int) -> np.ndarray:
    out = np.zeros((height, width), dtype=np.uint8)
    for inst in instances:
        out |= (inst.mask != 0)
    return out


# --------------------------------------------------------------------------- provenance

def _pkg_version(name: str) -> str:
    from importlib.metadata import PackageNotFoundError, version
    try:
        return version(name)
    except PackageNotFoundError:
        return "unknown"


def provenance(run_id: str, runtime: SamRuntime | None = None) -> dict[str, Any]:
    """§5.2: enough in every row to answer 'could I regenerate this?'."""
    return {
        "run_id": run_id,
        "schema_version": config.SCHEMA_VERSION,
        "model_id": config.MODEL_REPO,
        "model_revision": config.MODEL_REVISION,
        "model_weights_sha256": config.MODEL_WEIGHTS_SHA256,
        "quantization": config.MODEL_QUANTIZATION,
        "runtime_version": (f"{config.RUNTIME_PACKAGE}=={runtime.runtime_version}"
                            if runtime else
                            f"{config.RUNTIME_PACKAGE}=={_pkg_version('mlx-vlm')}"),
        "mlx_version": runtime.mlx_version if runtime else _pkg_version("mlx"),
        "concept_set_hash": concept_set_hash(),
        "concepts": [c for c, _ in config.CONCEPT_PROMPTS],
        "score_threshold": config.SCORE_THRESHOLD,
        "resolution_cap": config.RESOLUTION_CAP_PX,
        "git_head": git_head(),
    }
