#proc repl() =
#    # FIXME: we're redirecting to a file
#    # as a workaround to a bug in stdlib's process.hasData
#    let workingDir = ".."
#    let process = startProcess(
#      "node dist/src/index.js --replCompiler 2>&1 > replstream.txt",
#      workingDir=workingDir,
#      options={poEvalCommand, poUsePath},
#    )
#    var procStdin: File
#    discard procStdin.open(process.inputHandle, fmWrite)
#    var replCompilerStream = open(fmt"{workingDir}/replstream.txt")
#
#
#    var readInput = true
#    var prevRes: string
#    var interp: Interpreter
#    while true:
#        if readInput:
#          let input = readLineFromStdin("k > ") & "\n"
#          if input.len - 1 > 0:
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
#        if interp.initialized == 0:
#          interp = newInterpreter(parsed)
#        else:
#          interp.updateBytecode(parsed)
#
#        try:
#          interp.interpret
#        except RuntimeError as e:
#          kiwiPrintErr e.msg
