export type Lazy<A> = () => A
export const lazy = <A>(arg: A) => () => arg
