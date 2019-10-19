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

function createEntryBlockAlloca(func: llvm.Function, name: string) {
	const bb = func.getEntryBlock()
	if (!bb) {
		throw new Error(`No entry block for function ${func}`)
	}
	const tmpBuilder = new llvm.IRBuilder(bb, bb.begin())
	return tmpBuilder.createAlloca(
		llvm.Type.getDoubleTy(context),
		undefined,
		name,
	)
}

function i1ToDouble(i1: llvm.Value) {
	return builder.createUIToFP(i1, llvm.Type.getDoubleTy(context))
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
					return i1ToDouble(
						builder.createFCmpUEQ(leftResult, rightResult),
					)
				case TokenType.BangEqual:
					return i1ToDouble(
						builder.createFCmpUNE(leftResult, rightResult),
					)
				case TokenType.Greater:
					return i1ToDouble(
						builder.createFCmpUGT(leftResult, rightResult),
					)
				case TokenType.GreaterEqual:
					return i1ToDouble(
						builder.createFCmpUGE(leftResult, rightResult),
					)
				case TokenType.Less:
					return i1ToDouble(
						builder.createFCmpULT(leftResult, rightResult),
					)
				case TokenType.LessEqual:
					return i1ToDouble(
						builder.createFCmpULE(leftResult, rightResult),
					)
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
		Block({statements}) {
			const parentFn = builder.getInsertBlock()!.parent!
			for (let i = 0; i < statements.length - 1; i++) {
				compileStmt(statements[i], topLevelFunc)
			}

			const lastStatement = statements[statements.length - 1]
			if (lastStatement._tag === 'Expression') {
				lastStatement
				const expr = lastStatement.expression
				const val = compileExpr(expr)
				return val
			}

			compileStmt(lastStatement, topLevelFunc)
			return llvm.ConstantFP.get(context, 0)
		},
		If({condition, thenBlock, elseTail}) {
			const conditionValue = compileExpr(condition)

			const zero = llvm.ConstantFP.get(context, 0)
			const conditionCode = builder.createFCmpONE(
				conditionValue,
				zero,
				'ifcond',
			)

			const insertBlock = builder.getInsertBlock()
			assertExists(insertBlock, 'Insert block not found')
			const parentFn = insertBlock.parent
			assertExists(parentFn, `Insert block has no parent: ${insertBlock}`)

			// Create blocks for then and else
			let thenBb = llvm.BasicBlock.create(context, 'then', parentFn)
			let elseBb = llvm.BasicBlock.create(context, 'else')
			const mergeBb = llvm.BasicBlock.create(context, 'ifcont')

			const nextBb = elseTail === undefined ? mergeBb : elseBb
			builder.createCondBr(conditionCode, thenBb, nextBb)

			// Then block
			builder.setInsertionPoint(thenBb)
			const thenValue = compileExpr(thenBlock)
			builder.createBr(mergeBb)

			thenBb = builder.getInsertBlock()!

			// Else block
			let elseValue: llvm.Value | undefined
			if (elseTail !== undefined) {
				parentFn.addBasicBlock(elseBb)
				builder.setInsertionPoint(elseBb)
				if (true) {
					elseValue = compileExpr(elseTail)
					builder.createBr(mergeBb)
					elseBb = builder.getInsertBlock()!
				} else {
					throw new Error('Else if not implemented yet')
				}
			}

			// Merge block
			parentFn.addBasicBlock(mergeBb)
			builder.setInsertionPoint(mergeBb)
			const phiNode = builder.createPhi(
				llvm.Type.getDoubleTy(context),
				2,
				'iftmp',
			)

			phiNode.addIncoming(thenValue, thenBb)
			if (elseValue !== undefined) {
				phiNode.addIncoming(elseValue, elseBb)
			} else {
				phiNode.addIncoming(
					llvm.ConstantFP.get(context, 0),
					insertBlock,
				)
			}
			return phiNode
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
			compileExpr(expression)
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
		While({condition, block}) {
			const blockValue = compileExpr(block)

			const insertBlock = builder.getInsertBlock()
			assertExists(insertBlock, 'Insert block not found')
			const parentFn = insertBlock.parent
			assertExists(parentFn, `Insert block has no parent: ${insertBlock}`)

			const loopBb = llvm.BasicBlock.create(context, 'loop', parentFn)
			builder.createBr(loopBb);

			builder.setInsertionPoint(loopBb);
			compileExpr(block)

			let conditionVal = compileExpr(condition)
			conditionVal = builder.createFCmpONE(conditionVal, llvm.ConstantFP.get(context, 0), 'loopcond')

			const afterBb = llvm.BasicBlock.create(context, 'afterloop', parentFn)
			builder.createCondBr(conditionVal, loopBb, afterBb)
			builder.setInsertionPoint(afterBb)
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

const topLevelFunc = genFunction('main')
export const compile = (statements: Ast.Stmt[]): string => {
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

function assertExists<T>(val: T | undefined, msg?: string): asserts val is T {
	if (typeof val === 'undefined') {
		throw new Error(msg ?? `${val} is undefined`)
	} 
}
