import {matchAll} from '../match'
import * as Ast from '../ast'
import {TokenType} from '../token'
import {absurd} from 'fp-ts/lib/function'
import {KiwiType} from '../types'

export const interpretExpr = matchAll<Ast.Expr, KiwiType>({
	Literal({value}) {
		return value
	},
	Grouping({expression}) {
		return interpretExpr_(expression)
	},
	Unary({operator, right}) {
		const rightResult = interpretExpr_(right)

		switch (operator.type) {
			case TokenType.Bang:
				return !isTruthy(rightResult)
			case TokenType.Minus:
				return -rightResult
		}

		absurd(operator)
	},
	Binary({left, operator, right}) {
		const leftResult = interpretExpr_(left)
		const rightResult = interpretExpr_(right)

		switch (operator.type) {
			case TokenType.EqualEqual:
				return leftResult === rightResult
			case TokenType.BangEqual:
				return leftResult !== rightResult
			case TokenType.Greater:
				return leftResult > rightResult
			case TokenType.GreaterEqual:
				return leftResult >= rightResult
			case TokenType.Less:
				return leftResult < rightResult
			case TokenType.LessEqual:
				return leftResult <= rightResult
			case TokenType.Minus:
				return leftResult - rightResult
			case TokenType.Plus:
				return leftResult + rightResult
			case TokenType.Star:
				return leftResult * rightResult
			case TokenType.Slash:
				return leftResult / rightResult
		}

		absurd(operator)
	},
	LetAccess({identifier}) {
		return 1 as any
	},
})

// This is a workaround for a bug in TS's typechecker
const interpretExpr_ = (node: Ast.Expr): KiwiType => {
	return interpretExpr(node)
}

export const interpret = (statements: Ast.Stmt[]): void => {
	const matcher = matchAll<Ast.Stmt, void>({
		[Ast.Stmt.Print.uri]({expression}) {
			console.log(stringify(interpretExpr(expression)))
		},
		[Ast.Stmt.Expression.uri]({expression}) {
			interpretExpr(expression)
		},
		[Ast.Stmt.LetDeclaration.uri]({identifier, initializer}) {},
	})

	for (const statement of statements) {
		matcher(statement)
	}
}

const stringify = (value: KiwiType): string => {
	if (value === null) {
		return 'nil'
	}

	return value.toString()
}

const isTruthy = (arg: unknown) => {
	if (arg === null || arg === false) {
		return false
	}

	return true
}
