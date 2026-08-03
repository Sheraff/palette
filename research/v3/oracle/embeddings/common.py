"""Shared pieces for the embedding stage: enumeration, hashing, decoding, storage.

Storage shape (spec section 6.3, task spec item 5), all under
research/v3/data/embeddings/:

  shards/<collection>.f32   append-only raw little-endian float32, EMBED_DIM per
                            row, written and flushed per batch. This is the file
                            the run appends to; it is what makes the run killable.
  <collection>.ids.jsonl    one JSON line per file that was attempted, appended in
                            the same order. `status` is "ok" or "failed". An "ok"
                            line carries `row`, the index of its vector in the
                            shard file. A "failed" line carries `row: null`, the
                            exception class and the attempt count. Failures are
                            rows, never absences (spec section 5.1).
  shards/<collection>.attempts.jsonl
                            one line appended immediately before each decode
                            attempt. This is the persisted attempt counter that
                            survives a hard crash, which the ids file cannot do
                            because a crashed attempt never gets to write an
                            outcome. Run-internal; not committed.
  <collection>.npy          the finalized N x EMBED_DIM float32 array, written
                            from the shard file once the queue is empty.

The shard file is always written and flushed before the ids line that describes
it, so on restart the shard can be longer than the ids file but never shorter.
Recovery truncates the shard back to `ok_rows * EMBED_DIM * 4` bytes.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import config


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# --------------------------------------------------------------------------
# Enumeration
# --------------------------------------------------------------------------


class CorpusSizeMismatch(RuntimeError):
    """A collection enumerated to a different file count than the pinned one."""


def enumerate_collection(collection: str, repo_root: Path | None = None,
                         expect_pinned_count: bool = True) -> list[str]:
    """Return every file in a collection as a path relative to the repo root.

    Sorted, so the work order is identical on every run and a resumed run picks up
    exactly where it left off. Identity downstream is (path, sha256) per
    CONVENTIONS.md; no id prefix is parsed here.

    The count is asserted against `config.EXPECTED_FILE_COUNTS`. This list is the
    denominator behind every completeness check on this side of the codebase
    (`eval_pairs.discover_arms`, `embed.py`), so a short enumeration does not
    fail — it makes a truncated arm certify itself complete (adversarial review
    2026-08-03, MINOR-11). Pass `expect_pinned_count=False` only when the corpus
    is deliberately being changed, and re-pin the constant in the same commit.
    """
    root = repo_root or config.REPO_ROOT
    paths: list[str] = []

    if collection == config.COLLECTION_SHARDED:
        for dir_name in config.SHARDED_DIR_NAMES:
            shard_dir = root / dir_name
            if not shard_dir.is_dir():
                raise FileNotFoundError(f"missing shard directory: {shard_dir}")
            for entry in shard_dir.iterdir():
                if entry.is_file() and not entry.name.startswith("."):
                    paths.append(str(entry.relative_to(root)))
    elif collection == config.COLLECTION_MUSIC_ARTWORKS:
        base = root / config.MUSIC_ARTWORKS_DIR_NAME
        if not base.is_dir():
            raise FileNotFoundError(f"missing collection directory: {base}")
        for entry in base.rglob("*"):
            if entry.is_file() and not entry.name.startswith("."):
                paths.append(str(entry.relative_to(root)))
    else:
        raise ValueError(f"unknown collection: {collection}")

    paths.sort()

    # Only the real corpus is measured against the pinned counts. A different
    # root is a different corpus by definition (selftest.py builds a five-file
    # synthetic one), so the numbers do not apply there.
    expected = config.EXPECTED_FILE_COUNTS.get(collection)
    if root != config.PINNED_CORPUS_ROOT:
        expected = None
    if expect_pinned_count and expected is not None and len(paths) != expected:
        raise CorpusSizeMismatch(
            f"{collection}: enumerated {len(paths)} files under {root}, but "
            f"config.EXPECTED_FILE_COUNTS pins {expected}. Every stored count "
            "(bake-off pool size, census pool, coverage-set universe) was "
            "computed over the pinned corpus, so continuing would compare new "
            "numbers against old ones. Either restore the missing files, or "
            "re-pin the constant deliberately and regenerate everything "
            "downstream."
        )
    return paths


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(config.HASH_CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


# --------------------------------------------------------------------------
# Decoding
# --------------------------------------------------------------------------

_avif_registered = False


def register_image_plugins() -> None:
    """Enable AVIF decoding. Over half of music-artworks is AVIF (spec 7.4.1)."""
    global _avif_registered
    if _avif_registered:
        return
    import pillow_avif  # noqa: F401  (import registers the plugin with PIL)

    _avif_registered = True


@dataclass(frozen=True)
class DecodedImage:
    rgb: object  # PIL.Image.Image in RGB mode
    width: int
    height: int
    format_name: str


def decode_image(abs_path: Path) -> DecodedImage:
    """Open a file and return it as RGB, with header-derived dimensions.

    Dimensions come from the decoded header, never the filename — 719 AVIFs in
    music-artworks disagree with their own filename (CONVENTIONS.md, spec 7.4.1).
    """
    from PIL import Image, ImageOps

    register_image_plugins()

    size_bytes = abs_path.stat().st_size
    if size_bytes < config.MIN_PLAUSIBLE_IMAGE_BYTES:
        raise ValueError(f"file too small to be an image: {size_bytes} bytes")

    with Image.open(abs_path) as opened:
        format_name = (opened.format or "unknown").lower()
        opened = ImageOps.exif_transpose(opened) or opened
        width, height = opened.size
        if opened.mode in ("RGBA", "LA", "PA") or (
            opened.mode == "P" and "transparency" in opened.info
        ):
            with_alpha = opened.convert("RGBA")
            background = Image.new(
                "RGB", with_alpha.size, config.ALPHA_FLATTEN_BACKGROUND_RGB
            )
            background.paste(with_alpha, mask=with_alpha.split()[-1])
            rgb = background
        else:
            rgb = opened.convert("RGB")

    return DecodedImage(rgb=rgb, width=width, height=height, format_name=format_name)


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------


def resolve_device(requested: str) -> str:
    import torch

    if requested != "auto":
        return requested
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def observed_model_revision(repo: str | None = None) -> str | None:
    """Read the commit the local Hugging Face cache resolved a model repo to."""
    from huggingface_hub import constants as hf_constants

    repo = repo or config.MODEL_HF_REPO
    cache_dir = Path(hf_constants.HF_HUB_CACHE)
    repo_dir = cache_dir / ("models--" + repo.replace("/", "--"))
    ref_file = repo_dir / "refs" / "main"
    if not ref_file.is_file():
        return None
    return ref_file.read_text().strip()


def model_weights_path(
    repo: str | None = None, revision: str | None = None, filename: str | None = None
) -> Path | None:
    from huggingface_hub import constants as hf_constants

    repo = repo or config.MODEL_HF_REPO
    revision = revision or config.MODEL_HF_REVISION
    filename = filename or config.MODEL_WEIGHTS_FILENAME
    cache_dir = Path(hf_constants.HF_HUB_CACHE)
    repo_dir = cache_dir / ("models--" + repo.replace("/", "--"))
    candidate = repo_dir / "snapshots" / revision / filename
    return candidate if candidate.exists() else None


# --------------------------------------------------------------------------
# Arms
# --------------------------------------------------------------------------


class ArmRuntime:
    """One loaded model arm. Every arm exposes the same encode() contract."""

    def __init__(self, tag: str, spec: dict, model, preprocess, device: str, encode_fn):
        self.tag = tag
        self.spec = spec
        self.model = model
        self.preprocess = preprocess
        self.device = device
        self.dim = spec["dim"]
        self._encode_fn = encode_fn

    def encode(self, pil_images: list):
        """PIL images in, L2-normalized float32 (n, dim) numpy out."""
        import torch

        tensors = [self.preprocess(image) for image in pil_images]
        batch = torch.stack(tensors).to(self.device)
        with torch.no_grad():
            vectors = self._encode_fn(self.model, batch)
            vectors = vectors / vectors.norm(dim=-1, keepdim=True)
        return vectors.to("cpu").float().numpy()


def _dino_preprocess(side: int):
    """Whole-image square resize + ImageNet normalize, deliberately no crop.

    The stock DINOv2 processor resizes the short edge to 256 and center-crops to
    224, which throws away a border ring. Album art puts titles, logos and
    advisory badges at the edges, and the other arms in the bake-off squash the
    whole frame, so cropping here would both lose content and confound the
    comparison. Framing is therefore identical across arms; only resolution
    differs (config.ARM_RESOLUTION_CONFOUND).
    """
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize(
                (side, side),
                interpolation=transforms.InterpolationMode.BICUBIC,
                antialias=True,
            ),
            transforms.ToTensor(),
            transforms.Normalize(mean=config.IMAGENET_MEAN, std=config.IMAGENET_STD),
        ]
    )


def _encode_open_clip(model, batch):
    return model.encode_image(batch)


def _encode_dino_cls(model, batch):
    # CLS token: the standard DINOv2 global descriptor for instance retrieval.
    return model(pixel_values=batch).last_hidden_state[:, 0]


def load_arm(tag: str, device: str, verify_revision: bool = True,
             verify_weights: bool = False) -> ArmRuntime:
    """Load one bake-off arm by tag."""
    import torch

    if tag not in config.ARMS:
        raise ValueError(f"unknown arm {tag!r}; known: {sorted(config.ARMS)}")
    spec = config.ARMS[tag]

    if verify_revision:
        observed = observed_model_revision(spec["hf_repo"])
        if observed is not None and observed != spec["hf_revision"]:
            raise RuntimeError(
                f"arm {tag}: revision drift. config pins {spec['hf_revision']}, "
                f"hub cache holds {observed}. Embeddings from different weights "
                "are not comparable; re-pin config.py deliberately."
            )

    if spec.get("weights_sha256") is None:
        # Registered but never seen here. Say so on every load rather than
        # letting an unpinned arm quietly produce a committed artifact.
        print(
            f"[warn] arm {tag} has no pinned weights hash. Its output is not "
            f"reproducible from this repo alone. Run "
            f"`embed.py --pin-arm-weights {tag}` once the weights are readable.",
            flush=True,
        )
        if verify_weights:
            raise RuntimeError(
                f"arm {tag}: --verify-weights was requested but config pins no "
                "hash for this arm. Pin it first with --pin-arm-weights."
            )
    elif verify_weights:
        path = model_weights_path(
            spec["hf_repo"], spec["hf_revision"], spec["weights_filename"]
        )
        if path is None:
            raise RuntimeError(f"arm {tag}: weights not found in the hub cache")
        actual = sha256_file(path)
        if actual != spec["weights_sha256"]:
            raise RuntimeError(
                f"arm {tag}: weights hash mismatch. expected "
                f"{spec['weights_sha256']}, got {actual}"
            )

    if spec["loader"] == "open_clip":
        import open_clip

        model, _, preprocess = open_clip.create_model_and_transforms(
            spec["model_id"], pretrained=spec["pretrained"]
        )
        encode_fn = _encode_open_clip
    elif spec["loader"] == "hf_dino":
        from transformers import AutoModel

        model = AutoModel.from_pretrained(
            spec["model_id"], revision=spec["hf_revision"]
        )
        preprocess = _dino_preprocess(spec["input_side_px"])
        encode_fn = _encode_dino_cls
    else:
        raise ValueError(f"arm {tag}: unknown loader {spec['loader']!r}")

    model.eval()
    model.to(device)
    for param in model.parameters():
        param.requires_grad_(False)
    torch.set_grad_enabled(False)

    return ArmRuntime(tag, spec, model, preprocess, device, encode_fn)


def arm_readiness(tag: str) -> dict:
    """Can this arm run right now, offline? Cheap, no network, no model load."""
    spec = config.ARMS[tag]
    weights = model_weights_path(
        spec["hf_repo"], spec["hf_revision"], spec["weights_filename"]
    )
    observed = observed_model_revision(spec["hf_repo"])
    return {
        "arm": tag,
        "weights_cached": weights is not None,
        "hash_pinned": spec.get("weights_sha256") is not None,
        "revision_pinned": spec["hf_revision"],
        "revision_observed": observed,
        "revision_matches": observed is None or observed == spec["hf_revision"],
        "gated": bool(spec.get("gated")),
        "ready": weights is not None and spec.get("weights_sha256") is not None,
    }


def pin_arm_weights(tag: str) -> dict:
    """Download an arm's weights if needed and compute the hash to pin in config."""
    from huggingface_hub import hf_hub_download

    spec = config.ARMS[tag]
    path = model_weights_path(
        spec["hf_repo"], spec["hf_revision"], spec["weights_filename"]
    )
    if path is None:
        path = Path(
            hf_hub_download(
                spec["hf_repo"],
                spec["weights_filename"],
                revision=spec["hf_revision"],
            )
        )
    digest = sha256_file(path)
    return {
        "arm": tag,
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": digest,
        "already_pinned": spec.get("weights_sha256"),
        "matches_pin": spec.get("weights_sha256") == digest,
    }


