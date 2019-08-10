import {Token} from './token'

export class Literal {
	readonly type = 'Literal'
	constructor(readonly value: any) {}
}

export class Unary {
	readonly type = 'Unary'
	constructor(readonly operator: Token, readonly right: Expr) {}
}

export class Binary {
	readonly type = 'Binary'
	constructor(
		readonly left: Expr,
		readonly operator: Token,
		readonly right: Expr,
	) {}
}

export class Grouping {
	readonly type = 'Grouping'
	constructor(readonly expression: Expr) {}
}

export type Expr = Literal | Unary | Binary | Grouping
