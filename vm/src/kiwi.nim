from scanner import scanText
from interpreter import parseTextualBytecode, newInterpreter, interpret, cleanup, RuntimeError
from utils import kiwiPrintErr
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
    try:
      interp.interpret
      interp.cleanup
    except RuntimeError as e:
      kiwiPrintErr e.msg


when isMainModule:
    main()
