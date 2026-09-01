# 111 in a comment must not be found
X = 1  # trailing 222 must not be found
SINGLE = 'no 333 here'
DOUBLE = "no 444 here"
TRIPLE_S = '''no 555 here
and no 666 on line two'''
TRIPLE_D = """no 777 here"""
HASH_IN_STRING = "not a # comment 888"
RAW = r"\d{9}"
RAW_QUOTE = r"\"999\""
BYTES = b"\x00 101"
UNI = u"102"
RAWBYTES = rb"\d 103"
BYTESRAW = BR"\d 104"
ESCAPED = "she said \"105\" loudly"
MIXED = "text"  # comment with 106
AFTER = 2
