import * as Ast from './ast'
import {matchAll} from './match'

export const printAst = matchAll<Ast.Expr, string>({
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
})

function parenthesize(name: string, ...expressions: Ast.Expr[]) {
	let str = `(${name}`
	for (const expr of expressions) {
		str += ' '
		str += printAst(expr)
	}
	str += ')'
	return str
}
