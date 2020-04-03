import 'source-map-support/register'

import {HAS_ERROR} from './error'
import * as fs from 'fs'
import {Scanner} from './scanner'
import {Parser} from './parser'
import * as Ast from './ast'
import {fromAst} from './backends/bytecode/instruction'

export async function main(args: string[]) {
	const filename = args[0]
	if (!filename) {
		console.log('Please specify <filename>')
		process.exit(1)
	}
	const fileContent = fs.readFileSync(filename, 'utf8')

	const tokens = Scanner.scanText(fileContent)
	const ast = Parser.parseTokens(tokens)
	if (HAS_ERROR || ast === null) {
		process.exit(1)
	}
	const nonNullStatements = ast.filter((s): s is Ast.Stmt => s !== null)
	const bytecode = fromAst(nonNullStatements)
	process.stdout.write(bytecode)
}

main(process.argv.slice(2))
