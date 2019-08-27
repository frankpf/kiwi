import 'source-map-support/register'

import {HAS_ERROR} from './error'
import {readFileSync} from 'fs'
import {Scanner} from './scanner'
import {Parser} from './parser'
import {printAst} from './printer'
import * as jsInterpreter from './backends/js-interpreter'
import * as Ast from './ast'
import * as llvmBackend from './backends/llvm'

function compile(source: string) {
	const tokens = Scanner.scanText(source)
	return tokens
}

async function main() {
	const args = process.argv.slice(2)

	const filename = args[0]
	const file = readFileSync(filename, 'utf8')

	// const ast = compile(file)
	// if (HAS_ERROR) {
	// 	process.exit(1)
	// }

	// for (const token of ast) {
	// 	console.log(token)
	// }

	const src = `\
let a = 9;
print a;
let b = 2;
print b;
print a + b;
`
	const tokens = Scanner.scanText(src)
	const ast = Parser.parseTokens(tokens)
	const statements = ast!.filter((s): s is Ast.Stmt => s !== null)
	console.log(llvmBackend.compile(statements))
}

main()
