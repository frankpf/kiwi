{.experimental: "codeReordering".}
from strformat import fmt
from utils import echoErr
var HAS_ERROR = false

proc reportError*(line: int, message: string): void =
    report(line, "", message)

proc report(line: int, where: string, message: string) =
    echoErr fmt"[line: {line}] Error{where}: {message}"
    HAS_ERROR = true
