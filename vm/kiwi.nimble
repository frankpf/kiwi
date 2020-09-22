# Package

version       = "0.1.0"
author        = "Frank Paulo Filho"
description   = "Kiwi compiler"
license       = "ISC"
srcDir        = "src"
bin           = @["kiwi"]

# Dependencies

requires "nim >= 1.0.6"
requires "unpack"

# Tasks


task testsf, "Run tests":
    exec("tests/interpreter")

task tests, "Compile and run tests":
    exec("nimble c --opt:none tests/interpreter.nim && tests/interpreter")
