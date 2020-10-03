{.experimental: "codeReordering".}
from types import KiwiType
from sequtils import map, mapIt
from math import `^`
from strformat import fmt
from times import getTime, `-`, inMilliseconds
from tables import Table, TableRef, newTable, `[]`, `[]=`, initTable, pairs, toTable, hasKey, `$`
from interpreter_value import Bytecode, BytecodeVersion
from strutils import split, parseInt, splitLines, parseInt, startsWith, contains, strip, join, find, repeat
from parseutils import parseBiggestFloat
from osproc import startProcess, inputHandle, poUsePath, poEvalCommand
from os import sleep
from rdstdin import readLineFromStdin
from re import match, re, split, find
from interpreter_value import ObjTag, Value, ValueTag, Obj, ObjString, createInt, createDouble, createNil, createBool, createStringVal, isStringVal, takeString, createObjString, downcast, upcast, printObjString, isNumberVal, valuesEqual, hash, isTruthy, ObjFunction, newEmptyFunctionVal
from macros import newStmtList, newIdentNode, strVal, quote, add, newStrLitNode, `[]`, error
from utils import echoErr, kiwiPrint, kiwiPrintErr, debugMode

#iterator startRepl(self: var Interpreter, streamFilePath: string, lines: var seq[string]): int =
#    # FIXME: we're redirecting to a file as a workaround
#    # to a bug in stdlib's process.hasData
#    let workingDir = ".."
#    let process = startProcess(
#      fmt"node dist/src/index.js --replCompiler 2>&1 > {streamFilePath}",
#      workingDir=workingDir,
#      options={poEvalCommand, poUsePath},
#    )
#    var procStdin: File
#    discard procStdin.open(process.inputHandle, fmWrite)
#    var replCompilerStream = open(fmt"{workingDir}/{streamFilePath}")
#
#    let oldBytecode = Bytecode(
#      version: self.bytecode.version,
#      instructions: self.bytecode.instructions,
#      constants: self.bytecode.constants,
#      lineNumbers: self.bytecode.lineNumbers,
#    )
#    let oldIc = self.ic
#
#    var readInput = true
#    var prevRes: string
#    for line in lines:
#      procStdin.write(line & "\n")
#    while true:
#        if readInput:
#          let input = readLineFromStdin("debugger> ") & "\n"
#          if input == ".cont\n":
#            self.updateBytecode(oldBytecode)
#            self.ic = oldIc
#            yield 2
#          if input.len - 1 > 0:
#            lines.add(input)
#            procStdin.write(input)
#            procStdin.write("$RESET$\n\n")
#            procStdin.flushFile()
#
#        sleep(100) # Prevent race condition ¯\_(ツ)_/¯
#        let res = replCompilerStream.readAll()
#        if ("START INSTRUCTIONS" in res) and (res == prevRes):
#            readInput = false
#            continue
#        else:
#            readInput = true
#        let parsed = parseTextualBytecode(res)
#        self.mergeBytecode(parsed)
#
#        try:
#          yield 1
#        except RuntimeError as e:
#          kiwiPrintErr e.msg


const FRAMES_MAX = 64
const STACK_MAX = FRAMES_MAX * (2^8)

type CallFrame = object
  function: ObjFunction
  ic: int
  firstSlotIndex: int

type Interpreter* = object
    frames: array[FRAMES_MAX, CallFrame]
    frameCount: int
    stack: array[STACK_MAX, Value]
    stackTop: int
    heapObjects: seq[ptr Obj]
    globals: Table[int, Value]
    # FIXME: Expose these only in testing
    opcodes*: seq[Opcode]
    opcodeArgs*: Table[string, seq[int]]
    # FIXME: This shouldn't be exposed
    originalSrc*: string
    # FIXME: This is a hack for late initalization in the REPL
    initialized*: int
    timePerOpcode: TableRef[Opcode, int64]
    execPerOpcode: TableRef[Opcode, int64]

proc newInterpreter*(fnObj: ObjFunction): Interpreter =
    var interp = Interpreter(
      frameCount: 1,
      stackTop: 0,
      heapObjects: newSeq[ptr Obj](),
      globals: initTable[int, Value](),
      opcodes: newSeq[Opcode](),
      opcodeArgs: initTable[string, seq[int]](),
      initialized: 1,
      timePerOpcode: newTable[Opcode, int64](),
      execPerOpcode: newTable[Opcode, int64](),
    )
    var fnVal = newEmptyFunctionVal("")
    fnVal.obj = cast[ptr Obj](unsafeAddr fnObj)
    interp.frames[0].function = fnObj
    interp.frames[0].ic = 0
    interp.frames[0].firstSlotIndex = interp.stackTop

    interp.push(fnVal)
    interp

