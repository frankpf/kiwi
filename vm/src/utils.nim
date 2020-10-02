from os import commandLineParams
from sequtils import anyIt

proc debugMode*(): bool = commandLineParams().anyIt(it == "--debug")

template echoErr*(msg: string) =
    if debugMode():
      stderr.write("[kiwi] " & msg & "\n")

proc kiwiPrint*(msg: string) =
    echo msg

proc kiwiPrintErr*(msg: string) =
    stderr.write(msg & "\n")

