"""How often does criterion #2 contradict every criterion below it?

The 00034b60 loss is not F1 misfiring. F1 correctly refuses a one-level frameCoverage decision;
the damage is done by the NEXT criterion. `peripheralCoverage` decides in favour of the smaller
family while `connectedCoverage`, `fieldScore` and `populationCoverage` all favour the larger one
by large margins — and the scan has already stopped.

The culprit term is `(1 - centerCoverage)`: a small off-centre family scores near 1 on it. That is
the same fallacy `mount` already corrects (absence from the centre is evidence of not being the
SUBJECT, not evidence of being the GROUND) — which this arm's F2 withdraws for mounts only.

This measures the predicate over every published field pair in the OFF corpus:
  criterion #1 ties under F1 (|delta| < 2)   AND
  criterion #2 decides (|delta| >= 2)        AND
  criteria #3, #4, #5 ALL point the other way by >= 2 levels.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
L = lambda v: int((v + 1e-12) / 0.04)
KEYS = ('frameCoverage', 'peripheralCoverage', 'connectedCoverage', 'fieldScore', 'populationCoverage')

hits = []
pairs = 0
for path in sys.argv[1:]:
    for line in open(path):
        d = json.loads(line)
        if 'error' in d:
            continue
        bg, sf = d.get('backgroundFamily'), d.get('surfaceFamily')
        if not bg or not sf or bg['id'] == sf['id']:
            continue
        pairs += 1
        delta = [L(bg[k]) - L(sf[k]) for k in KEYS]
        if abs(delta[0]) >= 2:
            continue                       # criterion 1 still decides under F1
        if abs(delta[1]) < 2:
            continue                       # criterion 2 does not decide either
        sign2 = 1 if delta[1] > 0 else -1
        lower = delta[2:]
        if all(v * sign2 <= -2 for v in lower):
            hits.append((d['key'], delta))

print(f"published two-family pairs examined: {pairs}")
print(f"criterion #2 decides AGAINST a unanimous, decisive criteria #3-#5: {len(hits)}")
for k, delta in hits:
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:12s} deltas frame={delta[0]:+d} periph={delta[1]:+d} "
          f"conn={delta[2]:+d} field={delta[3]:+d} pop={delta[4]:+d}")
