"""SAM 3.1 point-prompt segmentation — our adapter over the already-loaded model tree.

Why this file exists
--------------------
The pinned snapshot `mlx-community/sam3.1-bf16` carries 145 tensors of interactive
point-prompt machinery (`tracker_model.interactive_sam_prompt_encoder.*` 14,
`tracker_model.interactive_sam_mask_decoder.*` 131, plus the detector's three point
projections). `common.load_sam()` loads all of them `strict=True` on every run. Nothing in
mlx-vlm 0.6.8 calls the interactive decoder: `MultiplexTrackerModel.track_step` encodes
prompts with `interactive_sam_prompt_encoder` and then decodes with `sam_mask_decoder` —
the 16-object *propagation* decoder. There is no single-image point entry point in the
package's public API at all.

This module adds that path **in our code**. It does not patch mlx-vlm. It reuses the live
module tree that `common.load_sam()` returns (which it must build by hand anyway, see
`config.WEIGHT_LOAD_NOTE`), so no weights are reloaded and no download happens.

Three deviations from what the package does, each deliberate and each recorded:

1. **The interactive FPN is computed.** `Model._get_tracker_features` calls the neck with
   `need_interactive=False`; we call it with `need_interactive=True` and use those
   features. The neck has its own `interactive_convs` and simply is never asked for them.

2. **The interactive decoder is called.** `interactive_sam_mask_decoder` has
   `multiplex_count=1` and `num_multimask_outputs=4` — built specifically for point/box
   prompts on a single object — versus the propagation decoder's 16-object multiplex.
   `DECODER_PROPAGATION` keeps the package's behaviour available for A/B.

3. **High-res skip features are passed in the order the decoder actually consumes.**
   `MultiplexMaskDecoder` adds `high_res_features[0]` after the first 2x upscale (72->144)
   and `high_res_features[1]` after the second (144->288). The FPN returns scales
   `[4x=288, 2x=144, 1x=72]`, and `Model.track_step` forwards `[fpn[0], fpn[1]]` —
   i.e. (288, 144), which fails both of the decoder's shape guards and silently drops both
   skip connections. We pass `[fpn[1], fpn[0]]` = (144, 288). See `HIGH_RES_ORDER_NOTE`.

Coordinate convention
---------------------
`SAMPromptEncoder._embed_points` normalizes point coordinates by `image_embedding_size`
(the 72x72 feature grid), where upstream SAM normalizes by `input_image_size` (1008 here).
Which one the caller owes is not decidable by reading — both run. `gate_point_coords.py`
settles it against the model's own weights; `COORD_*` below name the candidates and
`DEFAULT_COORD_SPACE` records the answer the gate produced.

Note that the positional encoding is random-Fourier (`sin/cos(2*pi * (2c-1) @ B)`), so an
out-of-range coordinate does **not** clip or saturate — it aliases. A wrong convention
yields a plausible-looking embedding pointing at an unrelated cell, which is exactly why
this had to be measured rather than eyeballed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

import numpy as np

# --------------------------------------------------------------------------- conventions

#: Coordinates are indices into the 72x72 feature grid (what the code as written implies).
COORD_FEATURE = "feature"
#: Coordinates are pixels in the 1008x1008 preprocessed input (what upstream SAM implies).
COORD_INPUT = "input"
#: Coordinates are pixels in the original, unresized image.
COORD_ORIGINAL = "original"

COORD_SPACES = (COORD_FEATURE, COORD_INPUT, COORD_ORIGINAL)

#: Settled by gate_point_coords.py on 2026-08-04. See POINTING_PROBE_NOTES.md.
DEFAULT_COORD_SPACE = COORD_FEATURE

DECODER_INTERACTIVE = "interactive"
DECODER_PROPAGATION = "propagation"

FPN_INTERACTIVE = "interactive"
FPN_PROPAGATION = "propagation"

HIGH_RES_ORDER_NOTE = (
    "MultiplexMaskDecoder consumes high_res_features[0] at 144x144 and [1] at 288x288; "
    "the FPN yields [288, 144, 72]; mlx-vlm's track_step forwards (288, 144) and both "
    "shape guards reject it, so the package never applies either skip connection."
)

LABEL_FOREGROUND = 1
LABEL_BACKGROUND = 0
LABEL_PADDING = -1

# --- candidate selection ---------------------------------------------------
# The interactive decoder returns 4 candidate masks. Which one you take is a choice
# mlx-vlm never has to make, because it never calls this decoder.
#
# [MEASURED] 2026-08-04, gate smoke: the predicted-IoU head on this path is only weakly
# calibrated. Its *sign* carries information — where max predicted IoU is positive the
# top candidate reliably contains the prompted point; where it is strongly negative
# ( < -2 ) often no candidate does — but its *ranking* among candidates is poor, and
# taking argmax-IoU blind costs about a third of the point-in-mask rate. So the policy is
# named and recorded on every row rather than left implicit.

#: argmax predicted IoU. What a naive port of SAM's predictor would do.
SELECT_IOU = "iou"
#: argmax mean mask logit at the foreground points. Prefers the locally-sharp candidate.
SELECT_POINT_LOGIT = "point_logit"
#: argmax predicted IoU among candidates that actually contain every foreground point;
#: falls back to SELECT_POINT_LOGIT when none does. The default.
SELECT_CONTAINING = "containing"

SELECTIONS = (SELECT_IOU, SELECT_POINT_LOGIT, SELECT_CONTAINING)
DEFAULT_SELECTION = SELECT_CONTAINING


# --------------------------------------------------------------------------- geometry


@dataclass(frozen=True)
class GridSpec:
    """The three coordinate frames a point can live in, read off the loaded model."""

    grid_h: int          # feature grid rows (72)
    grid_w: int          # feature grid cols (72)
    input_size: int      # preprocessed square input edge (1008)
    image_w: int         # original image width
    image_h: int         # original image height

    @property
    def stride(self) -> float:
        return self.input_size / self.grid_w


def grid_spec(runtime, image_w: int, image_h: int) -> GridSpec:
    enc = runtime.model.tracker_model.interactive_sam_prompt_encoder
    gh, gw = enc.image_embedding_size
    input_size = int(getattr(runtime.processor, "image_size", 1008))
    return GridSpec(grid_h=gh, grid_w=gw, input_size=input_size,
                    image_w=image_w, image_h=image_h)


def to_encoder_coords(points_xy: Sequence[Sequence[float]],
                      spec: GridSpec,
                      coord_space: str = DEFAULT_COORD_SPACE) -> np.ndarray:
    """Convert original-image (x, y) pixels into whatever the prompt encoder wants.

    The encoder computes ``(c + 0.5) / grid``. For a point at normalized position
    ``u = x / image_w`` we therefore need ``c = u * grid - 0.5``: the -0.5 cancels the
    encoder's +0.5, so the point lands at exactly ``u`` in the normalized frame that the
    dense image positional encoding also lives in.

    The preprocessor is a plain square resize to `input_size` with no aspect preservation
    and no padding (`processing_sam3.py:_process_single_image`), so each axis maps
    independently and non-square covers need no letterbox correction.
    """
    if coord_space not in COORD_SPACES:
        raise ValueError(f"unknown coord_space {coord_space!r}; want one of {COORD_SPACES}")

    pts = np.asarray(points_xy, dtype=np.float64).reshape(-1, 2)
    ux = pts[:, 0] / float(spec.image_w)
    uy = pts[:, 1] / float(spec.image_h)

    if coord_space == COORD_FEATURE:
        cx = ux * spec.grid_w - 0.5
        cy = uy * spec.grid_h - 0.5
    elif coord_space == COORD_INPUT:
        cx = ux * spec.input_size
        cy = uy * spec.input_size
    else:  # COORD_ORIGINAL
        cx = pts[:, 0]
        cy = pts[:, 1]

    return np.stack([cx, cy], axis=-1).astype(np.float32)


def feature_cell_of(points_xy: Sequence[Sequence[float]], spec: GridSpec) -> np.ndarray:
    """The integer (row, col) feature cell each original-image point falls in."""
    pts = np.asarray(points_xy, dtype=np.float64).reshape(-1, 2)
    col = np.clip((pts[:, 0] / spec.image_w * spec.grid_w).astype(int), 0, spec.grid_w - 1)
    row = np.clip((pts[:, 1] / spec.image_h * spec.grid_h).astype(int), 0, spec.grid_h - 1)
    return np.stack([row, col], axis=-1)


# --------------------------------------------------------------------------- inference


@dataclass
class EncodedImage:
    """One backbone+neck pass, reusable across many point sets on the same image.

    The backbone is ~95% of the cost of a point prompt; the decoder is milliseconds. Every
    probe in this campaign asks several point sets per cover, so encoding once and decoding
    many times is the difference between a 3-minute run and a 30-minute one.
    """

    features: object          # the FPN scale list [4x, 2x, 1x]
    spec: GridSpec
    fpn: str
    seconds: float


@dataclass
class PointSegmentation:
    """One point-prompt pass over one image."""

    masks: np.ndarray            # (K, H, W) uint8, K = 4 multimask candidates (or 1)
    iou_scores: np.ndarray       # (K,) predicted IoU per candidate
    obj_score: float             # objectness logit
    best_index: int              # chosen candidate, per `selection`
    area_fractions: np.ndarray   # (K,) mask area / image area
    seconds: float
    coord_space: str
    decoder: str
    selection: str
    encoder_coords: np.ndarray   # (N, 2) exactly what was handed to the prompt encoder
    point_logits: np.ndarray     # (K, N) mask logit at each prompt point
    contains_points: np.ndarray  # (K,) does candidate k contain every foreground point

    @property
    def best_mask(self) -> np.ndarray:
        return self.masks[self.best_index]

    @property
    def best_iou(self) -> float:
        return float(self.iou_scores[self.best_index])

    @property
    def best_area_fraction(self) -> float:
        return float(self.area_fractions[self.best_index])

    @property
    def best_contains_points(self) -> bool:
        return bool(self.contains_points[self.best_index])

    def select(self, selection: str) -> int:
        """Index of the candidate this policy would pick. Nothing is recomputed."""
        if selection == SELECT_IOU:
            return int(np.argmax(self.iou_scores))
        if selection == SELECT_POINT_LOGIT:
            return int(np.argmax(self.point_logits.mean(axis=1)))
        if selection == SELECT_CONTAINING:
            ok = np.flatnonzero(self.contains_points)
            if ok.size:
                return int(ok[int(np.argmax(self.iou_scores[ok]))])
            return int(np.argmax(self.point_logits.mean(axis=1)))
        raise ValueError(f"unknown selection {selection!r}; want one of {SELECTIONS}")

    def with_selection(self, selection: str) -> "PointSegmentation":
        import dataclasses
        return dataclasses.replace(self, best_index=self.select(selection),
                                   selection=selection)


def interactive_features(model, pixel_values):
    """The interactive FPN — `_get_tracker_features` with the flags flipped.

    Returns the neck's interactive scale list `[4x (288), 2x (144), 1x (72)]`.
    """
    backbone = model.detector_model.vision_encoder.backbone(pixel_values)
    _det, interactive, _prop = model.detector_model.vision_encoder.neck(
        backbone, need_det=False, need_interactive=True, need_propagation=False,
    )
    return interactive


def propagation_features(model, pixel_values):
    """The propagation FPN — what mlx-vlm's own point path uses. Kept for A/B."""
    backbone = model.detector_model.vision_encoder.backbone(pixel_values)
    _det, _interactive, prop = model.detector_model.vision_encoder.neck(
        backbone, need_det=False, need_interactive=False, need_propagation=True,
    )
    return prop


