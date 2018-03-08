import { readFileSync } from 'fs'
import { Lexer } from './lexer'

function compile(source: string) {
	const lexer = new Lexer(source)
	const tokens = lexer.scanTokens()

	return tokens
}

async function main() {
	const args = process.argv.slice(2)

	const filename = args[0]
	const file = readFileSync(filename, 'utf8')

	const ast = compile(file)
	console.log(ast)
}

main()
