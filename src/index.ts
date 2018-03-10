import { readFileSync } from 'fs'
import { Scanner } from './scanner'

function compile(source: string) {
	const scanner = new Scanner(source)
	const tokens = scanner.scanTokens()

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
