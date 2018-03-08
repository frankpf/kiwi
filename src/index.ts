import * as fs from 'fs'
import { promisify } from 'util'
import { Lexer } from './lexer'

const readFile = promisify(fs.readFile)

function compile(source: string) {
	const lexer = new Lexer(source)
	const tokens = lexer.scanTokens()

	return tokens
}

async function main() {
	const args = process.argv.slice(2)
	const filename = args[0]

	const file = await readFile(filename, 'utf8')

	const ast = compile(file)
	console.log(ast)
}

main()
