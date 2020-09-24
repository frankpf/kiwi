// TODO
import {strict as assert} from 'assert'
import {Token, TokenType} from '../src/token'
import {Scanner} from '../src/scanner'

function testScanner() {
    assert.deepEqual(
        Scanner.scanText(`1 +
                         2 +
                         3
        ;
        `),
        [
            new Token(TokenType.IntegerLit, '1', 1, 1),
            new Token(TokenType.Plus, '+', null, 1),
            new Token(TokenType.IntegerLit, '2', 2, 2),
            new Token(TokenType.Plus, '+', null, 2),
            new Token(TokenType.IntegerLit, '3', 3, 3),
            semicolon(4),
            eof(5),
        ]
    )

    assert.deepEqual(
        Scanner.scanText(
            `fun foo(a, b) {
                print("Hello !").method();
            }`
        ),
        [
            new Token(TokenType.Fun, 'fun', null, 1),
            new Token(TokenType.Identifier, 'foo', null, 1),
            new Token(TokenType.OpenParen, '(', null, 1),
            new Token(TokenType.Identifier, 'a', null, 1),
            new Token(TokenType.Comma, ',', null, 1),
            new Token(TokenType.Identifier, 'b', null, 1),
            new Token(TokenType.CloseParen, ')', null, 1),
            new Token(TokenType.OpenBrace, '{', null, 1),

            new Token(TokenType.Print, 'print', null, 2),
            new Token(TokenType.OpenParen, '(', null, 2),
            new Token(TokenType.StringLit, '"Hello !"', 'Hello !', 2),
            new Token(TokenType.CloseParen, ')', null, 2),
            new Token(TokenType.Dot, '.', null, 2),
            new Token(TokenType.Identifier, 'method', null, 2),
            new Token(TokenType.OpenParen, '(', null, 2),
            new Token(TokenType.CloseParen, ')', null, 2),
            semicolon(2),

            new Token(TokenType.CloseBrace, '}', null, 3),
            eof(3),
        ]
    )

    assert.deepEqual(
        Scanner.scanText(
            `let arr = [];
            arr.push(a);
            arr.push(b);`
        ),
        [
            new Token(TokenType.Let, 'let', null, 1),
            new Token(TokenType.Identifier, 'arr', null, 1),
            new Token(TokenType.Equal, '=', null, 1),
            new Token(TokenType.OpenBracket, '[', null, 1),
            new Token(TokenType.CloseBracket, ']', null, 1),
            semicolon(1),

            new Token(TokenType.Identifier, 'arr', null, 2),
            new Token(TokenType.Dot, '.', null, 2),
            new Token(TokenType.Identifier, 'push', null, 2),
            new Token(TokenType.OpenParen, '(', null, 2),
            new Token(TokenType.Identifier, 'a', null, 2),
            new Token(TokenType.CloseParen, ')', null, 2),
            semicolon(2),

            new Token(TokenType.Identifier, 'arr', null, 3),
            new Token(TokenType.Dot, '.', null, 3),
            new Token(TokenType.Identifier, 'push', null, 3),
            new Token(TokenType.OpenParen, '(', null, 3),
            new Token(TokenType.Identifier, 'b', null, 3),
            new Token(TokenType.CloseParen, ')', null, 3),
            semicolon(3),
            eof(3),
        ]
    )
}

const semicolon = (line: number) => new Token(TokenType.Semicolon, ';', null, line)
const eof = (line: number) => new Token(TokenType.Eof, '', null, line)

testScanner()
console.log('Tests passed!')
