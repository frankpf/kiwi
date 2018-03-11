import { Token, TokenType } from './token'

/**
  * We use algebraic data types[1] to represent `Expr`s.
  *
  * Ideally, we would like a syntax like Rust's tagged enums[2]
  * but since TypeScript doesn't have that, we use classes instead of
  * the more usual interfaces for each individual ADT type.
  *
  * With classes, callers can build types using the constructor:
  *     new Binary(<left>, <operator>, <right>)
  * versus the more verbose:
  *     { type: 'binary', left: <left>, operator: <operator>, right: <right> }
  *
  * [1]: https://www.typescriptlang.org/docs/handbook/advanced-types.html
  * [2]: https://doc.rust-lang.org/1.1.0/book/enums.html
  */

export class Literal {
	public readonly type = 'literal'
	constructor(
		public readonly value: any, // TODO: Use a custom `KiwiType`
	) {}
}

export class Unary {
	public readonly type = 'unary'
	constructor(
		public readonly operator: Token,
		public readonly right: Expr,
	) {}
}

export class Binary {
	public readonly type = 'binary'
	constructor(
		public readonly left: Expr,
		public readonly operator: Token,
		public readonly right: Expr,
	) {}
}

export class Grouping {
	public readonly type = 'grouping'
	constructor(
		public readonly expression: Expr,
	) {}
}

export type Expr = Literal | Unary | Binary | Grouping
