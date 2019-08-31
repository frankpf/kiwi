import {Token, TokenType} from './token'
import {error} from './error'

export class Scanner {
	// prettier-ignore
	private static keywords: {[s: string]: TokenType} = {
		'if': TokenType.If,
		'else': TokenType.Else,
		'for': TokenType.For,
		'while': TokenType.While,
		'fun': TokenType.Fun,
		'return': TokenType.Return,
		'true': TokenType.True,
		'false': TokenType.False,
		'nil': TokenType.Nil,
		'let': TokenType.Let,
		'print': TokenType.Print,
	}

	private constructor(
		private source: string,
		private tokens: Token[] = [],
		private current = 0,
		private line = 1,
		private start = 0,
	) {}

	static scanText(text: string): Token[] {
		const scanner = new Scanner(text)
		return scanner.scanTokens()
	}

	private scanTokens(): Token[] {
		while (!this.isAtEnd()) {
			this.start = this.current
			this.scanToken()
		}

		/* We're done, append one final EOF token */
		this.tokens.push(new Token(TokenType.Eof, '', null, this.line))
		return this.tokens
	}

	private scanToken() {
		const c = this.advance()
		switch (c) {
			case '(':
				this.addToken(TokenType.OpenParen)
				break
			case ')':
				this.addToken(TokenType.CloseParen)
				break
			case '{':
				this.addToken(TokenType.OpenBrace)
				break
			case '}':
				this.addToken(TokenType.CloseBrace)
				break
			case '[':
				this.addToken(TokenType.OpenBracket)
				break
			case ']':
				this.addToken(TokenType.CloseBracket)
				break
			case ',':
				this.addToken(TokenType.Comma)
				break
			case ':':
				this.addToken(TokenType.Colon)
				break
			case '.':
				this.addToken(TokenType.Dot)
				break
			case '-':
				this.addToken(TokenType.Minus)
				break
			case '+':
				this.addToken(TokenType.Plus)
				break
			case ';':
				this.addToken(TokenType.Semicolon)
				break
			case '*':
				this.addToken(TokenType.Star)
				break
			case '!':
				this.addToken(
					this.match('=') ? TokenType.BangEqual : TokenType.Bang,
				)
				break
			case '=':
				this.addToken(
					this.match('=') ? TokenType.EqualEqual : TokenType.Equal,
				)
				break
			case '<':
				this.addToken(
					this.match('=') ? TokenType.LessEqual : TokenType.Less,
				)
				break
			case '>':
				this.addToken(
					this.match('=')
						? TokenType.GreaterEqual
						: TokenType.Greater,
				)
				break
			case '&':
				this.addToken(
					this.match('&') ? TokenType.And : TokenType.BitAnd,
				)
				break
			case '|':
				this.addToken(this.match('|') ? TokenType.Or : TokenType.BitOr)
				break
			case '/':
				if (this.match('/')) {
					// One-line comment
					// Ignore everything up to \n or EOF
					while (this.peek() != '\n' && !this.isAtEnd()) {
						this.advance()
					}
				} else {
					this.addToken(TokenType.Slash)
				}
				break
			case '"':
				this.string()
				break
			/* Ignore whitespace */
			case ' ':
			case '\r':
			case '\t':
				break
			case '\n':
				this.line++
				break
			case '0':
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				this.number()
				break
			default:
				if (this.isAlpha(c)) {
					this.identifier()
				} else {
					error(this.line, 'Unexpected character.')
				}
				break
		}
	}

	private isAlpha(c: string): boolean {
		return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
	}

	private isAlphaNumeric(c: string): boolean {
		return this.isAlpha(c) || this.isDigit(c)
	}

	private identifier() {
		while (this.isAlphaNumeric(this.peek())) {
			this.advance()
		}

		const id = this.source.substring(this.start, this.current)
		const type = Scanner.keywords[id] || TokenType.Identifier

		this.addToken(type)
	}

	private isDigit(c: string) {
		return c >= '0' && c <= '9'
	}

	private number() {
		// First char must be a nonzero digit
		if (this.isDigit(this.peek()) && this.peek() != '0') {
			this.advance()
		}

		// Other chars can be digits or underscores
		// Allows the programmer to write numbers like this: 1_000_000
		while (this.isDigit(this.peek()) || this.peek() == '_') {
			this.advance()
		}

		// First char of decimal part must be a digit too
		if (this.peek() == '.' && this.isDigit(this.peekNext())) {
			this.advance()
		}

		// FIXME: Numbers ending with underscores should not be allowed
		while (this.isDigit(this.peek()) || this.peek() == '_') {
			this.advance()
		}

		const num = this.source
			.substring(this.start, this.current)
			.split('')
			.filter(ch => ch != '_')
			.join('')

		this.addToken(TokenType.NumberLit, Number(num))
	}

	private string() {
		// TODO: Disallow multi-line strings?
		// TODO: Unescape sequences
		while (this.peek() != '"' && !this.isAtEnd()) {
			if (this.peek() == '\n') this.line++
			this.advance()
		}

		// Unterminated string
		if (this.isAtEnd()) {
			error(this.line, 'Unterminated string')
		}

		// Consume the closing "
		this.advance()

		// Get everything but the quotes
		const value = this.source.substring(this.start + 1, this.current - 1)
		this.addToken(TokenType.StringLit, value)
	}

	private peek(): string {
		if (this.isAtEnd()) return '\0'
		return this.source[this.current]
	}

	private peekNext(): string {
		if (this.current + 1 >= this.source.length) return '\0'
		return this.source[this.current + 1]
	}

	private match(expected: string): boolean {
		if (this.isAtEnd()) return false
		if (this.source[this.current] != expected) return false

		this.current++
		return true
	}

	private advance(): string {
		this.current++
		return this.source[this.current - 1]
	}

	private addToken(type: TokenType, literal: any = null) {
		const text = this.source.substring(this.start, this.current)
		this.tokens.push(new Token(type, text, literal, this.line))
	}

	private isAtEnd(): boolean {
		return this.current >= this.source.length
	}
}
