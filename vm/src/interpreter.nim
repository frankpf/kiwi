{.experimental: "codeReordering".}
from tables import toTable, `[]`, hasKey
from types import KiwiType
from sequtils import map, mapIt
from strformat import fmt
from strutils import split, parseInt, splitLines, parseInt
from parseutils import parseBiggestFloat
from re import match, re
from interpreter_value import ObjTag, Value, ValueTag, Obj, ObjString, createInt, createDouble, createNil, createBool, createStringVal, isStringVal, takeString, createObjString, downcast, upcast, printObjString, isNumberVal, valuesEqual
from macros import newStmtList, newIdentNode, strVal, quote, add, newStrLitNode, `[]`, error
from utils import echoErr, kiwiPrint, kiwiPrintErr

const STACK_MAX = 256

type BytecodeVersion = enum V0 = 0

type Bytecode = object
    version: BytecodeVersion
    instructions: seq[uint8]
    constants: seq[Value]
    lineNumbers: seq[int]

type Interpreter = object
    bytecode: Bytecode
    ic: int
    stack: array[STACK_MAX, Value]
    stackTop: int
    heapObjects: seq[ptr Obj]

proc newInterpreter*(bytecode: Bytecode): Interpreter = Interpreter(bytecode: bytecode, ic: 0, stackTop: 0, heapObjects: newSeq[ptr Obj]())

proc push(self: var Interpreter, value: Value): void =
    self.stack[self.stackTop] = value
    self.stackTop += 1

proc pop(self: var Interpreter): Value =
    self.stackTop -= 1
    self.stack[self.stackTop]

proc pop2(self: var Interpreter): (Value, Value) =
    self.stackTop -= 2
    (self.stack[self.stackTop + 1], self.stack[self.stackTop])

proc interpret*(self: var Interpreter): void =
    let instructions = self.bytecode.instructions
    let constants = self.bytecode.constants
    while true:
        let opcode = Opcode(instructions[self.ic])
        echoErr fmt"Interpreting opcode {opcode}"
        case opcode:
        of Opcode.LoadConstant:
            let offset = instructions[self.ic+1]
            let constant = constants[offset]
            self.push(constant)
            self.ic += 1
        of Opcode.LoadNil:
            self.push(createNil())
        of Opcode.LoadTrue:
            self.push(createBool(true))
        of Opcode.LoadFalse:
            self.push(createBool(false))
        of Opcode.Negate:
            if not self.peek(0).isNumberVal:
                self.runtimeError("Operand to negate must be int or double.")

            let value = self.pop()
            case value.kind:
            of ValueTag.Int:
                self.push(createInt(-value.intVal))
            of ValueTag.Double:
                self.push(createDouble(-value.doubleVal))
            else:
                discard
        of Opcode.Add, Opcode.Sub, Opcode.Mul, Opcode.Div:
            # TODO: Figure out if there's a way to let nimc know
            # that Opcode's type here is narrowed to {Add,Sub,Mul,Div}
            # so that I can remove the else: discard line.
            case opcode:
            of Opcode.Add:
                if self.peek(0).isStringVal and self.peek(1).isStringVal:
                    self.concatStrings()
                else:
                    self.binaryOp(`+`)
            of Opcode.Sub:
                self.binaryOp(`-`)
            of Opcode.Mul:
                self.binaryOp(`*`)
            of Opcode.Div:
                self.binaryOp(`/`)
            else:
              discard
        of Opcode.Ge, Opcode.Geq, Opcode.Le, Opcode.Leq:
            # TODO: Figure out if there's a way to let nimc know
            # that Opcode's type here is narrowed to {Ge,Geq,Le,Leq}
            # so that I can remove the else: discard line.
            case opcode:
            of Opcode.Ge:
                self.binaryCmpOp(`>`)
            of Opcode.Geq:
                self.binaryCmpOp(`>=`)
            of Opcode.Le:
                self.binaryCmpOp(`<`)
            of Opcode.Leq:
                self.binaryCmpOp(`<=`)
            else:
                discard
        of Opcode.Eql:
            let (b, a) = self.pop2()
            self.push(createBool(valuesEqual(a, b)))
        of Opcode.Print:
            printKiwiValue(self.pop())
        of Opcode.Return:
            return
        self.ic += 1
        echoErr fmt"Current ic: {self.ic}"
        echoErr fmt"Current stack: {self.stack[0..<self.stackTop]}"

