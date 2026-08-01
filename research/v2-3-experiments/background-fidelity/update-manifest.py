"""Sync the final blast-radius figures into both manifest copies."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '/Users/Flo/GitHub/palette/.claude/worktrees/agent-a44447f854afa671b/research/v2-3-eval/data/results/bf-manifest.json'
d = json.load(open(SRC))
d['blastRadius'].update({
    "movers": "24 of 479 = 5.0%",
    "offPanelFresh": "13 of 320 = 4.1%",
    "note": ("Figures at the shipped F3 = 2.09. An earlier draft at F3 = 1.58 measured 25/479; "
             "the one extra mover exchanged #000000 and #010101."),
})
json.dump(d, open(SRC, 'w'), indent=2)
json.dump(d, open(os.path.join(HERE, 'MANIFEST.json'), 'w'), indent=2)
print("manifest updated in both locations")
