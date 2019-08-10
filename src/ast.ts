import {Token} from './token'

export class Literal {
	readonly type = 'literal'
	constructor(readonly value: any) {}
}

export class Unary {
	readonly type = 'unary'
	constructor(readonly operator: Token, readonly right: Expr) {}
}

export class Binary {
	readonly type = 'binary'
	constructor(
		readonly left: Expr,
		readonly operator: Token,
		readonly right: Expr,
	) {}
}

export class Grouping {
	readonly type = 'grouping'
	constructor(readonly expression: Expr) {}
}

export type Expr = Literal | Unary | Binary | Grouping
