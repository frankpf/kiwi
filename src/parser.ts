import {error} from './error'
import {Token, TokenType} from './token'
import * as Ast from './ast'
import {Lazy} from './utils'

class ParseError extends Error {}

export class Parser {
	private constructor(private readonly tokens: Array<Token>, private current = 0) {}

	static parseTokens(tokens: Token[]): (Ast.Stmt | null)[] | null {
		const parser = new Parser(tokens)
		return parser.parse()
	}

	private parse(): (Ast.Stmt | null)[] | null {
		try {
			return this.program()
		} catch (err) {
			if (err instanceof ParseError) {
				return null
			}
			throw err
		}
	}

	private program(): (Ast.Stmt | null)[] {
		const statements = [] as (Ast.Stmt | null)[]
		while (!this.isAtEnd()) {
			statements.push(this.statement())
		}
		return statements
	}

	private statement(): Ast.Stmt | null {
		try {
			if (this.match(TokenType.Debugger)) {
				return this.finishDebuggerStatement(this.previous())
			}

			if (this.match(TokenType.Print)) {
				return this.finishPrintStatement(this.previous())
			}

			if (this.match(TokenType.Let)) {
				return this.finishLetDeclarationStatement()
			}

			if (this.match(TokenType.While)) {
				return this.finishWhileStatement()
			}

			if (this.match(TokenType.Return)) {
				return this.finishReturnStatement(this.previous())
			}

			return this.assignmentOrExpressionStatement()
		} catch (err) {
			if (err instanceof ParseError) {
				this.synchronize()
				return null
			}
			throw err
		}
	}

	private finishReturnStatement(returnToken: Token): Ast.Stmt.Return {
		if (this.match(TokenType.Semicolon)) {
			return new Ast.Stmt.Return(
				new Ast.Expr.Literal(
					null,
					new Token(TokenType.Nil, 'nil', null, returnToken.line),
				)
			)
		} else {
			const expr = this.expression()
			this.consume(TokenType.Semicolon, 'Expected ";" after return value')
			return new Ast.Stmt.Return(expr)
		}
	}

	private finishDebuggerStatement(debuggerToken: Token): Ast.Stmt.Debugger {
		this.consume(TokenType.Semicolon, 'Expected ";" after debugger statement')
		return new Ast.Stmt.Debugger(debuggerToken)
	}

	private assignmentOrExpressionStatement(): Ast.Stmt.Assignment | Ast.Stmt.Expression {
		const expr = this.expression()

		if (this.match(TokenType.Equal)) {
			const equals = this.previous()
			const value = this.expression()

			if (expr instanceof Ast.Expr.LetAccess) {
				const identifier = expr.identifier
				this.consume(TokenType.Semicolon, 'Expected ";" after assignment')
				return new Ast.Stmt.Assignment(identifier, value)
			}

			this.error(equals, 'Invalid assignment target')
		}

		this.consume(TokenType.Semicolon, 'Expected ";" after assignment')
		return new Ast.Stmt.Expression(expr, this.previous())
	}

	private finishWhileStatement(): Ast.Stmt.While {
		const condition = this.expression()
		this.consume(TokenType.OpenBrace, 'Expected "{" after while condition.')
		const block = this.finishBlockExpression(this.previous())
		this.consume(TokenType.Semicolon, 'Expected ";" after while block.')
		return new Ast.Stmt.While(condition, block)
	}

	private finishLetDeclarationStatement(): Ast.Stmt {
		const identifier = this.consume(TokenType.Identifier, 'Expected variable name')
		let initializer: Ast.Expr | undefined = undefined
		if (this.match(TokenType.Equal)) {
			initializer = this.expression()
		}
		this.consume(TokenType.Semicolon, 'Expected ";" after let initializer')
		return new Ast.Stmt.LetDeclaration(identifier, initializer)
	}

	private finishPrintStatement(printToken: Token) {
		const expr = this.expression()
		this.consume(TokenType.Semicolon, 'Expected ";" after expression')
		return new Ast.Stmt.Print(expr, printToken)
	}

	/*
	private expressionStatement() {
		const expr = this.expression()
		this.consume(TokenType.Semicolon, 'Expected ";" after expression')
		return new Ast.Stmt.Expression(expr)
	}
	*/

