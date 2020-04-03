export type Lazy<A> = () => A
export const lazy = <A>(arg: A) => () => arg

export function _(...args: any): any {
	throw new Error('not implemented')
}
