{.push requiresInit.}
{.experimental: "codeReordering".}
from tables import toTable, getOrDefault
from token import Token, TokenType
from types import KiwiType, createKiwiString, createKiwiInt
from strutils import join, isDigit, isAlphaAscii, isAlphaNumeric, parseInt
from strformat import fmt
from sequtils import filter, toSeq
from error import reportError

type
    ScannerState = object
        source: string
        tokens: seq[Token]
        current: int
        line: int
        start: int

const KEYWORD_MAP = {
    "else": TokenType.Else,
    "for": TokenType.For,
    "while": TokenType.While,
    "fun": TokenType.Fun,
    "return": TokenType.Return,
    "true": TokenType.True,
    "false": TokenType.False,
    "nil": TokenType.Nil,
    "let": TokenType.Let,
    "print": TokenType.Print,
}.toTable

proc scanText*(text: string): seq[Token] =
    var tokens = newSeq[Token]()
    var current = 0
    var line = 1
    var start = 0
    var state = ScannerState(
        source: text,
        tokens: tokens,
        current: current,
        line: line,
        start: start,
    )
    state.scanTokens

proc scanTokens(state: var ScannerState): seq[Token] =
    echo "scanning tokens"
    echo fmt"text: {state.source}"
    while not state.isAtEnd:
        state.start = state.current
        state.scanToken
    state.tokens

proc scanToken(state: var ScannerState): void =
    let c = state.advance
    case c
    of '(':
        state.addToken(TokenType.OpenParen)
    of ')':
        state.addToken(TokenType.CloseParen)
    of '{':
        state.addToken(TokenType.OpenBrace)
    of '}':
        state.addToken(TokenType.CloseBrace)
    of '[':
        state.addToken(TokenType.OpenBracket)
    of ']':
        state.addToken(TokenType.CloseBracket)
    of ',':
        state.addToken(TokenType.Comma)
    of ':':
        state.addToken(TokenType.Colon)
    of '.':
        state.addToken(TokenType.Dot)
    of '-':
        state.addToken(TokenType.Minus)
    of '+':
        state.addToken(TokenType.Plus)
    of ';':
        state.addToken(TokenType.Semicolon)
    of '*':
        state.addToken(TokenType.Star)
    of '!':
        state.addToken(if state.match('='): TokenType.BangEqual else: TokenType.Bang)
    of '=':
        state.addToken(if state.match('='): TokenType.EqualEqual else: TokenType.Equal)
    of '<':
        state.addToken(if state.match('='): TokenType.LessEqual else: TokenType.Less)
    of '>':
        state.addToken(if state.match('='): TokenType.GreaterEqual else: TokenType.Greater)
    of '&':
        state.addToken(if state.match('&'): TokenType.And else: TokenType.BitAnd)
    of '|':
        state.addToken(if state.match('|'): TokenType.Or else: TokenType.BitOr)
    of '/':
        if state.match('/'):
            # One-line comment
            # Ignore everything up to \n or EOF
            while state.peek() != '\n' and (not state.isAtEnd):
                discard state.advance
        else:
            state.addToken(TokenType.Slash)
    of '"':
        state.scanString
    # Ignore whitespace 
    of ' ', '\r', '\t':
        discard
    of '\n':
        state.line += 1
    of '0'..'9':
        state.scanNumber
    else:
        if c.isAlpha:
            state.scanIdentifier
        else:
            reportError(state.line, "Unexpected character.")

proc scanIdentifier(state: var ScannerState) =
    while state.peek.isAlphaNumeric:
        discard state.advance

    let id = state.source[state.start..<state.current]
    let tokenType = KEYWORD_MAP.getOrDefault(id, TokenType.Identifier)

    state.addToken(tokenType)

proc scanNumber(state: var ScannerState) =
    # First char must be a nonzero digit
    if state.peek.isDigit and state.peek() != '0':
        discard state.advance

    # Other chars can be digits or underscores
    # Allows the programmer to write numbers like this: 1_000_000
    while state.peek.isDigit or state.peek() == '_':
        discard state.advance

    # # First char of decimal part must be a digit too
    # if state.peek() == '.' and state.peekNext.isDigit:
    #     discard state.advance

    # # FIXME: Numbers ending with underscores should not be allowed
    # while state.peek.isDigit or state.peek() == '_':
    #     discard state.advance

    let num = state.source[state.start..<state.current]
        .toSeq
        .filter(proc (ch: char): bool = ch != '_')

    echo fmt"debug {num}"
    
    let num2 = num
        .join("")
        .parseInt
        .createKiwiInt

    state.addToken(TokenType.NumberLit, num2)

proc peek(state: ScannerState): char =
    if state.isAtEnd:
        return '\0'
    return state.source[state.current]

proc peekNext(state: ScannerState): char =
    if state.current + 1 >= state.source.len:
        return '\0'
    return state.source[state.current + 1]

proc isAlpha(c: char): bool =
    return c.isAlphaAscii or c == '_'

proc match(state: var ScannerState, expected: char): bool =
    if state.isAtEnd:
        return false

    if state.source[state.current] != expected:
        return false

    state.current += 1
    return true

proc addToken(state: var ScannerState, tokenType: TokenType, literal: KiwiType = nil): void =
    let lexeme = state.source[state.start..<state.current]
    state.tokens.add(Token(
        tokenType: tokenType,
        lexeme: lexeme,
        literal: literal,
        line: state.line
    ))

proc advance(state: var ScannerState): char =
    state.current += 1
    state.source[state.current - 1]

proc isAtEnd(state: ScannerState): bool =
    state.current >= state.source.len

proc scanString(state: var ScannerState) =
    # TODO: Disallow multi-line strings?
    # TODO: Unescape sequences
    while state.peek != '"' and (not state.isAtEnd):
        if state.peek == '\n':
            state.line += 1
        discard state.advance

    # Unterminated string
    if state.isAtEnd:
        reportError(state.line, "Unterminated string")

    # Consume the closing "
    discard state.advance

    # Get everything but the quotes
    let value = state.source[state.start + 1..state.current - 1]
    state.addToken(TokenType.StringLit, createKiwiString(value))
