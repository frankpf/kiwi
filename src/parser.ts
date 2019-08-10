import {error} from './error'
import {Token, TokenType} from './token'
import * as Ast from './ast'
import {Lazy} from './utils'

class ParseError extends Error {}

export class Parser {
	private readonly binOpPrecedences: {[op: string]: number} = {
		'<': 10,
		'+': 20,
		'-': 20,
		'*': 40,
		'/': 40,
	}

	private constructor(
		private readonly tokens: Array<Token>,
		private current = 0,
	) {}

	static parseTokens(tokens: Token[]): Ast.Node | null {
		const parser = new Parser(tokens)
		return parser.parse()
	}

	private parse(): Ast.Node | null {
		try {
			return this.expression()
		} catch (err) {
			return null
		}
	}

	private expression(): Ast.Node {
		return this.equality()
		// Grouping
		if (this.match(TokenType.OpenParen)) {
			const expr = this.expression()
			this.consume(TokenType.CloseParen, 'Expected ")" after expression')
			return new Ast.Grouping(expr)
		}

		// Unary
		if (this.match(TokenType.Bang, TokenType.Minus)) {
			const operator = this.previous()
			const right = this.expression()
			return new Ast.Unary(operator, right)
		}

		// Literal
		if (this.match(TokenType.False)) return new Ast.Literal(false)
		if (this.match(TokenType.True)) return new Ast.Literal(true)
		if (this.match(TokenType.Nil)) return new Ast.Literal(null)

		if (this.match(TokenType.NumberLit, TokenType.StringLit)) {
			return new Ast.Literal(this.previous().literal)
		}

		// TODO: Binary

		// Nothing
		throw this.error(this.peek(), 'Expected expression')
	}

	private equality(): Ast.Node {
		// equality -> comparison ( ( "!=" | "==" ) comparison )* ;
		const op = this.comparison.bind(this)
		const types = [TokenType.BangEqual, TokenType.EqualEqual]
		return this.leftAssocBinOp(op, types)
	}

	private comparison(): Ast.Node {
		// comparison -> addition ( ( ">" | ">=" | "<" | "<=" ) addition )* ;
		const op = this.addition.bind(this)
		const types = [
			TokenType.Greater,
			TokenType.GreaterEqual,
			TokenType.Less,
			TokenType.LessEqual,
		]
		return this.leftAssocBinOp(op, types)
	}
	private addition(): Ast.Node {
		// addition -> multiplication ( ( "-" | "+" ) multiplication )* ;
		const op = this.multiplication.bind(this)
		const types = [TokenType.Minus, TokenType.Plus]
		return this.leftAssocBinOp(op, types)
	}
	private multiplication(): Ast.Node {
		// multiplication -> unary ( ( "/" | "*" ) unary )* ;
		const op = this.unary.bind(this)
		const types = [TokenType.Slash, TokenType.Star]
		return this.leftAssocBinOp(op, types)
	}
	private unary(): Ast.Node {
		// unary -> ( "!" | "-" ) unary | primary ;
		if (this.match(TokenType.Bang, TokenType.Minus)) {
			const operator = this.previous()
			const right = this.unary()
			return new Ast.Unary(operator, right)
		}

		return this.primary()
	}
	private primary(): Ast.Node {
		// primary -> NUMBER | STRING | "false" | "true" | "nil" | "(" expression ")" ;
		if (this.match(TokenType.False)) {
			return new Ast.Literal(false)
		}

		if (this.match(TokenType.True)) {
			return new Ast.Literal(true)
		}

		if (this.match(TokenType.Nil)) {
			return new Ast.Literal(null)
		}

		if (this.match(TokenType.NumberLit, TokenType.StringLit)) {
			return new Ast.Literal(this.previous().literal)
		}

		if (this.match(TokenType.OpenParen)) {
			const expr = this.expression()
			this.consume(TokenType.CloseParen, 'Expected ")" after expression.')
			return new Ast.Grouping(expr)
		}

		throw this.error(this.peek(), 'Expected expression.')
	}
	private leftAssocBinOp(operation: Lazy<Ast.Node>, types: TokenType[]) {
		let expr = operation()
		while (this.match(...types)) {
			const operator = this.previous()
			const right = operation()
			expr = new Ast.Binary(expr, operator, right)
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
