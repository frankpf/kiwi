type HasTypeKey<T> = { type: any }
export function mkAdtConstructor<T extends HasTypeKey<T>>(type: T['type'], keys: (keyof T)[]) {
	return (...values: any[]): T => {
		const obj = {} as any
		for (const [i, key] of keys.entries()) {
			obj[key] = values[i]
		}
		return obj
	}
}
