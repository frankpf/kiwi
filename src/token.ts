export enum TokenType {
	// Single-char tokens
	OpenParen = 'OpenParen',
	CloseParen = 'CloseParen',
	OpenBrace = 'OpenBrace',
	CloseBrace = 'CloseBrace',
	OpenBracket = 'OpenBracket',
	CloseBracket = 'CloseBracket',
	Comma = 'Comma',
	Colon = 'Colon',
	Dot = 'Dot',
	Minus = 'Minus',
	Plus = 'Plus',
	Semicolon = 'Semicolon',
	Slash = 'Slash',
	Star = 'Star',

	// One or two char tokens
	Bang = 'Bang',
	BangEqual = 'BangEqual',
	Equal = 'Equal',
	EqualEqual = 'EqualEqual',
	Greater = 'Greater',
	GreaterEqual = 'GreaterEqual',
	Less = 'Less',
	LessEqual = 'LessEqual',
	And = 'And',
	Or = 'Or',
	BitAnd = 'BitAnd',
	BitOr = 'BitOr',

	// Literals
	Identifier = 'Identifier',
	NumberLit = 'NumberLit',
	StringLit = 'StringLit',

	// Keywords
	If = 'If',
	Else = 'Else',
	For = 'For',
	While = 'While',
	Fun = 'Fun',
	Return = 'Return',
	True = 'True',
	False = 'False',
	Nil = 'Nil',
	Let = 'Let',

	// Special tokens
	Eof = 'Eof',
}

export class Token {
	constructor(
		public readonly type: TokenType,
		public readonly lexeme: string,
		public readonly literal: any,
		public readonly line: number,
	) {}

	toString() {
		return `{${this.type} ${this.lexeme} ${this.literal}}`
	}
}