	private expression(): Ast.Expr {
		if (this.match(TokenType.Fun)) {
			return this.finishFunctionExpression(this.previous(), 'function')
		}
		return this.logicOr()
	}

	private finishFunctionExpression(funcToken: Token, kind: 'function' | 'class method') {
		// TODO: Make this optional
		const identifier = this.consume(TokenType.Identifier, `Expected ${kind} name`)
		this.consume(TokenType.OpenParen, `Expected "(" after ${kind} name`)
		const paramList = [] as Token[]
		if (this.match(TokenType.Identifier)) {
			const firstParam = this.previous()
			paramList.push(firstParam)
			while (this.match(TokenType.Comma)) {
				const param = this.consume(TokenType.Identifier, `Expected parameter name after comma in parameter list for ${identifier.lexeme} ${kind}`)
				paramList.push(param)
			}
		}
		this.consume(TokenType.CloseParen, `Expected ")" after ${identifier.lexeme} ${kind} parameter list`)
		this.consume(TokenType.OpenBrace, `Expected "{" before ${identifier.lexeme} ${kind} body`)
		const {statements} = this.finishBlockExpression(this.previous())

		// Desugar function return
		const lastStmt = statements[statements.length-1]
		let returnStmt: Ast.Stmt.Return
		if (lastStmt instanceof Ast.Stmt.Return) {
			statements.pop()
			returnStmt = lastStmt
		} else if (lastStmt instanceof Ast.Stmt.Expression) {
			statements.pop()
			returnStmt = new Ast.Stmt.Return(lastStmt.expression)
		} else {
			returnStmt = new Ast.Stmt.Return(
				new Ast.Expr.Literal(
					null,
					new Token(
						TokenType.Nil,
						'nil',
						null,
						-1 // FIXME: emit proper line number
					)
				)
			)
		}
		return new Ast.Expr.Function(identifier, paramList, statements, funcToken, returnStmt)
	}

	private logicOr(): Ast.Expr {
		// logic_or -> logic_and ( "&&" logic_and )* .
		const op = this.logicAnd.bind(this)
		const types = [TokenType.Or]
		return this.leftAssocBinOp(op, types)
	}

	private logicAnd(): Ast.Expr {
		// logic_and -> equality ( "&&" equality )* .
		const op = this.equality.bind(this)
		const types = [TokenType.And]
		return this.leftAssocBinOp(op, types)
	}

	private equality(): Ast.Expr {
		// equality -> comparison ( ( "!=" | "==" ) comparison )* ;
		const op = this.comparison.bind(this)
		const types = [TokenType.BangEqual, TokenType.EqualEqual]
		return this.leftAssocBinOp(op, types)
	}

	private comparison(): Ast.Expr {
		// comparison -> addition ( ( ">" | ">=" | "<" | "<=" ) addition )* ;
		const op = this.addition.bind(this)
		const types = [TokenType.Greater, TokenType.GreaterEqual, TokenType.Less, TokenType.LessEqual]
		return this.leftAssocBinOp(op, types)
	}
	private addition(): Ast.Expr {
		// addition -> multiplication ( ( "-" | "+" ) multiplication )* ;
		const op = this.multiplication.bind(this)
		const types = [TokenType.Minus, TokenType.Plus]
		return this.leftAssocBinOp(op, types)
	}
	private multiplication(): Ast.Expr {
		// multiplication -> unary ( ( "/" | "*" ) unary )* ;
		const op = this.unary.bind(this)
		const types = [TokenType.Slash, TokenType.Star]
		return this.leftAssocBinOp(op, types)
	}
	private unary(): Ast.Expr {
		// unary -> ( "!" | "-" ) unary | primary ;
		if (this.match(TokenType.Bang, TokenType.Minus)) {
			const operator = this.previous()
			const right = this.unary()
			return new Ast.Expr.Unary(operator, right)
		}

		return this.call()
	}

	private call(): Ast.Expr {
		let expr = this.primary()

		while (true) {
			if (this.match(TokenType.OpenParen)) {
				expr = this.finishCall(expr)
			} else {
				break
			}
		}

		return expr
	}

	private finishCall(callee: Ast.Expr): Ast.Expr.Call {
		const args = [] as Ast.Expr[]
		if (!this.check(TokenType.CloseParen)) {
			do {
				args.push(this.expression())
			} while (this.match(TokenType.Comma))
		}
		const paren = this.consume(TokenType.CloseParen, 'Expected "," after arguments.')

		return new Ast.Expr.Call(callee, args, paren)
	}