type Opcode {.pure.} = enum
    # Stack manipulation
    LoadConstant = 0,
    LoadNil,
    LoadTrue,
    LoadFalse,
    # Unary operations
    Negate,
    # Binary operations
    Add, Sub, Mul, Div,
    Eql,
    Ge, Geq, Le, Leq,
    # Misc
    Return,
    # Statements
    Print,


# FIXME: Can't parse multiline strings
proc parseTextualBytecode*(bytecodeText: string): Bytecode =
    let lines = bytecodeText.splitLines
    let versionText = lines[0].split("VERSION ")[1]
    let version = BytecodeVersion(versionText.parseInt8)

    echoErr fmt"Parsed version: {version}"

    let instructionsStart = lines.find("START INSTRUCTIONS")
    var instructionsText = lines[instructionsStart..<lines.len]
    instructionsText = instructionsText[1..<instructionsText.find("END")]

    let constantsStart = lines.find("START CONSTANTS")
    var constantsText = lines[constantsStart..<lines.len]
    constantsText = constantsText[1..<constantsText.find("END")]

    let linenumStart = lines.find("START LINENUM")
    var linenumText = lines[linenumStart..<lines.len]
    linenumText = linenumText[1..<linenumText.find("END")]

    let instructions = instructionsText.parseInstructions
    let constants = constantsText.mapIt(parseConstant(it))
    let linenums = linenumText.mapIt(it.parseInt)

    echoErr fmt"Parsed {instructionsText.len} instructions, {constantsText.len} constants and {linenumText.len} line numbers"

    Bytecode(version: version, instructions: instructions, constants: constants, lineNumbers: linenums) 

const textToOpcode = {
    "load_nil": Opcode.LoadNil,
    "load_true": Opcode.LoadTrue,
    "load_false": Opcode.LoadFalse,
    "return": Opcode.Return,
    "negate": Opcode.Negate,
    "add": Opcode.Add,
    "sub": Opcode.Sub,
    "div": Opcode.Div,
    "mul": Opcode.Mul,
    "eql": Opcode.Eql,
    "ge": Opcode.Ge,
    "geq": Opcode.Geq,
    "le": Opcode.Le,
    "leq": Opcode.Leq,
    "print": Opcode.Print,
}.toTable

type BytecodeParseError = object of Exception

proc parseConstant(text: string): Value =
    if text[0] == 'd':
        var doubleVal: float64
        let r = text[2..<text.len].parseBiggestFloat(doubleVal)
        if r == 0:
            raise newException(BytecodeParseError, "Error parsing constant {text}")
        return createDouble(doubleVal)
    if text[0] == 'i':
        return createInt(text[2..<text.len].parseInt)
    if text[0] == 's':
        let lenStr = text[1..<text.find(' ')]
        let strLen = lenStr.parseInt
        let numDigits = lenStr.len
        let str = text[2 + numDigits..<2+numDigits+strLen]
        return createStringVal(str)

    raise newException(BytecodeParseError, fmt"Error parsing constant {text}")

proc parseInstructions(lines: seq[string]): seq[uint8] =
    var result: seq[uint8]
    for instruction in lines:
        if instruction.match(re"load_constant \d"):
            result.add(Opcode.LoadConstant.uint8)
            let offsetText = instruction.split("constant ")[1]
            let offset = offsetText.parseInt8
            result.add(offset)
        else:
            if not textToOpcode.hasKey(instruction):
                echoErr fmt"Unknown instruction! {instruction}"
                quit(QuitFailure)
            let opcode = textToOpcode[instruction]
            result.add(opcode.uint8)
    result


proc parseInt8(s: string): uint8 =
    s.parseInt.uint8


proc printKiwiValue(value: Value): void =
    case value.kind:
    of Nil:
        kiwiPrint "nil"
    of Bool:
        let str = if value.boolVal: "true" else: "false"
        kiwiPrint fmt"{str}"
    of Int:
        kiwiPrint fmt"{value.intVal}"
    of Double:
        kiwiPrint fmt"{value.doubleVal}"
    of Object:
        if value.isStringVal:
            let obj = downcast[ObjString](value.obj)
            echo printObjString(obj)

proc printf(formatstr: cstring) {.importc: "printf", varargs,
                                  header: "<stdio.h>".}


