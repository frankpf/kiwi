import { error } from './error'
import { Token, TokenType } from './token'
import * as Syntax from './syntax'

class ParseError extends Error {}

export class Parser {
	private readonly binOpPrecedences: { [op: string]: number } = {
		'<': 10,
		'+': 20,
		'-': 20,
		'*': 40,
		'/': 40,
	}

	constructor(
		private readonly tokens: Array<Token>,
		private current = 0,
	) {}

	public parse(): Syntax.Expr | null {
		try {
			return this.expression()
		} catch (err) {
			return null
		}
	}

	private expression(): Syntax.Expr {
		// Grouping
		if (this.match(TokenType.OpenParen)) {
			const expr = this.expression()
			this.consume(TokenType.CloseParen, 'Expected ")" after expression')
			return new Syntax.Grouping(expr)
		}

		// Unary
		if (this.match(TokenType.Bang, TokenType.Minus)) {
			const operator = this.previous()
			const right = this.expression()
			return new Syntax.Unary(operator, right)
		}

		// Literal
		if (this.match(TokenType.False)) return new Syntax.Literal(false)
		if (this.match(TokenType.True)) return new Syntax.Literal(true)
		if (this.match(TokenType.Nil)) return new Syntax.Literal(null)

		if (this.match(TokenType.NumberLit, TokenType.StringLit)) {
			return new Syntax.Literal(this.previous().literal)
		}

		// TODO: Binary

		// Nothing
		throw this.error(this.peek(), 'Expected expression')
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
