import sys

MAX_ITEMS = 10


def outer(limit=32, ratio: float = 0.75):
    values = [1, 2, 3]
    first = values[0]
    total = 0
    scaled = total / 1000
    if first > 5:
        sys.exit(2)

    def inner(depth=4):
        matrix = (0.2126, 0.7152, 0.0722)
        return matrix[1]

    return inner(depth=7)


class Holder:
    """Holder docstring."""

    LIMIT = 99

    def method(self):
        return self.value * 255
