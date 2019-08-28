import {Token} from './token'
import {matchAll} from './match'

export type Expr =
	| Expr.Literal
	| Expr.Unary
	| Expr.Binary
	| Expr.Grouping
	| Expr.LetAccess
export namespace Expr {
	export class Literal {
		readonly _tag = 'Literal'
		constructor(readonly value: any) {}
	}

	export class Unary {
		readonly _tag = 'Unary'
		constructor(readonly operator: Token, readonly right: Expr) {}
	}

	export class Binary {
		readonly _tag = 'Binary'
		constructor(
			readonly left: Expr,
			readonly operator: Token,
			readonly right: Expr,
		) {}
	}

	export class Grouping {
		readonly _tag = 'Grouping'
		constructor(readonly expression: Expr) {}
	}

	export class LetAccess {
		readonly _tag = 'LetAccess'
		constructor(readonly identifier: Token) {}
	}
}

/*=================
 Statements
 ==================*/
export type Stmt = Stmt.Expression | Stmt.Print | Stmt.LetDeclaration
export namespace Stmt {
	export class Expression {
		static readonly uri = 'Expression'
		readonly _tag = Expression.uri
		constructor(readonly expression: Expr) {}
	}

	export class Print {
		static readonly uri = 'Print'
		readonly _tag = Print.uri
		constructor(readonly expression: Expr) {}
	}

	export class LetDeclaration {
		static readonly uri = 'LetDeclaration'
		readonly _tag = LetDeclaration.uri
		constructor(readonly identifier: Token, readonly initializer?: Expr) {}
	}
}

/*=================
 Node
 ==================*/
// export type Node = Stmt | Expr
