def report(count):
    """Docstring with 900 in it."""
    a = f"literal 1 and 2 and 3 text"
    b = f"{count + 7}"
    c = f"{count:.2f}"
    d = f"{count:{5}.2f}"
    e = f"value={count[0]}"
    g = f"{ {'k': 8}['k'] }"
    h = f"{count!r} and 9"
    print(f"pi is {3.14159}")
    return f"{-11}"
