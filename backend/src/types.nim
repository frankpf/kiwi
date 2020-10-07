
type KiwiKind = enum Int, String

# TODO: learn how to make non-ref objects nilable
type KiwiType* = ref object
    case kind*: KiwiKind
    of Int: iValue: int
    of String: str: string

proc createKiwiString*(str: string): KiwiType =
    return KiwiType(kind: String, str: str)

proc createKiwiInt*(iValue: int): KiwiType =
    return KiwiType(kind: Int, iValue: iValue)
