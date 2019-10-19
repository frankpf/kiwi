import 'source-map-support/register'

import {HAS_ERROR} from './error'
import * as fs from 'fs'
import {Scanner} from './scanner'
import {Parser} from './parser'
import {spawnSync} from 'child_process'
import * as Ast from './ast'
import * as llvmBackend from './backends/llvm'

const llcPath = '/usr/local/Cellar/llvm/8.0.1/bin/llc'
const lliPath = '/usr/local/Cellar/llvm/8.0.1/bin/lli'

export async function main(args: string[]) {
	const filename = args[0]
	const fileContent = fs.readFileSync(filename, 'utf8')

	const tokens = Scanner.scanText(fileContent)
	const ast = Parser.parseTokens(tokens)
	if (HAS_ERROR || ast === null) {
		process.exit(1)
		return
	}
	const nonNullStatements = ast.filter((s): s is Ast.Stmt => s !== null)
	const llvmIr = llvmBackend.compile(nonNullStatements)
	// process.stdout.write(llvmIr)

	const llvmIrOutputPath = 'kiwi-output.ll'
	fs.writeFileSync(llvmIrOutputPath, llvmIr)
	const llcOutput = spawnSync(llcPath, [
		'-filetype=obj',
		llvmIrOutputPath,
		'-o',
		'kiwi-output.o',
	])
	// console.log(llcOutput.stderr.toString())
	// console.log(llcOutput.status)
	const f = spawnSync('gcc', [
		'kiwi-output.o',
		'lib/globals.o',
		'-o',
		'kiwi.out',
	])
	spawnSync('rm', [llvmIrOutputPath, 'kiwi-output.o'])
	// console.log(f.status)
	// console.log('LLVM IR created: kiwi-output.ll')
	console.log('Executable created: kiwi.out')
}
