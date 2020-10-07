from interpreter import parseTextualBytecode, newInterpreter, interpret, cleanup, RuntimeError
from utils import kiwiPrintErr

proc main() =
    let bytecode = stdin.readAll
    let topLevel = parseTextualBytecode(bytecode)
    var interp = newInterpreter(topLevel)
    try:
      interp.interpret()
      interp.cleanup
    except RuntimeError as e:
      kiwiPrintErr e.msg

when isMainModule:
    main()
