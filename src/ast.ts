import {Token} from './token'
import {KiwiType} from './types'

export type Expr = Expr.Literal | Expr.Unary | Expr.Binary | Expr.Grouping | Expr.LetAccess | Expr.Block | Expr.If | Expr.Function | Expr.Call

export namespace Expr {
	export class Literal {
		readonly _tag = 'Literal'
		constructor(readonly value: KiwiType, readonly _startToken: Token) {}
		get startToken() { return this._startToken }
	}

	export class Unary {
		readonly _tag = 'Unary'
		constructor(readonly operator: Token, readonly right: Expr) {}
		get startToken() { return this.operator }
	}

	export class Binary {
		readonly _tag = 'Binary'
		constructor(readonly left: Expr, readonly operator: Token, readonly right: Expr) {}
		get startToken() { return this.operator }
	}

	export class Grouping {
		readonly _tag = 'Grouping'
		constructor(readonly expression: Expr, readonly openParenToken: Token) {}
		get startToken() { return this.openParenToken }
	}

	export class LetAccess {
		readonly _tag = 'LetAccess'
		constructor(readonly identifier: Token) {}
		get startToken() { return this.identifier }
	}

	export class Block {
		readonly _tag = 'Block'
		constructor(readonly statements: Stmt[], readonly openBraceToken: Token) {}
		get startToken() { return this.openBraceToken }
	}

	export class If {
		readonly _tag = 'If'
		constructor(
			readonly condition: Expr,
			readonly thenBlock: Block,
			// We call it elseTail and not elseBlock because it could be an `else if { ... }`
			readonly elseTail?: Block | If,
			readonly elseTailToken?: Token,
		) {}
		get startToken(): Token { return this.condition.startToken }
	}

	export class Function {
		readonly _tag = 'Function'
		constructor(readonly name: Token, readonly params: Token[], readonly body: Stmt[], readonly functionToken: Token, readonly returnStmt: Stmt.Return) {}
		get startToken() { return this.functionToken }
	}

	export class Call {
		readonly _tag = 'Call'
		constructor(readonly callee: Expr, readonly args: Expr[], readonly closeParenToken: Token) {}
		get startToken() { return this.closeParenToken } // FIXME: should this be the identifier called?
	}
}

/*=================
 Statements
 ==================*/
export type Stmt = Stmt.Expression | Stmt.Print | Stmt.LetDeclaration | Stmt.Assignment | Stmt.While | Stmt.Debugger | Stmt.Return

export namespace Stmt {
	export class Expression {
		static readonly uri = 'Expression'
		readonly _tag = Expression.uri
		constructor(readonly expression: Expr, readonly semicolonToken: Token) {}
	}

	export class Print {
		static readonly uri = 'Print'
		readonly _tag = Print.uri
		constructor(readonly expression: Expr, readonly printToken: Token) {}
	}

	export class Debugger {
		static readonly uri = 'Debugger'
		readonly _tag = Debugger.uri
		constructor(readonly debuggerToken: Token) {}
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

	export class Return {
		static readonly uri = 'Return'
		readonly _tag = Return.uri
		constructor(readonly expression: Expr) {}
	}
}

/*=================
 Node
 ==================*/
// export type Node = Stmt | Expr