proc push(self: var Interpreter, value: Value): void =
    self.stack[self.stackTop] = value
    self.stackTop += 1

proc pop(self: var Interpreter): Value =
    self.stackTop -= 1
    self.stack[self.stackTop]

proc pushPtr(self: var Interpreter, value: ptr Value): void =
    self.stack[self.stackTop] = value[]
    self.stackTop += 1

proc popPtr(self: var Interpreter): ptr Value =
    self.stackTop -= 1
    self.stack[self.stackTop].addr

proc pop2(self: var Interpreter): (Value, Value) =
    self.stackTop -= 2
    (self.stack[self.stackTop + 1], self.stack[self.stackTop])

proc readUint8(self: var Interpreter): uint8 =
    let frame = self.frames[self.frameCount-1].addr
    let val = frame.function.bytecode.instructions[frame.ic]
    frame.ic += 1
    return val

proc readUint16(self: var Interpreter): int =
    let frame  = self.frames[self.frameCount-1].addr
    let highBits = frame.function.bytecode.instructions[frame.ic].int16
    let lowBits = frame.function.bytecode.instructions[frame.ic+1].int16
    let val = int((highBits shl 8) or lowBits)
    frame.ic += 2
    return val

proc readConstant(self: var Interpreter): Value =
  let frame = self.frames[self.frameCount-1]
  let offset = self.readUint8()
  self.registerOpcodeArg(offset)
  return frame.function.bytecode.constants[offset]

proc readSlotAt(self: var Interpreter, frame: ptr CallFrame, index: int): Value =
  return self.stack[frame.firstSlotIndex + index]

proc writeSlotAt(self: var Interpreter, frame: ptr CallFrame, index: int, value: Value) =
  self.stack[frame.firstSlotIndex + index] = value

