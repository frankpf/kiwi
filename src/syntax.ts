import { mkAdtConstructor } from './utils'
import { Token, TokenType } from './token'

/**
  * We use algebraic data types[1] to represent `Expr`s.
  *
  * We use the helper function `mkAdtConstructor` to create
  * each individual ADT constructor.
  *
  * With these interface constructors, callers can build types this way:
  *     Binary(<left>, <operator>, <right>)
  * instead of the more verbose:
  *     { type: 'binary', left: <left>, operator: <operator>, right: <right> }
  *
  * [1]: https://www.typescriptlang.org/docs/handbook/advanced-types.html
  */

export interface Literal {
	type: 'literal'
	value: any
}
export const Literal = mkAdtConstructor<Literal>('literal', ['value'])


export interface Unary {
	type: 'unary'
	operator: Token,
	right: Expr,
}
export const Unary = mkAdtConstructor<Unary>('unary', ['operator', 'right'])


export interface Binary {
	type: 'binary'
	left: Expr,
	operator: Token,
	right: Expr
}
export const Binary = mkAdtConstructor<Binary>('binary', ['left', 'operator', 'right'])


export interface Grouping {
	type: 'grouping'
	expression: Expr,
}
export const Grouping = mkAdtConstructor<Grouping>('grouping', ['expression'])


export type Expr = Literal | Unary | Binary | Grouping