def runtime_versions() -> dict[str, str]:
    import numpy
    import open_clip
    import PIL
    import torch

    import pillow_avif  # noqa: F401

    from importlib.metadata import version as pkg_version

    try:
        avif_version = pkg_version("pillow-avif-plugin")
    except Exception:
        avif_version = "unknown"

    versions = {
        "python": sys.version.split()[0],
        "torch": torch.__version__,
        "open_clip_torch": open_clip.__version__,
        "pillow": PIL.__version__,
        "pillow_avif_plugin": avif_version,
        "numpy": numpy.__version__,
    }
    for optional in ("transformers", "torchvision"):
        try:
            versions[optional] = pkg_version(optional)
        except Exception:
            versions[optional] = "not installed"
    return versions


# --------------------------------------------------------------------------
# Output store
# --------------------------------------------------------------------------


def has_legacy_untagged_output(out_dir: Path) -> bool:
    """Did an earlier, pre-bake-off run write untagged filenames here?

    The first SigLIP2 run predates arm tagging and wrote `<collection>.ids.jsonl`.
    That run must stay resumable, and the *whole* run has to agree on one naming
    scheme — so the check looks across every collection, not just the one being
    opened. Otherwise a job interrupted after `sharded` but before
    `music_artworks` would resume writing half untagged and half tagged names.
    """
    shard_dir = out_dir / config.SHARD_SUBDIR_NAME
    for collection in config.COLLECTIONS:
        if (out_dir / f"{collection}.ids.jsonl").exists():
            return True
        if (shard_dir / f"{collection}.f32").exists():
            return True
    return False