proc interpret*(self: var Interpreter): void =
    var frame = self.frames[self.frameCount - 1].addr
    var opcodeCount = 0
    while true:
        let start = getTime()
        echoErr fmt"FRAME IC = {frame.ic}"
        let opcode = Opcode(self.readUint8())
        self.registerOpcode(opcode)
        echoErr fmt"Interpreting opcode {opcode} [ic={frame.ic}]"
        case opcode:
        of Opcode.LoadConstant:
            self.push(self.readConstant())
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
        of Opcode.Not:
            let value = self.pop()
            self.push(createBool(not value.isTruthy))
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
        of Opcode.Or:
            let b = self.pop()
            let a = self.pop()
            if a.isTruthy:
                self.push(a)
            else:
                self.push(b)
        of Opcode.And:
            let b = self.pop()
            if not b.isTruthy:
                self.push(createBool(false))
            else:
                let a = self.pop()
                self.push(createBool(a.isTruthy))
        of Opcode.Eql:
            let (b, a) = self.pop2()
            self.push(createBool(valuesEqual(a, b)))
        of Opcode.Print:
            echo printKiwiValue(self.pop())
        of Opcode.Pop:
            discard self.pop()
        of Opcode.DefineGlobal:
            let constant = self.readConstant()
            let name = downcast[ObjString](constant.obj)
            self.globals[name.hash] = self.peek(0)
            discard self.pop()
        of Opcode.GetGlobal:
            let constant = self.readConstant()
            let name = downcast[ObjString](constant.obj)
            try:
              let value = self.globals[name.hash]
              self.push(value)
            except KeyError:
              # FIXME: I don't think this is the right message, the user isn't necessarily
              # trying to access a global variable. It could be a local variable too
              self.runtimeError(fmt"Access to undefined global variable '{printObjString(name)}'")
        of Opcode.SetGlobal:
            let constant = self.readConstant()
            let name = downcast[ObjString](constant.obj)
            echoErr fmt"Name: {printObjString(name)}"
            if not self.globals.hasKey(name.hash):
                echoErr "no global var"
                self.runtimeError(fmt"Assignment to undefined global variable '{printObjString(name)}'")
            self.globals[name.hash] = self.peek(0)
            discard self.pop()
        of Opcode.GetLocal:
            let offset = self.readUint8()
            self.push(self.readSlotAt(frame, int(offset)))
            self.registerOpcodeArg(offset)
        of Opcode.SetLocal:
            let offset = self.readUint8()
            self.writeSlotAt(frame, int(offset), self.peek(0))
            self.registerOpcodeArg(offset)
        of Opcode.Jump:
            let bytesToJumpOver = self.readUint16()
            if bytesToJumpOver > 0:
              frame.ic += bytesToJumpOver
            else:
              # Backwards jump. We're at the third byte:
              # [ Opcode.Jump ] [ high bits ] [ low bits ]
              #                              ^ frame.ic
              # so we need to subtract 2 from the jump offset
              frame.ic += (bytesToJumpOver - 2)
        of Opcode.JumpIfFalse:
            let bytesToJumpOver = self.readUint16()
            if not self.peek(0).isTruthy:
                echoErr fmt"Jumping over {bytesToJumpOver} bytes"
                frame.ic += bytesToJumpOver
            discard self.pop()
        of Opcode.Return:
            let result = self.popPtr()

            echoErr fmt"Return result: {printKiwiValue(result[])}"

            self.frameCount -= 1
            if self.frameCount == 0:
              discard self.popPtr()
              return

            self.stackTop = frame.firstSlotIndex
            self.pushPtr(result)

            frame = self.frames[self.frameCount - 1].addr
            for s, v in self.globals.pairs:
              echoErr "GLOBAL INFO (K,V)-->"
              echoErr "HASH: {s}"
              #printKiwiValue(v)
              echoErr "<-------------------"
        of Opcode.LoadFunction:
            let constant = self.readConstant()
            self.push(constant)
        of Opcode.CallFunction:
            let argCount = self.readUint8()
            let fnVal = self.peek(argCount)
            self.callValue(fnVal, int(argCount))
            frame = self.frames[self.frameCount - 1].addr
            discard
        of Opcode.Debugger:
            discard
          #let currentLine = self.bytecode.lineNumbers[self.findLineWithError(self.ic) - 1]
          #var lines = self.originalSrc.splitLines[0..currentLine]
          #self.ic += 1
          #for i in self.startRepl("debugstream.txt", lines):
          #  if i == 2:
          #    doIncrement = false
          #    break
          #  self.interpret()
        #if doIncrement:
        #  self.ic += 1
        opcodeCount += 1
        echoErr fmt"Current frame ic={frame.ic}, frameCount={self.frameCount}, stackTop={self.stackTop}, firstSlotIndex={frame.firstSlotIndex}"
        if debugMode():
          let stackStr = self.stack[0..<self.stackTop + 10].mapIt(it.printKiwiValue).join(" | ")
          var idx = 0
          var i = 0
          for ch in stackStr:
            idx += 1
            if ch == '|':
              i += 1
            if i == self.stackTop:
              break
          let stackTopString = " ".repeat("Current stack: ".len) & " ".repeat(idx) & " ^"
          echoErr fmt"Current stack: {stackStr}, stackIdx={idx}, i={i}"
          echoErr stackTopString
          let instructions = frame.function.bytecode.instructions.mapIt(Opcode(it))
          echoErr fmt"Instructions: {instructions}"
        let timeTaken = (getTime() - start).inMilliseconds
        if not self.timePerOpcode.hasKey(opcode):
          self.timePerOpcode[opcode] = 0
        self.timePerOpcode[opcode] += timeTaken
        if not self.execPerOpcode.hasKey(opcode):
          self.execPerOpcode[opcode] = 0
        self.execPerOpcode[opcode] += 1

proc callValue(self: var Interpreter, callee: Value, argCount: int): void =
  case callee.kind:
  of ValueTag.Object:
    case callee.obj.tag:
    of ObjTag.Function:
      let funcObj = downcast[ObjFunction](callee.obj)
      self.call(funcObj, argCount)
      return
    else:
      discard
  else:
    discard

  self.runtimeError("Can only call functions and class methods")

proc call(self: var Interpreter, funcObj: ObjFunction, argCount: int): void =
  var frame = self.frames[self.frameCount].addr
  self.frameCount += 1
  frame.function = funcObj
  frame.ic = 0
  frame.firstSlotIndex = self.stackTop - argCount - 1

# FIXME: Export only when testing
type Opcode* {.pure.} = enum
    # Stack manipulation
    LoadConstant = 0,
    LoadNil,
    LoadTrue,
    LoadFalse,
    # Unary operations
    Negate,
    # Boolean unary ops
    Not,
    # Binary operations
    Add, Sub, Mul, Div,
    # Boolean binary ops,
    Or, And,
    Eql,
    Ge, Geq, Le, Leq,
    # Misc
    Return, Debugger,
    # Variables
    DefineGlobal, GetGlobal, SetGlobal,
    GetLocal, SetLocal,
    # Statements
    Print,
    Pop,
    # Control flow
    Jump, JumpIfFalse,
    # Functions,
    LoadFunction, CallFunction,

