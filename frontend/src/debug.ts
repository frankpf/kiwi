
export function debug(...args: any[]) {
	if (process.argv.includes("--debug")) {
		console.log(...args)
	}
}
