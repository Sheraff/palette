"""Module docstring."""

# [MEASURED] leading block line one
# leading block line two
ALPHA = 1
BETA = 2
GAMMA = 3

DELTA = 4  # [REVIEWED] trailing

# [HELD] block for epsilon
EPSILON = 5

ZETA = 6


def documented(scale=7):
    """[INHERITED] function docstring."""
    inner_value = 8
    return inner_value


CONFIG = {
    # [n=1] near the nested value
    "near": 9,
    "far": 10,
}
