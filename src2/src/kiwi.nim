from scanner import scanText
from interpreter import parseTextualBytecode, newInterpreter, interpret, cleanup
from os import commandLineParams
from sequtils import anyIt
from parseopt import initOptParser

proc main() =
    # let source = stdin.readAll
    # let tokens = scanText(source)
    let bytecode = stdin.readAll
    let parsed = parseTextualBytecode(bytecode)
    # echo parsed.repr
    var interp = newInterpreter(parsed)
    interp.interpret
    interp.cleanup


when isMainModule:
    main()
