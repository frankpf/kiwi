import {matchAll, matchPartial} from '../match'
import * as Ast from '../ast'
import {TokenType} from '../token'
import * as llvm from 'llvm-node'
import {absurd} from 'fp-ts/lib/function'
import {createGlobals} from './globals'

const context = new llvm.LLVMContext()
export const module = new llvm.Module('kiwi', context)
const builder = new llvm.IRBuilder(context)
const namedValues = new Map<string, llvm.AllocaInst>()
const globals = createGlobals(context, module)

function createEntryBlockAlloca(func: llvm.Function, identifier: string) {
	const bb = func.getEntryBlock()
	if (!bb) {
		throw new Error(`No entry block for function ${func}`)
	}
	const tmpBuilder = new llvm.IRBuilder(bb, bb.begin())
	return tmpBuilder.createAlloca(
		llvm.Type.getDoubleTy(context),
		undefined,
		identifier,
	)
}

function compileExpr(node: Ast.Expr): llvm.Value {
	const matcher = matchAll<Ast.Expr, llvm.Value>({
		Literal({value}) {
			return llvm.ConstantFP.get(context, Number(value))
		},
		Grouping({expression}) {
			return compileExpr(expression)
		},
		Unary({operator, right}) {
			const rightResult = compileExpr(right)

			switch (operator.type) {
				case TokenType.Bang:
					throw new Error('Booleans are not implemented')
				case TokenType.Minus:
					return builder.createFNeg(rightResult)
			}

			throw new Error('Invalid unary')
		},
		Binary({left, operator, right}) {
			const leftResult = compileExpr(left)
			const rightResult = compileExpr(right)

			switch (operator.type) {
				case TokenType.EqualEqual:
					return builder.createFCmpUEQ(leftResult, rightResult)
				case TokenType.BangEqual:
					return builder.createFCmpUNE(leftResult, rightResult)
				case TokenType.Greater:
					return builder.createFCmpUGT(leftResult, rightResult)
				case TokenType.GreaterEqual:
					return builder.createFCmpUGE(leftResult, rightResult)
				case TokenType.Less:
					return builder.createFCmpULT(leftResult, rightResult)
				case TokenType.LessEqual:
					return builder.createFCmpULE(leftResult, rightResult)
				case TokenType.Minus:
					return builder.createFSub(leftResult, rightResult)
				case TokenType.Plus:
					return builder.createFAdd(leftResult, rightResult)
				case TokenType.Star:
					return builder.createFMul(leftResult, rightResult)
				case TokenType.Slash:
					return builder.createFDiv(leftResult, rightResult)
			}

			throw new Error('Invalid binary')
		},
		LetAccess({identifier}) {
			const variable = namedValues.get(identifier.lexeme)
			if (variable === undefined) {
				throw new Error(
					`Access to invalid variable ${identifier.lexeme}`,
				)
			}
			return builder.createLoad(variable, identifier.lexeme)
		},
	})

	const result = matcher(node)
	return result
}

function compileStmt(node: Ast.Stmt, topLevelFunc: llvm.Function) {
	const matcher = matchAll<Ast.Stmt, void>({
		Print({expression}) {
			const expr = compileExpr(expression)
			builder.createCall(globals.print, [expr])
		},
		Expression({expression}) {
			// TODO
			throw new Error('Expression statements not implemented')
		},
		LetDeclaration({identifier, initializer}) {
			const insertBlock = builder.getInsertBlock()
			if (insertBlock === undefined) {
				throw new Error('Undefined insert block')
			}

			const func = insertBlock.parent
			if (func === undefined) {
				throw new Error(
					`Undefined function from insert block ${insertBlock}`,
				)
			}

			const initValue =
				initializer !== undefined
					? compileExpr(initializer)
					: llvm.ConstantFP.get(context, 0)

			const alloca = createEntryBlockAlloca(func, identifier.lexeme)
			builder.createStore(initValue, alloca)

			namedValues.set(identifier.lexeme, alloca)
		},
		Assignment({name, value}) {
			// TODO
			throw new Error('Assignment not implemented')
		},
	})

	return matcher(node)
}

function genFunction(name: string): llvm.Function {
	const funcType = llvm.FunctionType.get(
		llvm.Type.getDoubleTy(context),
		[],
		false,
	)

	const func = llvm.Function.create(
		funcType,
		llvm.LinkageTypes.ExternalLinkage,
		name,
		module,
	)

	const bb = llvm.BasicBlock.create(context, 'entry', func)
	builder.setInsertionPoint(bb)

	return func
}

function setFunctionReturn(func: llvm.Function, returnValue: llvm.Value) {
	builder.createRet(returnValue)
}

export const compile = (statements: Ast.Stmt[]): string => {
	const topLevelFunc = genFunction('main')
	for (const statement of statements) {
		compileStmt(statement, topLevelFunc)
	}
	setFunctionReturn(topLevelFunc, llvm.ConstantFP.get(context, 42))

	return module.print()
}

const isTruthy = (arg: unknown) => {
	if (arg === null || arg === false) {
		return false
	}

	return true
}
