import {strict as assert} from 'assert'
import {Scanner} from '../src/scanner'
import {Token, TokenType} from '../src/token'
import * as Ast from '../src/ast'
import {Parser} from '../src/parser'

const parse = (text: string) => Parser.parseTokens(Scanner.scanText(text))

function testParser() {
    assert.deepEqual(
        parse(`while true {
            print 1 + 2 + 3;
	}`),
        [
            new Ast.Stmt.While(
                new Ast.Expr.Literal(true, new Token(TokenType.True, 'true', null, 1)),
                new Ast.Expr.Block([
                    new Ast.Stmt.Print(
                        new Ast.Expr.Binary(
                            new Ast.Expr.Binary(
                                new Ast.Expr.Literal(1, new Token(TokenType.IntegerLit, '1', 1, 2)),
                                new Token(TokenType.Plus, '+', null, 2),
                                new Ast.Expr.Literal(2, new Token(TokenType.IntegerLit, '2', 2, 2)),
                            ),
                            new Token(TokenType.Plus, '+', null, 2),
                            new Ast.Expr.Literal(3, new Token(TokenType.IntegerLit, '3', 3, 2)),
                        )
                    )
                ])
            )
        ]
    )
}

testParser()
console.log('Tests passed!')
