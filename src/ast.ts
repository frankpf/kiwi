import {Token} from './token'
import {matchAll} from './match'

export type Expr =
	| Expr.Literal
	| Expr.Unary
	| Expr.Binary
	| Expr.Grouping
	| Expr.LetAccess
	| Expr.Block
	| Expr.If
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

	export class Block {
		readonly _tag = 'Block'
		constructor(readonly statements: Stmt[]) {}
	}

	export class If {
		readonly _tag = 'If'
		constructor(
			readonly condition: Expr,
			readonly thenBlock: Block,
			// We call it elseTail and not elseBlock because it could be an `else if { ... }`
			readonly elseTail?: Block | If,
		) {}
	}
}

/*=================
 Statements
 ==================*/
export type Stmt =
	| Stmt.Expression
	| Stmt.Print
	| Stmt.LetDeclaration
	| Stmt.Assignment
	| Stmt.While
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

	export class Assignment {
		static readonly uri = 'Assignment'
		readonly _tag = Assignment.uri
		constructor(readonly name: Token, readonly value: Expr) {}
	}

	export class While {
		static readonly uri = 'While'
		readonly _tag = While.uri
		constructor(readonly condition: Expr, readonly block: Expr.Block) {}
	}
}

/*=================
 Node
 ==================*/
// export type Node = Stmt | Expr
