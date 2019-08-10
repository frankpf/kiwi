import {Token, TokenType} from './token'
export let HAS_ERROR = false

export function error(item: Token, message: string): void
export function error(item: number, message: string): void
export function error(item: number | Token, message: string): void {
	if (typeof item === 'number') {
		report(item, '', message)
	} else {
		if (item.type === TokenType.Eof) {
			report(item.line, ' at end', message)
		} else {
			report(item.line, ` at "${item.lexeme}"`, message)
		}
	}
}

function report(line: number, where: string, message: string) {
	console.log(`[line: ${line}] Error${where}: ${message}`)
	HAS_ERROR = true
}
