export type Lazy<A> = () => A
export const lazy = <A>(arg: A) => () => arg

export function _(msg?: string, ...args: any): any {
	throw new Error(msg || 'Not implemented')
}

export type TupleLength<T extends any[]> = T extends { length: infer L } ? L : never