type ParseFunctionDefResult = tuple[name: string, arity: int, bytecode: Bytecode]

proc parseFunctionDef(lines: seq[string]): ParseFunctionDefResult =
  let instructionsStart = 1
  let fnInfo = lines[instructionsStart].split("START FUNCTION ")[1].split(" ")
  let name = fnInfo[0]
  let arity = fnInfo[1].parseInt
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

  let bytecode = Bytecode(version: BytecodeVersion(0), instructions: instructions, constants: constants, lineNumbers: linenums)
  echoErr fmt"Parsed {instructionsText.len} instructions, {constantsText.len} constants and {linenumText.len} line numbers"
  return (name: name, arity: arity, bytecode: bytecode)

# FIXME: Can't parse multiline strings
proc parseTextualBytecode*(bytecodeText: string): ObjFunction =
    let fragments = bytecodeText.split("---")

    let header = fragments[0].splitLines
    let versionText = header[0].split("VERSION ")[1]
    let version = BytecodeVersion(versionText.parseInt8)
    echoErr fmt"Parsed version: {version}"

    let functionDefs = fragments[1..<fragments.len]
    var functionToBytecodeMap = newTable[string, Bytecode]()
    var functionToArityMap = newTable[string, int]()

    for def in functionDefs:
      let lines = def.splitLines.mapIt(it.strip)
      let functionDefResult = parseFunctionDef(lines)

      let name = functionDefResult.name
      let arity = functionDefResult.arity
      var bytecode = functionDefResult.bytecode

      functionToBytecodeMap[name] = functionDefResult.bytecode
      functionToArityMap[name] = arity

    # Patch empty function constants
    for functionName, bytecode in functionToArityMap.pairs:
      let bytecode = functionToBytecodeMap[functionName]
      for i in 0..<bytecode.constants.len:
        var constant = bytecode.constants[i].unsafeAddr
        if constant.kind == ValueTag.Object and constant.obj.tag == ObjTag.Function:
          var fn = cast[ptr ObjFunction](constant.obj)
          let toPatch = printObjString(fn[].name[])
          fn.bytecode = functionToBytecodeMap[toPatch]
          fn.arity = functionToArityMap[toPatch]

    var topLevel = newEmptyFunctionVal("")
    var fn = downcast[ObjFunction](topLevel.obj)
    fn.bytecode = functionToBytecodeMap["toplevel"]
    fn.arity = 0

    return fn

const textToOpcode = {
    "load_nil": Opcode.LoadNil,
    "load_true": Opcode.LoadTrue,
    "load_false": Opcode.LoadFalse,
    "return": Opcode.Return,
    "negate": Opcode.Negate,
    "Or": Opcode.Or,
    "And": Opcode.And,
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
    "pop": Opcode.Pop,
    "not": Opcode.Not,
    "Debugger": Opcode.Debugger,
}.toTable

