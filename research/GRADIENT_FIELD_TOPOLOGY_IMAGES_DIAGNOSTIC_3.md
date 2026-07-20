# Gradient Field Topology 3.0.0 Images Diagnostic

## Corpus and purpose

This exposed diagnostic covers every regular file directly under root `images/` whose extension is supported by the current loader (`.jpg`, `.jpeg`, `.png`, `.avif`, or `.webp`) and whose basename before the final extension contains no hyphen. The rule mechanically excludes scrambled variants and files such as `maroon5-original`, `maroon5-masked`, and `maroon5-saliency`; it includes every qualifying base artwork. There is no sampling or outcome-aware selection.

The diagnostic is intentionally unblinded and is not independent validation or a prevalence sample. It exposes canonical `region-graph-0.17.0` and frozen `gradient-field-topology-model-3.0.0-dev` behavior for debugging and exact-pair review. The v3 threshold remains `0.25629320384844717`, parameter identity remains `98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11`, and no model, feature, threshold, or canonical behavior may be refit or changed from these responses.

## Binding and exact pairs

Every source is bound by relative path, exact bytes, SHA-256, and decoded original dimensions. The diagnostic binds this protocol, preparation/analyzer, dedicated renderer and server, canonical extraction, topology wrapper, evidence implementation, runtime scorer and identity, selected parameter identity, package declaration, Node/native runtime, and every source inventory entry. Outputs refuse overwrite.

Each source is evaluated exactly once with `extractGradientFieldTopologyPalette`. The emitted complete spatial palette is retained. Canonical and v3 gradient booleans are reported separately. For canonical gradients, the runtime certificate reports the exact directed endpoints, score, threshold, margin, and v3 decision. For canonical-flat cases, v3 is recorded as not evaluated and not promoted with reason `baseline-not-gradient`.

Every displayed case, including canonical-flat cases, has the directed pair identity:

`SHA-256(sourceSha256 + NUL + selected background RGB CSV + NUL + selected surface RGB CSV)`

For evaluated canonical gradients, this pair must equal the certificate endpoints. For canonical-flat cases, it binds the displayed canonical background and surface roles even though topology scoring was not invoked.

## Review and analysis

The HTML shows the original image, exact background/surface colors, complete palette, canonical and v3 decisions, score/margin when evaluated, and gradient/flat treatments with the v3-selected treatment clearly marked. Canonical-flat entries explicitly state that v3 did not evaluate or promote them.

Every case accepts exactly one of `should-be-gradient`, `should-not-be-gradient`, `either-way`, `no-visible-difference`, or `selected-colors-not-identifiable`. Feedback is bound to family ID, exact pair SHA-256, diagnostic-plan SHA-256, and HTML SHA-256. The server binds only `127.0.0.1`, verifies exact plan/render keys, source containment, bytes, and SHA-256 before listening, serves only listed root images, never serves unrelated files, and atomically stores feedback. Intended port is 3120; port 3119 is not used.

Analysis requires one response for every mechanically selected base artwork. It reports canonical and v3 confusion counts over decisive responses, decisive accuracy counts, nondecisive label counts, and per-case outcomes. Canonical-flat means v3-flat for diagnostic comparison because the wrapper explicitly does not evaluate or promote it. Analysis never refits or mutates a model or source artifact.