# FIXME: we're mixing concerns. the binaryOp macro has knowledge
# that a string operation has been done, although it doesn't deal with
# that at all.
macro binaryOp(self: var Interpreter, op: untyped): untyped =
    let opStr = op[0].strVal
    if not @["+", "-", "*", "/"].contains(opStr):
        error(fmt"binaryOp instantiated with invalid operator: ${opStr}")
    let result = newStmtList()
    let intOperator = if opStr == "/": newIdentNode("div") else: op
    let errorMsg = if opStr == "+":
        "Operands to " & opStr & " must be two doubles, integers or strings"
    else:
        "Operands to " & opStr & " must be two doubles or integers"
    result.add quote do:
        let (b, a) = self.pop2()
        if a.kind == ValueTag.Int and b.kind == ValueTag.Int:
            self.push(createInt(`intOperator`(a.intVal, b.intVal)))
        elif a.kind == ValueTag.Int and b.kind == ValueTag.Double:
            self.push(createDouble(`op`(float64(a.intVal), b.doubleVal)))
        elif a.kind == ValueTag.Double and b.kind == ValueTag.Int:
            self.push(createDouble(`op`(a.doubleVal, float64(b.intVal))))
        elif a.kind == ValueTag.Double and b.kind == ValueTag.Double:
            self.push(createDouble(`op`(a.doubleVal, b.doubleVal)))
        else: 
            self.runtimeError(`errorMsg`)
    result


macro binaryCmpOp(self: var Interpreter, op: untyped): untyped =
    let opStr = op[0].strVal
    if not @[">", ">=", "<", "<="].contains(opStr):
        error(fmt"binaryOp instantiated with invalid operator: {opStr}")
    let result = newStmtList()
    let errorMsg = "Operands to " & opStr & " must be two doubles or integers"
    result.add quote do:
        let (b, a) = self.pop2()
        if a.kind == ValueTag.Int and b.kind == ValueTag.Int:
            self.push(createBool(`op`(a.intVal, b.intVal)))
        elif a.kind == ValueTag.Int and b.kind == ValueTag.Double:
            self.push(createBool(`op`(float64(a.intVal), b.doubleVal)))
        elif a.kind == ValueTag.Double and b.kind == ValueTag.Int:
            self.push(createBool(`op`(a.doubleVal, float64(b.intVal))))
        elif a.kind == ValueTag.Double and b.kind == ValueTag.Double:
            self.push(createBool(`op`(a.doubleVal, b.doubleVal)))
        else:
            self.runtimeError(`errorMsg`)
    result

type RuntimeError = object of Exception 
proc runtimeError(self: var Interpreter, msg: string): void =
    let line = self.bytecode.lineNumbers[self.ic-1]
    kiwiPrintErr fmt"Error in line {line}"
    self.resetStack
    raise newException(RuntimeError, msg)


proc resetStack(self: var Interpreter): void =
    self.stackTop = 0

# ASSUMES: a and b have been checked to be ObjStrings
proc concatStrings(self: var Interpreter): void =
    let (b, a) = self.pop2()

    let aStr = downcast[ObjString](a.obj)
    let bStr = downcast[ObjString](b.obj)

    let length = aStr.length + bStr.length

    let chars = allocate[uint8](sizeof(uint8), length)
    copyMem(chars, aStr.chars, aStr.length)
    let bOffset = cast[pointer](cast[uint64](chars) + aStr.length)
    copyMem(bOffset, bStr.chars, bStr.length)

    let result = takeString(chars, length)
    self.push(self.allocHeap(createStringVal(result)))

macro allocHeap(self: var Interpreter, procCall: untyped): untyped =
  let result = newStmtList()
  result.add quote do:
    let tmpVal = `procCall`
    self.heapObjects.add(tmpVal.obj)
    tmpVal

  result

proc allocate[T](size: int, count: uint64): ptr T =
    # FIXME: consider using cast to uint64 instead of proc call or defining an overload for `*`
    reallocate[T](nil, 0, size.uint64 * count)

proc reallocate[T](previous: ptr T, oldSize: uint64, newSize: uint64): ptr T =
    if newSize == 0:
        dealloc(previous)
        return nil

    return cast[ptr T](realloc(previous, newSize))


proc cleanup(obj: ptr Obj): void =
    case obj.tag:
    of ObjTag.String:
      let str = downcast[ObjString](obj)
      echoErr fmt"==Cleaning up=="
      echoErr printObjString(str)
      echoErr fmt"==Done=="
      #dealloc(str.chars)
      #dealloc(obj)
      discard reallocate(str.chars, sizeof(uint8).uint64 * (str.length + 1), 0)
      discard reallocate(obj, sizeof(ObjString).uint64, 0)

proc cleanup*(self: var Interpreter): void =
  for obj in self.heapObjects:
    obj.cleanup

  for val in self.bytecode.constants:
    if val.kind == ValueTag.Object:
      val.obj.cleanup

  return



func peek(self: Interpreter, dist: Natural): Value =
    self.stack[self.stackTop - dist - 1]