const opcodesWithOffset = {
    "load_function": Opcode.LoadFunction,
    "load_constant": Opcode.LoadConstant,
    "define_global": Opcode.DefineGlobal,
    "get_global": Opcode.GetGlobal,
    "set_global": Opcode.SetGlobal,
    "get_local": Opcode.GetLocal,
    "set_local": Opcode.SetLocal,
    "call": Opcode.CallFunction,
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
    if text[0] == 'f':
        let lenStr = text[1..<text.find(' ')]
        let strLen = lenStr.parseInt
        let numDigits = lenStr.len
        let str = text[2 + numDigits..<2+numDigits+strLen]
        # We create an empty function that will be patched later
        return newEmptyFunctionVal(str)

    raise newException(BytecodeParseError, fmt"Error parsing constant {text}")

proc parseInstructions(lines: seq[string]): seq[uint8] =
    var result: seq[uint8]
    var cont = false
    for instruction in lines:
        if instruction.match(re"jump_if_false|jump -?\d"):
          let opcode = if instruction.startsWith("jump_if_false"):
            Opcode.JumpIfFalse
          else:
            Opcode.Jump
          result.add(opcode.uint8)
          let bytesToJumpOver = instruction.split(re"jump.* ")[1].parseInt
          let highBits = ((bytesToJumpOver shr 8) and 0xff).uint8
          let lowBits = ((bytesToJumpOver) and 0xff).uint8
          result.add(highBits.uint8)
          result.add(lowBits.uint8)

          continue

        # TODO: Use single if for load_constant, define_global
        for opcodeText, opcode in opcodesWithOffset.pairs:
          let str = fmt"{opcodeText} \d"
          if instruction.match(re(str)):
            result.add(opcode.uint8)
            let offsetText = instruction.split(fmt"{opcodeText} ")[1]
            let offset = offsetText.parseInt8
            result.add(offset)
            cont = true
            break

        if cont:
          cont = false
          continue

        if not textToOpcode.hasKey(instruction):
            echoErr fmt"Unknown instruction! {instruction}"
            quit(QuitFailure)
        let opcode = textToOpcode[instruction]
        result.add(opcode.uint8)
    result


proc parseInt8(s: string): uint8 =
    s.parseInt.uint8


proc printKiwiValue*(value: Value): string =
    case value.kind:
    of Nil:
        return "nil"
    of Bool:
        let str = if value.boolVal: "true" else: "false"
        return str
    of Int:
        return fmt"{value.intVal}"
    of Double:
        return fmt"{value.doubleVal}"
    of Object:
        case value.obj.tag:
        of ObjTag.String:
            let obj = downcast[ObjString](value.obj)
            let str = printObjString(obj)
            return str
        of ObjTag.Function:
            let fn = downcast[ObjFunction](value.obj)
            return fmt"[Function: {printObjString(fn.name[])}]"

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

type RuntimeError* = object of Exception
proc runtimeError(self: var Interpreter, msg: string): void =
    let frame = self.frames[self.frameCount]
    # FIXME: Use line info for errors
    #let line = self.findLineWithError(frame.ic)
    #let line = self.bytecode.lineNumbers[opcodeLineIndex]
    let errorMsg = fmt"Error: {msg}"
    self.resetStack
    raise newException(RuntimeError, errorMsg)

# FIXME: This is stupidly inefficient. It's not a big problem
# because we only call it when there's an error, but we should
# still find a more efficient scheme for reporting line numbers
# in runtime errors.
# Easy way would be to just increment opcode starts in interpreter
proc findLineWithError(self: var Interpreter, maxIc: int): int =
  let frame = self.frames[self.frameCount - 1]
  let slot = frame.ic - frame.firstSlotIndex - 1
  return frame.function.bytecode.lineNumbers[slot]
  ## We're going to go through all the instructions while counting the
  ## number of opcodes and ignoring other chunks (e.g. offsets).
  #var lastInstructionStartIndex = 0
  #var skipNext = false
  #for i, instr in self.bytecode.instructions.pairs:
  #  if i >= maxIc:
  #    break
  #  if skipNext:
  #    skipNext = false
  #    continue
  #  let opcode = Opcode(instr)
  #  case opcode:
  #    of Opcode.LoadConstant, Opcode.DefineGlobal, Opcode.GetGlobal, Opcode.SetGlobal:
  #      skipNext = true
  #    else:
  #      discard
  #  lastInstructionStartIndex += 1
  #return lastInstructionStartIndex

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
    of ObjTag.Function:
      # let fn = downcast[ObjFunction](obj)
      # Nothing to do here, everything in ObjFunction is managed by Nim's GC
      discard


proc cleanup*(self: var Interpreter): void =
  echoErr fmt"timePerOpcode: {self.timePerOpcode}"
  echoErr fmt"execPerOpcode: {self.execPerOpcode}"
  for obj in self.heapObjects:
    obj.cleanup

  #for val in self.bytecode.constants:
  #  if val.kind == ValueTag.Object:
  #    val.obj.cleanup

  return

# FIXME: Compile these two procs only in tests
proc registerOpcode*(self: var Interpreter, opcode: Opcode): void =
  self.opcodes.add(opcode)

proc registerOpcodeArg*(self: var Interpreter, arg: uint8): void =
  echoErr fmt"Opcode arg: {arg}"
  self.registerOpcodeArg(arg.int)

proc registerOpcodeArg*(self: var Interpreter, arg: int): void =
  let key = $self.opcodes.len
  if not self.opcodeArgs.hasKey(key):
      self.opcodeArgs[key] = @[]
      return
  self.opcodeArgs[key].add(arg)


func peek(self: Interpreter, dist: Natural): Value =
    self.stack[self.stackTop - dist - 1]

#proc updateBytecode*(self: var Interpreter, newBytecode: Bytecode): void =
#  self.bytecode.instructions = newBytecode.instructions
#  self.bytecode.constants = newBytecode.constants
#  self.bytecode.lineNumbers = newBytecode.lineNumbers
#
#proc mergeBytecode*(self: var Interpreter, newBytecode: Bytecode): void =
#  self.bytecode.instructions = newBytecode.instructions
#  self.bytecode.constants = newBytecode.constants
#  self.bytecode.lineNumbers = newBytecode.lineNumbers