def resolve_store_stem(out_dir: Path, collection: str, arm_tag: str) -> str:
    """Filename stem for one (collection, arm): tagged, unless legacy output exists."""
    spec = config.ARMS.get(arm_tag, {})
    if spec.get("legacy_untagged_paths") and has_legacy_untagged_output(out_dir):
        return collection
    return f"{collection}.{arm_tag}"


class EmbeddingStore:
    """Append-only, resumable, killable storage for one (collection, arm)."""

    def __init__(
        self,
        out_dir: Path,
        collection: str,
        dim: int | None = None,
        arm_tag: str = config.DEFAULT_ARM,
    ):
        self.collection = collection
        self.arm_tag = arm_tag
        self.dim = dim if dim is not None else config.ARMS[arm_tag]["dim"]
        self.out_dir = out_dir
        self.shard_dir = out_dir / config.SHARD_SUBDIR_NAME
        self.shard_dir.mkdir(parents=True, exist_ok=True)

        self.stem = resolve_store_stem(out_dir, collection, arm_tag)
        self.shard_path = self.shard_dir / f"{self.stem}.f32"
        self.ids_path = out_dir / f"{self.stem}.ids.jsonl"
        # Run-internal, not a deliverable, so it lives under the gitignored
        # shards/ directory rather than next to the committed id index.
        self.attempts_path = self.shard_dir / f"{self.stem}.attempts.jsonl"
        self.npy_path = out_dir / f"{self.stem}.npy"

        self._shard_handle = None
        self._ids_handle = None
        self._attempts_handle = None

        self.ok_paths: set[str] = set()
        self.failed_paths: set[str] = set()
        self.attempts_by_path: dict[str, int] = {}
        self.n_rows = 0

    # -- recovery -----------------------------------------------------------

    def recover(self, read_only: bool = False) -> dict:
        """Read the output back, repair a torn write, and report what was found.

        `read_only=True` inspects without repairing. Anything that is not the
        writer must pass it: a torn shard is indistinguishable from a shard that
        a *live* writer has extended but not yet described in the id index, so
        repairing from a second process would delete a running job's work.
        """
        row_count = 0
        for record in read_jsonl(self.ids_path):
            path = record.get("path")
            if record.get("status") == "ok":
                self.ok_paths.add(path)
                row_count += 1
            else:
                self.failed_paths.add(path)

        for record in read_jsonl(self.attempts_path):
            path = record.get("path")
            if path is not None:
                self.attempts_by_path[path] = self.attempts_by_path.get(path, 0) + 1

        expected_bytes = row_count * self.dim * config.BYTES_PER_FLOAT32
        actual_bytes = self.shard_path.stat().st_size if self.shard_path.exists() else 0
        truncated_bytes = 0
        if actual_bytes > expected_bytes:
            # A kill between the vector write and its ids line. The vector is
            # unreferenced; drop it and let the file be re-embedded. Only the
            # writer may do this — see the read_only note above.
            truncated_bytes = actual_bytes - expected_bytes
            if not read_only:
                with self.shard_path.open("r+b") as handle:
                    handle.truncate(expected_bytes)
        elif actual_bytes < expected_bytes:
            raise RuntimeError(
                f"{self.shard_path} is shorter than {self.ids_path} implies "
                f"({actual_bytes} < {expected_bytes} bytes). The output is "
                "inconsistent; inspect before resuming."
            )

        self.n_rows = row_count
        return {
            "ok_rows": row_count,
            "failed_rows": len(self.failed_paths),
            "truncated_bytes": truncated_bytes,
            "paths_with_recorded_attempts": len(self.attempts_by_path),
        }

    # -- append -------------------------------------------------------------

    def open(self) -> None:
        self._shard_handle = self.shard_path.open("ab")
        self._ids_handle = self.ids_path.open("a", encoding="utf-8")
        self._attempts_handle = self.attempts_path.open("a", encoding="utf-8")

    def close(self) -> None:
        for handle in (self._shard_handle, self._ids_handle, self._attempts_handle):
            if handle is not None:
                handle.flush()
                os.fsync(handle.fileno())
                handle.close()
        self._shard_handle = self._ids_handle = self._attempts_handle = None

    def record_attempt(self, path: str) -> None:
        self.attempts_by_path[path] = self.attempts_by_path.get(path, 0) + 1
        line = json.dumps(
            {"path": path, "at": utc_now_iso(), "pid": os.getpid()},
            separators=(",", ":"),
        )
        self._attempts_handle.write(line + "\n")
        self._attempts_handle.flush()

    def append_vectors(self, vectors) -> list[int]:
        """Write vectors to the shard file first, then return their row indices."""
        import numpy as np

        array = np.ascontiguousarray(vectors, dtype="<f4")
        if array.ndim != 2 or array.shape[1] != self.dim:
            raise ValueError(f"expected (n, {self.dim}) vectors, got {array.shape}")
        self._shard_handle.write(array.tobytes(order="C"))
        self._shard_handle.flush()
        os.fsync(self._shard_handle.fileno())
        rows = list(range(self.n_rows, self.n_rows + array.shape[0]))
        self.n_rows += array.shape[0]
        return rows

    def append_id_row(self, record: dict) -> None:
        self._ids_handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        self._ids_handle.flush()
        if record.get("status") == "ok":
            self.ok_paths.add(record["path"])
        else:
            self.failed_paths.add(record["path"])

    # -- finalize -----------------------------------------------------------

    def finalize_npy(self):
        import numpy as np

        rows = self.n_rows
        expected = rows * self.dim * config.BYTES_PER_FLOAT32
        actual = self.shard_path.stat().st_size if self.shard_path.exists() else 0
        if actual != expected:
            raise RuntimeError(
                f"cannot finalize: shard is {actual} bytes, expected {expected}"
            )
        array = np.fromfile(self.shard_path, dtype="<f4")
        array = array.reshape(rows, self.dim) if rows else array.reshape(0, self.dim)
        np.save(self.npy_path, array)
        return array


def read_jsonl(path: Path) -> Iterator[dict]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                # A kill mid-line leaves a partial final record. It describes work
                # that was not confirmed, so dropping it is correct.
                continue
