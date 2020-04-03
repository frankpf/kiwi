{.experimental: "codeReordering".}
from types import KiwiType

type
    TokenType* = enum
        # Single-char tokens
        OpenParen,
        CloseParen,
        OpenBrace,
        CloseBrace,
        OpenBracket,
        CloseBracket,
        Comma,
        Colon,
        Dot,
        Minus,
        Plus,
        Semicolon,
        Slash,
        Star,

        # One or two char tokens
        Bang,
        BangEqual,
        Equal,
        EqualEqual,
        Greater,
        GreaterEqual,
        Less,
        LessEqual,
        And,
        Or,
        BitAnd,
        BitOr,

        # Literals
        Identifier,
        NumberLit,
        StringLit,

        # Keywords
        If,
        Else,
        For,
        While,
        Fun,
        Return,
        True,
        False,
        Nil,
        Let,
        Print, # TODO: print should be a function

        # Special tokens
        Eof,

type Token* = object
    tokenType*: TokenType
    lexeme*: string
    literal*: KiwiType
    line*: int
