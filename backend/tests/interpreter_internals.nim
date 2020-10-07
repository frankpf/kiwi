{.experimental: "codeReordering".}
from ../src/scanner import scanText
from ../src/interpreter import parseTextualBytecode, newInterpreter, interpret, cleanup, RuntimeError, Opcode
from ../src/utils import kiwiPrintErr
from strformat import fmt

const src = """
let a = true;
let b = true;

if (a) {
    print "if";
} else if (b) {
    print "elseif";
      print "alallala";
} else {
    print "else";
};

print "Always!";
"""

const bytecode = """
VERSION 0

START INSTRUCTIONS
load_true
define_global 0
load_true
define_global 1
get_global 0
jump_if_false 6
load_constant 2
print
jump 17
get_global 1
jump_if_false 9
load_constant 3
print
load_constant 4
print
jump 3
load_constant 5
print
load_constant 6
print
return
END

START CONSTANTS
s1 a
s1 b
s3 1if
s7 2elseif
s9 2alallala
s5 3else
s7 Always!
END

START LINENUM
1
1
2
2
4
4
5
5
6
6
6
7
7
8
8
9
10
10
13
13
13
END
"""

proc run() =
    echo "Interpreter internal tests"
    let parsed = bytecode.parseTextualBytecode
    var interp = newInterpreter(parsed)
    try:
        interp.interpret
        interp.cleanup
    except RuntimeError as e:
        kiwiPrintErr e.msg
    doAssert interp.opcodes == @[
      # Init a and b 
      Opcode.LoadTrue, Opcode.DefineGlobal, Opcode.LoadTrue, Opcode.DefineGlobal,
      # If condition and first then block
      Opcode.GetGlobal, Opcode.JumpIfFalse, Opcode.LoadConstant, Opcode.Print, Opcode.Jump,
      # After if-elseif-else block
      Opcode.LoadConstant, Opcode.Print,
      # Return
      Opcode.Return
    ], fmt"got {interp.opcodes}"

when isMainModule:
    run()