def encode_image(runtime, image, *, fpn: str = FPN_INTERACTIVE) -> EncodedImage:
    """Run the backbone and neck once. Reuse the result for many point sets."""
    import time
    import mlx.core as mx

    started = time.time()
    width, height = image.size
    inputs = runtime.processor.preprocess_image(image)
    pixel_values = mx.array(inputs["pixel_values"])
    feats = (interactive_features(runtime.model, pixel_values) if fpn == FPN_INTERACTIVE
             else propagation_features(runtime.model, pixel_values))
    mx.eval(feats)
    return EncodedImage(features=feats,
                        spec=grid_spec(runtime, width, height),
                        fpn=fpn,
                        seconds=time.time() - started)


def segment_from_points(
    runtime,
    image,
    points_xy: Sequence[Sequence[float]],
    labels: Optional[Iterable[int]] = None,
    *,
    coord_space: str = DEFAULT_COORD_SPACE,
    decoder: str = DECODER_INTERACTIVE,
    fpn: str = FPN_INTERACTIVE,
    high_res: bool = True,
    add_no_mem_embed: bool = True,
    multimask: bool = True,
    selection: str = DEFAULT_SELECTION,
    encoded: Optional[EncodedImage] = None,
) -> PointSegmentation:
    """Segment a single image from point prompts.

    Args:
        runtime: a `common.SamRuntime` (we use `.model` and `.processor` only).
        image: PIL image, original resolution.
        points_xy: N points as (x, y) in **original image pixels**. Conversion into the
            encoder's frame is this function's job — callers never do it themselves.
        labels: N labels; 1 = foreground, 0 = background, -1 = padding. Defaults to all
            foreground. Mixed labels are supported natively by the prompt encoder
            (`sam_components.py:414-417` routes -1 to `not_a_point_embed`).
        add_no_mem_embed: add `interactivity_no_mem_embed` to the image features. Upstream
            SAM adds a learned "no memory" embedding when a frame has no memory bank;
            mlx-vlm's `track_step` never does, but the weight exists and is loaded. A/B'd
            by the gate.

    Returns a `PointSegmentation` with all `multimask` candidates, not just the best —
    the candidate spread is itself the signal about whether the point was ambiguous.
    """
    import time
    import mlx.core as mx
    from mlx_vlm.models.sam3.generate import _resize_masks

    model = runtime.model
    tracker = model.tracker_model

    width, height = image.size
    spec = encoded.spec if encoded is not None else grid_spec(runtime, width, height)

    pts = np.asarray(points_xy, dtype=np.float64).reshape(-1, 2)
    if pts.shape[0] == 0:
        raise ValueError("segment_from_points needs at least one point")
    lab = (np.full(pts.shape[0], LABEL_FOREGROUND, dtype=np.int32)
           if labels is None else np.asarray(list(labels), dtype=np.int32))
    if lab.shape[0] != pts.shape[0]:
        raise ValueError(f"{pts.shape[0]} points but {lab.shape[0]} labels")

    enc_coords = to_encoder_coords(pts, spec, coord_space)

    started = time.time()
    if encoded is None:
        encoded = encode_image(runtime, image, fpn=fpn)
    elif encoded.fpn != fpn:
        raise ValueError(f"cached features are {encoded.fpn!r}, asked for {fpn!r}")
    fpn_features = encoded.features
    feats = fpn_features[2]                       # 1x scale, (B, 72, 72, D)
    B, H, W, D = feats.shape
    src = feats.reshape(B, H * W, D)

    if add_no_mem_embed:
        # (1, 1, D) learned embedding, broadcast over the token axis.
        src = src + tracker.interactivity_no_mem_embed

    # See HIGH_RES_ORDER_NOTE: the decoder wants (144, 288), the FPN yields [288, 144, 72].
    high_res_features = [fpn_features[1], fpn_features[0]] if high_res else None

    image_pe = tracker.interactive_sam_prompt_encoder.get_dense_pe()
    image_pe = mx.broadcast_to(image_pe, (B, H * W, D))

    coords = mx.array(enc_coords)[None]           # (1, N, 2)
    labels_mx = mx.array(lab)[None]               # (1, N)
    sparse_emb, dense_emb = tracker.interactive_sam_prompt_encoder(
        points=(coords, labels_mx),
    )

    head = (tracker.interactive_sam_mask_decoder if decoder == DECODER_INTERACTIVE
            else tracker.sam_mask_decoder)
    masks, iou_pred, _tokens, obj_score = head(
        image_embeddings=src,
        image_pe=image_pe,
        sparse_prompt_embeddings=sparse_emb,
        dense_prompt_embeddings=dense_emb,
        multimask_output=multimask,
        high_res_features=high_res_features,
    )
    mx.eval(masks, iou_pred, obj_score)

    # (B, M, K, h, w) -> the single object slot. The propagation decoder has M=16; its
    # slot 0 is the one mlx-vlm reads, so we match that to keep the A/B honest.
    masks_np = np.array(masks[0, 0], dtype=np.float32)      # (K, h, w) logits
    iou_np = np.array(iou_pred[0, 0], dtype=np.float32)     # (K,)
    obj_np = float(np.array(obj_score[0, 0]).reshape(-1)[0])

    resized = _resize_masks(masks_np, (height, width))
    binary = (resized > 0).astype(np.uint8)
    seconds = time.time() - started

    pixel_area = float(height * width)
    areas = np.array([m.sum() / pixel_area for m in binary], dtype=np.float32)

    # Sample every candidate at every prompt point once, so any selection policy can be
    # applied (and compared) afterwards without another forward pass.
    cols = np.clip(pts[:, 0].astype(int), 0, width - 1)
    rows = np.clip(pts[:, 1].astype(int), 0, height - 1)
    point_logits = np.stack([resized[k][rows, cols] for k in range(resized.shape[0])])
    fg = lab == LABEL_FOREGROUND
    contains = np.array([bool(binary[k][rows[fg], cols[fg]].all()) if fg.any() else False
                         for k in range(binary.shape[0])])

    seg = PointSegmentation(
        masks=binary,
        iou_scores=iou_np,
        obj_score=obj_np,
        best_index=0,
        area_fractions=areas,
        seconds=seconds,
        coord_space=coord_space,
        decoder=decoder,
        selection=selection,
        encoder_coords=enc_coords,
        point_logits=point_logits.astype(np.float32),
        contains_points=contains,
    )
    seg.best_index = seg.select(selection)
    return seg
