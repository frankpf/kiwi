import * as Ast from './ast'
import {matchAll} from './match'

function printExpr(expr: Ast.Expr): string {
	return matchAll<Ast.Expr, string>({
		Literal({value}) {
			if (value === null) {
				return 'nil'
			}
			return value.toString()
		},
		Unary({operator, right}) {
			return parenthesize(operator.lexeme, right)
		},
		Binary({left, operator, right}) {
			return parenthesize(operator.lexeme, left, right)
		},
		Grouping({expression}) {
			return parenthesize('group', expression)
		},
		LetAccess({identifier}) {
			return `(let-ref ${identifier})`
		},
		Block({statements}) {
			return `block ${statements.map(printStatement)}`
		},
		If({condition, thenBlock, elseTail}) {
			if (elseTail) {
				return parenthesize('if', condition, thenBlock, elseTail)
			}
			return parenthesize('if', condition, thenBlock)
		},
	})(expr)
}

declare function printStatement(statement: Ast.Stmt): string

function parenthesize(name: string, ...expressions: Ast.Expr[]) {
	let str = `(${name}`
	for (const expr of expressions) {
		str += ' '
		str += printExpr(expr)
	}
	str += ')'
	return str
}
