import * as Ast from './ast'
import {match} from './match'

export const printAst = match<Ast.Expr, string>({
	literal({value}) {
		if (value === null) {
			return 'nil'
		}
		return value.toString()
	},
	unary({operator, right}) {
		return parenthesize(operator.lexeme, right)
	},
	binary({left, operator, right}) {
		return parenthesize(operator.lexeme, left, right)
	},
	grouping({expression}) {
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
