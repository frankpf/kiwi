export let HAS_ERROR = false

export function error(line: number, message: string) {
	report(line, '', message)
}

function report(line: number, where: string, message: string) {
	console.log(`[line: ${line}] Error${where}: ${message}`)
	HAS_ERROR = true
}
