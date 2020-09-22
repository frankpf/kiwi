{.experimental: "codeReordering".}
import strformat
type ObjTag* {.pure.} = enum String

type Obj* = object
    tag*: ObjTag

type ObjString* = object
    obj*: Obj
    length*: uint64
    chars*: ptr uint8

proc takeString*(chars: ptr uint8, length: uint64): ptr ObjString =
    createObjString(chars, length)

type ValueTag* {.pure.} = enum Nil, Bool, Int, Double, Object
type Value* {.requiresInit.} = object
    case kind*: ValueTag
    of Nil: discard
    of Bool: boolVal*: bool
    of Int: intVal*: int64
    of Double: doubleVal*: float64
    of Object: obj*: ptr Obj

func createNil*(): Value = Value(kind: ValueTag.Nil)
func createBool*(val: bool): Value = Value(kind: ValueTag.Bool, boolVal: val)
func createInt*(val: int64): Value = Value(kind: ValueTag.Int, intVal: val)
func createDouble*(val: float64): Value = Value(kind: ValueTag.Double, doubleVal: val)
proc createStringVal*(s: string): Value =
    let str = createObjString(s)
    Value(
        kind: ValueTag.Object,
        obj: cast[ptr Obj](str),
    )
proc createStringVal*(obj: ptr ObjString): Value =
    Value(
        kind: ValueTag.Object,
        obj: cast[ptr Obj](obj),
    )

proc isStringVal*(v: Value): bool =
    v.kind == ValueTag.Object and v.obj.tag == ObjTag.String

proc isNumberVal*(v: Value): bool =
    v.kind == ValueTag.Int or v.kind == ValueTag.Double

proc downcast*[T](objPtr: ptr Obj): T =
  cast[ptr T](objPtr)[]
  
proc upcast*[T](objptr: ptr T): Obj =
  cast[ptr Obj](objPtr)[]

proc createObj(tag: ObjTag): Obj =
  Obj(tag: tag)

proc createObjString*(s: string): ptr ObjString =
    var data = cast[ptr ObjString](alloc0(sizeof ObjString))
    data.obj = createObj(ObjTag.String)
    data.length = s.len.uint64

    # We need to make our own copy of the underlying characters
    # so that nim's GC freeing `s` won't affect the VM string.
    let chars = cast[ptr uint8](alloc0(data.length))
    copyMem(chars, unsafeAddr s[0], data.length)

    data.chars = chars

    data


proc createObjString*(chars: ptr uint8, length: uint64): ptr ObjString =
    var data = cast[ptr ObjString](alloc0(sizeof ObjString))
    data.obj = createObj(ObjTag.String)
    data.length = length
    data.chars = chars

    data

proc printObjString*(str: ObjString): string =
    var result = ""
    let chars = str.chars
    for i in 0..<str.length:
        let ascii = cast[ptr uint8](cast[uint64](chars) + i)
        result.add(chr(ascii[]))
    result

func valuesEqual*(a: Value, b: Value): bool = 
    if a.kind != b.kind: return false

    case a.kind:
    of ValueTag.Bool:
        return a.boolVal == b.boolVal
    of ValueTag.Nil:
        return true
    of ValueTag.Int:
        return a.intVal == b.intVal
    of ValueTag.Double:
        return a.doubleVal == b.doubleVal
    of ValueTag.Object:
        let strA = downcast[ObjString](a.obj)
        let strB = downcast[Objstring](b.obj)
        return strA.length == strB.length and
            equalMem(strA.chars, strB.chars, strA.length)