	private primary(): Ast.Expr {
		// primary -> NUMBER | STRING | "false" | "true" | "nil" | "(" expression ")" ;
		if (this.match(TokenType.False)) {
			return new Ast.Expr.Literal(false, this.previous())
		}

		if (this.match(TokenType.True)) {
			return new Ast.Expr.Literal(true, this.previous())
		}

		if (this.match(TokenType.Nil)) {
			return new Ast.Expr.Literal(null, this.previous())
		}

		if (this.match(TokenType.IntegerLit, TokenType.DoubleLit, TokenType.StringLit)) {
			return new Ast.Expr.Literal(this.previous().literal, this.previous())
		}

		if (this.match(TokenType.Identifier)) {
			return new Ast.Expr.LetAccess(this.previous())
		}

		if (this.match(TokenType.OpenParen)) {
			const openParenToken = this.previous()
			const expr = this.expression()
			this.consume(TokenType.CloseParen, 'Expected ")" after expression')
			return new Ast.Expr.Grouping(expr as Ast.Expr, openParenToken)
		}

		if (this.match(TokenType.If)) {
			return this.finishIfExpression()
		}

		if (this.match(TokenType.OpenBrace)) {
			return this.finishBlockExpression(this.previous())
		}

		throw this.error(this.peek(), 'Expected expression')
	}

	private finishIfExpression(): Ast.Expr.If {
		const condition = this.expression()
		this.consume(TokenType.OpenBrace, 'Expected "{" after if condition')
		const thenBlock = this.finishBlockExpression(this.previous())
		if (this.match(TokenType.Else)) {
			if (this.match(TokenType.If)) {
				// else if {
				const elseIf = this.finishIfExpression()
				return new Ast.Expr.If(condition, thenBlock, elseIf)
			} else {
				// else {}
				this.consume(TokenType.OpenBrace, 'Expected "{" after else')
				const elseBlock = this.finishBlockExpression(this.previous())
				return new Ast.Expr.If(condition, thenBlock, elseBlock)
			}
		}
		return new Ast.Expr.If(condition, thenBlock)
	}

	private finishBlockExpression(openBraceToken: Token): Ast.Expr.Block {
		const statements = [] as Ast.Stmt[]
		while (!this.isAtEnd()) {
			if (this.match(TokenType.CloseBrace)) {
				return new Ast.Expr.Block(statements, openBraceToken)
			}
			const statement = this.statement()
			if (statement) {
				statements.push(statement)
			}
		}
		// FIXME: Better error here
		throw new Error('Block not finished')
	}

	private leftAssocBinOp(operation: Lazy<Ast.Expr>, types: TokenType[]): Ast.Expr {
		let expr = operation()
		while (this.match(...types)) {
			const operator = this.previous()
			const right = operation()
			expr = new Ast.Expr.Binary(expr, operator, right)
		}
		return expr
	}

	private consume(type: TokenType, message: string): Token {
		if (this.check(type)) return this.advance()

		throw this.error(this.peek(), message)
	}

	private error(token: Token, message: string): ParseError {
		error(token, message)
		return new ParseError()
	}

	private synchronize(): void {
		this.advance()

		/* Discard tokens until we're at the beginning of the next
		 * statement */
		while (!this.isAtEnd()) {
			if (this.previous().type === TokenType.Semicolon) {
				return
			}

			switch (this.peek().type) {
				case TokenType.Fun:
				case TokenType.Let:
				case TokenType.For:
				case TokenType.If:
				case TokenType.While:
				case TokenType.Return:
					return
			}

			this.advance()
		}
	}

	private match(...types: TokenType[]) {
		for (const type of types) {
			if (this.check(type)) {
				this.advance()
				return true
			}
		}

		return false
	}

	private check(type: TokenType) {
		if (this.isAtEnd()) {
			return false
		}

		return this.peek().type == type
	}

	private advance() {
		if (!this.isAtEnd()) {
			this.current++
		}

		return this.previous()
	}

	private isAtEnd() {
		return this.peek().type == TokenType.Eof
	}

	private peek() {
		return this.tokens[this.current]
	}

	private previous() {
		return this.tokens[this.current - 1]
	}
}
