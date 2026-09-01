# Python environment freezes

`pip freeze` output for the four oracle virtualenvs, one file each. Regenerate with:

```
cd research/v3 && bash src/provenance/freeze-venvs.sh
```

| file | venv | what runs there |
|---|---|---|
| `oracle-bakeoff.requirements.txt` | `oracle/bakeoff/.venv` | VLM bakeoff runners |
| `oracle-embeddings.requirements.txt` | `oracle/embeddings/.venv` | DINOv2 embeddings, near-duplicate census, gallery |
| `oracle-premise.requirements.txt` | `oracle/premise/.venv` | premise probes |
| `oracle-sam.requirements.txt` | `oracle/sam/.venv` | SAM mask generation and analysis |

**These are witnesses, not lockfiles.** A `pip freeze` records what was installed at freeze time on
this machine; it does not pin transitive resolution, does not capture platform wheels, and will not
reconstruct the environment on a different OS. What it *does* buy is attribution: when a Python
result stops reproducing, the first question is whether the environment moved, and without these
files that question is unanswerable.

The four environments are separate because their dependencies conflict — that is why there is no
single combined file.

**Re-run the script after installing anything into any venv and commit the diff.** A freeze that has
silently drifted from its venv is worse than no freeze at all, because it is read as authoritative.
