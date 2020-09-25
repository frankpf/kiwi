{.experimental: "codeReordering".}
from os import walkFiles, getCurrentDir, removeFile
from re import re, match, reIgnoreCase
from strformat import fmt
from times import getTime, `-`, inMilliseconds
from osproc import startProcess, poUsePath, poEvalCommand, errorStream, outputStream
from streams import readAll
from strutils import split, find, strip, repeat
from sugar import `->`
from unpack import `<-`
from terminal as t import nil
from base64 as base64 import nil

type TestCase = object
    path {.requiresInit.}: string
    sourceCode {.requiresInit.}: string
    fileIndex {.requiresInit.}: Natural
    globalIndex {.requiresInit.}: Natural
    expectedStdout: string
    expectedStderr: string
    expectedRegex: bool

proc run(): void =
    var testCases = newSeq[TestCase]()
    var globalIndex = 1
    for file in walkFiles("./tests/test_files/*.kiwi"):
       let content = readFile(file) 
       let fragments = content.split("---")
       var fileIndex = 1
       for fragment in fragments:
            let (metadata, endIndex) = fragment.between("$ ", "\n")
            let sections = metadata.split("; ")
            var testCase = TestCase(path: file, globalIndex: globalIndex, fileIndex: fileIndex, sourceCode: fragment[endIndex+1..<fragment.len], expectedRegex: false)
            for section in sections:
                [k, v] <- section.split(": ")
                case k:
                of "stdout": testCase.expectedStdout = v
                of "stderr": testCase.expectedStderr = v
                of "stderr-regex":
                    testCase.expectedStderr = v
                    testCase.expectedRegex = true
                else: raise newException(Exception, fmt"unknown key {k}") 
            testCases.add(testCase)
            fileIndex += 1
            globalIndex += 1

    var startTime = getTime()
    var successes = 0
    var failures = 0
    for testCase in testCases:
        var startBytecode = getTime()
        let bytecodeText = compileBytecode(testCase.sourceCode)
        var bytecodeMs = (getTime() - startBytecode).inMilliseconds
        if bytecodeText.stderr.strip.len > 0:
            t.styledWrite(stdout, t.fgRed, "Test failed: could not compile bytecode\n")
            t.styledWrite(stdout, t.fgRed, "Got stderr from bytecode compiler:\n")
            t.styledWrite(stdout, t.bgWhite, t.fgBlack, bytecodeText.stderr)
            t.styledWrite(stdout, t.fgRed, "\nTest fragment defined in: {testCase.path} ({testCase.fileIndex})\n".fmt)
            failures += 1
            continue
        var startInterpret = getTime()
        let (stdoutText, stderrText) = interpret(bytecodeText.stdout)
        var interpretMs = (getTime() - startInterpret).inMilliseconds
        var stream = ""
        let testPassed = if testCase.expectedStdout.len > 0:
          stream = "stdout"
          stdoutText.strip == testCase.expectedStdout
        else:
          stream = "stderr"
          if testCase.expectedRegex:
            stderrText.strip.match(re(testCase.expectedStderr, {reIgnoreCase}))
          else:
            stderrText.strip == testCase.expectedStderr
        if testPassed:
            successes += 1
            t.styledWrite(stdout, t.fgGreen, "Test #{testCase.globalIndex} passed [took {interpretMs}ms interpreting, {bytecodeMs}ms generating bytecode]\n".fmt)
        else:
            failures += 1
            t.styledWrite(stdout, t.fgRed, "Test #{testCase.globalIndex} failed [took {interpretMs}ms interpreting, {bytecodeMs}ms generating bytecode]\n".fmt)
            let expectEq = if stream == "stdout":
                testCase.expectedStdout
            else:
                testCase.expectedStderr
            t.styledWrite(stdout, t.fgRed, "Expected {stream} to eq(regex={testCase.expectedRegex}): {expectEq}\n".fmt)
            t.styledWrite(stdout, t.fgRed, "              but got stdout: {stdoutText.strip}\n".fmt)
            if stderrText.strip.len > 0:
                 t.styledWrite(stdout, t.fgRed, "     also got stderr: {stderrText.strip}\n".fmt)
            t.styledWrite(stdout, t.fgRed, "got following bytecode: \n")
            t.styledWrite(stdout, t.bgWhite, t.fgBlack, bytecodeText.stdout)
            t.styledWrite(stdout, t.fgRed, "\nTest fragment defined in: {testCase.path} ({testCase.fileIndex})\n".fmt)
            t.styledWrite(stdout, t.fgBlue, "\nTo reproduce this failure, use the following command:")
            let reproCmd = getReproCmd(testCase)
            t.styledWrite(stdout, t.bgRed, t.fgWhite, "\n{reproCmd}\n".fmt)
        t.styledWrite(stdout, t.fgBlue, "⎯".repeat(50) & "\n")
    var totalMs = (getTime() - startTime).inMilliseconds
    t.styledWrite(stdout, t.fgGreen, t.styleItalic, "{successes} tests passed\n".fmt)
    t.styledWrite(stdout, t.fgRed, t.styleItalic, "{failures} tests failed\n".fmt)
    t.styledWrite(stdout, t.fgWhite, "Took {totalMs}ms\n".fmt)


type ExecCmdResult = tuple[stdout: string, stderr: string]
proc compileBytecode(sourceCode: string): ExecCmdResult =
   runCommandWithFile(
       sourceCode,
       "..",
       proc (f: string): string = fmt"node dist/src/index.js --file {f}",
   )

proc getReproCmd(testCase: TestCase): string =
  let encoded = base64.encode(testCase.sourceCode)
  return fmt"echo '{encoded}' | base64 -d | node ../dist/src/index.js --stdin | ./kiwi"


proc interpret(bytecode: string): ExecCmdResult =
   runCommandWithFile(
       bytecode,
       ".",
       proc (f: string): string = fmt"cat {f} | ./kiwi"
   )

proc runCommandWithFile(str: string, workingDir: string, buildCommand: (string) -> string): ExecCmdResult =
   let filename = "/tmp/kiwi_tmp_file"
   writeFile(filename, str)
   let process = startProcess(
       buildCommand(filename),
       workingDir=workingDir,
       options={poEvalCommand, poUsePath}
   )
   let stdout = process.outputStream.readAll
   let stderr = process.errorStream.readAll
   removeFile(filename)
   (stdout, stderr)

when isMainModule:
   run()

proc between(s: string, startStr: string, endStr: string): tuple[str: string, endIndex: int] =
   let start = s.find(startStr)
   var str = s[start..<s.len]
   let endIndex = str.find(endStr)
   str = str[0 + startStr.len..<endIndex]
   (str, start + endIndex)

