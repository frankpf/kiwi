import * as readline from 'readline'
import {Scanner} from './scanner'
import {HAS_ERROR} from './error'
import {Parser} from './parser'
import {fromAst} from './backends/bytecode/instruction'
import * as Ast from './ast'

export async function startReplCompiler() {
	let src = ''
	for await (const t of replGen()) {
		src += t
		const tokens = Scanner.scanText(src)
		const ast = Parser.parseTokens(tokens)
		if (HAS_ERROR || ast === null) {
			continue
		}
		const nonNullStatements = ast.filter((s): s is Ast.Stmt => s !== null)
		process.stdout.write(fromAst(nonNullStatements))
	}
}

async function* replGen() {
	while (true) {
		const text = await readStdinRepl()
		if (text === 1) {
			return
		}
		yield text
	}
}

function readStdinRepl(): Promise<string | 1> {
	return new Promise(resolve => {
		let src = ''
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false,
		})


		rl.on('line', line => {
			if (line.trim() === '$RESET$') {
				rl.close()
				resolve(src)
				return
			} else if (line.trim() === '$END$') {
				rl.close()
				resolve(1);
				return
			} else {
				src += line;
			}
		})
		//process.stdin.on('readable', () => {
		//	while (true) {
		//		const chunk = process.stdin.read()
		//		console.log('got chunk', 'START'+chunk?.toString('utf8')+'END')
		//		if (chunk === null) { break }
		//		const text = chunk.toString('utf8')
		//		if (text.trim() === '$RESET$') {
		//			process.stdin.removeAllListeners()
		//			console.log('resolving')
		//			resolve(src)
		//			src = ""
		//		} else if (text.trim() === '$END$') {
		//			process.stdin.removeAllListeners()
		//			resolve(1);
		//		} else {
		//			console.log('textin')
		//			src += text
		//		}
		//	}
		//})
	})
}
