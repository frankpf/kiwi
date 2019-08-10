import {Token, TokenType} from './token'

/**
 * We use algebraic data types[1] to represent `Expr`s.
 *
 * With the interface constructors, callers can build types this way:
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
export const Literal = (value: any): Literal => ({type: 'literal', value})

export interface Unary {
	type: 'unary'
	operator: Token
	right: Expr
}
export const Unary = (operator: Token, right: Expr): Unary => ({
	type: 'unary',
	operator,
	right,
})

export interface Binary {
	type: 'binary'
	left: Expr
	operator: Token
	right: Expr
}
export const Binary = (left: Expr, operator: Token, right: Expr): Binary => ({
	type: 'binary',
	left,
	operator,
	right,
})

export interface Grouping {
	type: 'grouping'
	expression: Expr
}
export const Grouping = (expression: Expr): Grouping => ({
	type: 'grouping',
	expression,
})

export type Expr = Literal | Unary | Binary | Grouping
