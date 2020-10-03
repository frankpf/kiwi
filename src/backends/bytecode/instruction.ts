import * as Ast from '../../ast'
import {_, TupleLength} from '../../utils'
import {matchAll} from '../../match'
import {Token, TokenType} from '../../token'
import {Resolver} from '../../localresolver'

type StrMap<A> = { [_: string]: A }

const AnonFuncGenerator = (() => {
	let i = 0
	return { gen: () => `anon${i++}` }
})()

class DeclarationMap {

	private readonly instructionMap: StrMap<Instruction.T[]> = {}
	private readonly arityMap: StrMap<number> = {}

	constructor() {}

	addFunction(name: string, arity: number, instructions: Instruction.T[]) {
		if (this.instructionMap[name] !== undefined || this.arityMap[name] !== undefined) {
			// FIXME: I don't think this should be an error
			throw new Error(`Trying to overwrite existing function ${name}`)
		}
		this.instructionMap[name] = instructions
		this.arityMap[name] = arity
	}

	getInstructions(name: string) {
		if (this.instructionMap[name] === undefined) {
			throw new Error(`Trying to access instructions of undefined function ${name}`)
		}

		return this.instructionMap[name]

	}
	getArity(name: string): number {
		if (this.arityMap[name] === undefined) {
			throw new Error(`Trying to access arity of undefined function ${name}`)
		}

		return this.arityMap[name]
	}
	*entries(): Generator<[name: string, arity: number, instructions: Instruction.T[]]> {
		for (const [name, instructions] of Object.entries(this.instructionMap)) {
			yield [name, this.getArity(name), instructions]
		}
	}
}

export namespace Instruction {
	export type T = Instr<any>

	interface Instr<T> {
		readonly _tag: T
		readonly line: number
		sizeInBytes(): number
		encode(buf: InstructionBuffer): void
	}

	// FIXME: oof we probably need to refactor the whole Instruction architecture, I don't think this makes sense
	// MakeConstant is not a real instruction, we just use it to create constants without a corresponding instruction
	export class MakeConstant implements Instr<'MakeConstant'> {
		readonly _tag = 'MakeConstant'
		line!: number
		private _index: number | undefined
		static globalConstants = {} as any

		constructor(readonly constant: string, readonly currentFunctionName: string, readonly mode: 'string' | 'function' = 'string') {}

		encode(buf: InstructionBuffer) {
			const constantBuf = MakeConstant.globalConstants[this.currentFunctionName]
			if (constantBuf === undefined) {
				MakeConstant.globalConstants[this.currentFunctionName] = {}
			}

			const constant = MakeConstant.globalConstants[this.currentFunctionName][this.constant]
			if (constant !== undefined) {
				this._index = constant.index()
				return
			}

			const marker = this.mode === 'string' ? 's' : 'f'
			const prefix = `${marker}${this.constant.length}`
			const index = buf.constants.push(`${prefix} ${this.constant}`) - 1
			this._index = index
			MakeConstant.globalConstants[this.currentFunctionName][this.constant] = this
		}

		sizeInBytes() { return 0 }

		index() {
			if (this._index === undefined) {
				throw new Error('Tried to access constant with no index')
			}
			return this._index
		}
	}

	export class SetGlobal implements Instr<'SetGlobal'> {
		readonly _tag = 'SetGlobal'
		constructor(readonly line: number, readonly constant: MakeConstant) {}

		encode(buf: InstructionBuffer) {
			buf.instructions.push(`set_global ${this.constant.index()}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 2 }
	}

	export class GetGlobal implements Instr<'GetGlobal'> {
		readonly _tag = 'GetGlobal'
		constructor(readonly line: number, readonly constant: MakeConstant) {}

		encode(buf: InstructionBuffer) {
			buf.instructions.push(`get_global ${this.constant.index()}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 2 }
	}

	export class LoadFunction implements Instr<'LoadFunction'> {
		readonly _tag = 'LoadFunction'
		constructor(readonly line: number, readonly constant: MakeConstant) {}

		encode(buf: InstructionBuffer) {
			buf.instructions.push(`load_function ${this.constant.index()}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 2 }
	}

	export const Call = SimpleInstr<'call', [number]>('call', 1)

	export const SetLocal = SimpleInstr<'set_local', [number]>('set_local', 1)
	export type SetLocal = InstanceType<typeof SetLocal>

	export const GetLocal = SimpleInstr<'get_local', [number]>('get_local', 1)
	export type GetLocal = InstanceType<typeof GetLocal>

	export class DefineGlobal implements Instr<'DefineGlobal'> {
		readonly _tag = 'DefineGlobal'
		constructor(readonly line: number, readonly constant: MakeConstant) {}

		encode(buf: InstructionBuffer): void {
			buf.instructions.push(`define_global ${this.constant.index()}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 2 }
	}

	export class LoadConstant implements Instr<'LoadConstant'> {
		readonly _tag = 'LoadConstant'
		constructor(readonly line: number, readonly value: string | number, private isDouble: boolean) {}

		encode(buf: InstructionBuffer): void {
			let prefix: string
			if (typeof this.value === 'number') {
				prefix = this.isDouble ? 'd' : 'i'
			} else {
				prefix = `s${this.value.length}`
			}
			let len = buf.constants.push(`${prefix} ${this.value}`)
			buf.instructions.push(`load_constant ${len - 1}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 2 }
	}

	export enum JumpMode { IfFalse, Always }
	export class Jump implements Instr<'Jump'> {
		readonly _tag = 'Jump'

		constructor(readonly line: number, readonly mode: JumpMode, readonly jumpOver: number) {}

		encode(buf: InstructionBuffer): void {
			const opcode = this.mode === JumpMode.Always ? 'jump' : 'jump_if_false'

			// We're going to use two bytes in the interpreter for the jump offset.
			// TODO: Should this be encoded in the bytecode generator?
			// I think maybe it should go in the interpreter bytecode parser?
			// that way an error is still thrown at compile time, but it's the responsibility
			// of the interpreter.
			if (this.jumpOver > 2**16 - 1) {
				throw new Error(`Too much code to jump over (more than ${2**16} instructions)`)
			}

			buf.instructions.push(`${opcode} ${this.jumpOver}`)
			buf.lineNumbers.push(this.line)
		}

		sizeInBytes() { return 3 }
	}

	export const Print = SimpleInstr('print')
	export type Print = InstanceType<typeof Print>

	export const Debugger = SimpleInstr('Debugger')

	export const Pop = SimpleInstr('pop')
	export type Pop = InstanceType<typeof Pop>

	export const Return = SimpleInstr('return')
	export type Return = InstanceType<typeof Return>

	export const LoadNil = SimpleInstr('load_nil')
	export type LoadNil = InstanceType<typeof LoadNil>

	export const LoadTrue = SimpleInstr('load_true')
	export type LoadTrue = InstanceType<typeof LoadTrue>

	export const LoadFalse = SimpleInstr('load_false')
	export type LoadFalse = InstanceType<typeof LoadFalse>

	export const Negate = SimpleInstr('negate')
	export type Negate = InstanceType<typeof Negate>

	export const Not = SimpleInstr('not')
	export type Not = InstanceType<typeof Not>

	export const Or = SimpleInstr('Or')
	export const And = SimpleInstr('And')

	export const Subtract = SimpleInstr('sub')
	export type Subtract = InstanceType<typeof Subtract>

	export const Add = SimpleInstr('add')
	export type Add = InstanceType<typeof Add>

	export const Multiply = SimpleInstr('mul')
	export type Multiply = InstanceType<typeof Multiply>

	export const Divide = SimpleInstr('div')
	export type Divide = InstanceType<typeof Divide>

	export const Equal = SimpleInstr('eql')
	export type Equal = InstanceType<typeof Equal>

	export const Greater = SimpleInstr('ge')
	export type Greater = InstanceType<typeof Greater>

	export const GreaterEqual = SimpleInstr('geq')
	export type GreaterEqual = InstanceType<typeof GreaterEqual>

	export const Less = SimpleInstr('le')
	export type Less = InstanceType<typeof Less>

	export const LessEqual = SimpleInstr('leq')
	export type LessEqual = InstanceType<typeof LessEqual>

	function SimpleInstr<T extends string, Args extends any[] = []>(instr: T, numArgs: TupleLength<Args> | 0 = 0) {
		const classRef: { new(line: number, ...argList: TupleLength<Args> extends 0 ? never : Args): Instr<T> } = class implements Instr<T> {
			readonly _tag = instr
			args: any[]
			constructor(readonly line: number, ...argList: TupleLength<Args> extends 0 ? never : Args) {
				this.args = argList || []
				if ((this.args.length) > numArgs) {
					throw new Error(
						`Trying to call instruction ${instr} with ${this.args.length} arguments, but it expects ${numArgs} arguments`
					)
				}
			}
			encode(buf: InstructionBuffer) {
				buf.instructions.push([instr, ...this.args].join(' '))
				buf.lineNumbers.push(this.line)
			}
			sizeInBytes() { return 1 + numArgs }
		}

		return classRef
	}
}


type InstructionBuffer = {
	readonly functionName: string
	readonly arity: number
	instructions: string[]
	constants: string[] // f{number} or i{number}
	lineNumbers: number[]
}

export function fromAst(ast: Ast.Stmt[], { source }: { source?: string } = {}): string {
	const {instructions, declarationMap} = instructionsFromAst(ast)
	const lastLine = instructions[instructions.length - 1].line
	declarationMap.addFunction(
		'toplevel',
		0,
		[...instructions, new Instruction.LoadNil(lastLine), new Instruction.Return(lastLine)]
	)
	const buf = genBytecode2(declarationMap)
	if (source !== undefined) {
		return toAnnotatedBuf(buf, source)
	} else {
		return toBuf(buf)
	}
}

type FunctionDef = { arity: number, name: string }
function instructionsFromAst(ast: Ast.Stmt[], _declMap?: DeclarationMap, _resolver?: Resolver): { instructions: Instruction.T[], declarationMap: DeclarationMap } {
	const declMap = _declMap === undefined ? new DeclarationMap() : _declMap
	const resolver = _resolver === undefined ? new Resolver('toplevel') : _resolver
	// TODO(repl): We need this for --replCompiler to work
	// Instruction.MakeConstant.globalConstants = {}

	function exprMatcher(expr: Ast.Expr): Instruction.T[] {
		const matcher = matchAll<Ast.Expr, Instruction.T[]>({
			Literal({value, startToken}) {
				const {line} = startToken
				if (typeof value === 'number') {
					if (startToken.type == TokenType.DoubleLit) {
						return [new Instruction.LoadConstant(line, value, true)]
					} else {
						return [new Instruction.LoadConstant(line, value, false)]
					}
				} else if (value === null) {
					return [new Instruction.LoadNil(line)]
				} else if (value === true) {
					return [new Instruction.LoadTrue(line)]
				} else if (value === false) {
					return [new Instruction.LoadFalse(line)]
				} else if (typeof value === 'string') {
					return [new Instruction.LoadConstant(line, value, false)]
				} else {
					throw new Error(`Unknown type for literal: ${value}`)
				}
			},
			Binary({left, operator, right, startToken}) {
				const leftInstrs = exprMatcher(left)
				const rightInstrs = exprMatcher(right)
				const {line} = startToken
				let opInstr: Instruction.T
				switch (operator.type) {
					case TokenType.Minus:
						opInstr = new Instruction.Subtract(line)
						break
					case TokenType.Plus:
						opInstr = new Instruction.Add(line)
						break
					case TokenType.Star:
						opInstr = new Instruction.Multiply(line)
						break
					case TokenType.Slash:
						opInstr = new Instruction.Divide(line)
						break
					case TokenType.EqualEqual:
						opInstr = new Instruction.Equal(line)
						break
					case TokenType.Greater:
						opInstr = new Instruction.Greater(line)
						break
					case TokenType.GreaterEqual:
						opInstr = new Instruction.GreaterEqual(line)
						break
					case TokenType.Less:
						opInstr = new Instruction.Less(line)
						break
					case TokenType.LessEqual:
						opInstr = new Instruction.LessEqual(line)
						break
					case TokenType.Or:
						opInstr = new Instruction.Or(line)
						break
					case TokenType.And:
						opInstr = new Instruction.And(line)
						break
					default:
						throw new Error(`Binary operator ${operator} not supported`)
				}
				return [...leftInstrs, ...rightInstrs, opInstr]
			},
			Grouping({expression}) {
				return exprMatcher(expression)
			},
			Unary({operator, right, startToken}) {
				const rightInstrs = exprMatcher(right)
				let opInstr: Instruction.T
				switch (operator.type) {
					case TokenType.Minus:
						opInstr = new Instruction.Negate(startToken.line)
						break
					case TokenType.Bang:
						opInstr = new Instruction.Not(startToken.line)
						break
					default:
						throw new Error(`Unary operator ${operator} not supported`)
				}
				return [...rightInstrs, opInstr]
			},
			LetAccess({identifier, startToken}) {
				const localIndex = resolver.resolveLocal(identifier)
				if (localIndex === null) {
					const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme, resolver.functionName)
					return [mkIdentifier, new Instruction.GetGlobal(startToken.line, mkIdentifier)]
				} else {
					return [new Instruction.GetLocal(startToken.line, localIndex)]
				}
			},
			If({condition, thenBlock, elseTail, startToken}) {
				const conditionInstrs = exprMatcher(condition)
				const thenBlockInstrs = exprMatcher(thenBlock)

				let bytesToJumpOver = thenBlockInstrs.map(_ => _.sizeInBytes()).reduce((a, b) => a + b)
				if (elseTail !== undefined) {
					bytesToJumpOver += 3
				}
				// FIXME: this doesn't make sense. I think we can emit -1 for the jump linenum
				// if we assume it won't ever error, but right now it can have an error if the jump
				// offset doesn't fit in 16 bits. Once we have a jump opcode that works with arbitrary
				// offsets, we can use -1.
				const jump = new Instruction.Jump(startToken.line, Instruction.JumpMode.IfFalse, bytesToJumpOver)

				const instrs = [...conditionInstrs, jump, ...thenBlockInstrs]
				if (elseTail !== undefined) {
					const elseTailInstrs = exprMatcher(elseTail)
					const bytesToJumpOver = elseTailInstrs.map(_ => _.sizeInBytes()).reduce((a, b) => a + b)
					const jump2 = new Instruction.Jump(elseTail.startToken.line, Instruction.JumpMode.Always, bytesToJumpOver)
					return instrs.concat([jump2, ...elseTailInstrs])
				}
				return instrs
			},
			Block({statements}) {
				resolver.beginScope()
				const instrs = statements.flatMap(stmtMatcher)
				const popInstrs = resolver.endScope()
				return [...instrs, ...popInstrs]
			},
			Function({name, params, body, returnStmt, startToken}) {
				const generatedName = name === null
					? AnonFuncGenerator.gen()
					: name.lexeme
				const innerResolver = new Resolver(generatedName)
				innerResolver.beginScope()
				if (name !== null) {
					innerResolver.declareVariable(name)
				} else {
					innerResolver.declareVariable(new Token(TokenType.StringLit, '', '""', params[0].line))
				}
				innerResolver.markInitialized()
				for (const param of params) {
					innerResolver.declareVariable(param)
					innerResolver.markInitialized()
				}
				const {instructions: bodyInstrs} = instructionsFromAst(body, declMap, innerResolver)
				const {instructions: returnInstrs} = instructionsFromAst([returnStmt], declMap, innerResolver)
				const funcInstrs = [...bodyInstrs, ...returnInstrs]
				declMap.addFunction(generatedName, params.length, funcInstrs)



				const mkIdentifier = new Instruction.MakeConstant(generatedName, resolver.functionName, 'function')
				return [mkIdentifier, new Instruction.LoadFunction(startToken.line, mkIdentifier)]
			},
			Call({ callee, args, startToken }) {
				const calleeInstrs = exprMatcher(callee)
				const argsInstrs = args.flatMap(exprMatcher)
				const callInstr = new Instruction.Call(startToken.line, args.length)
				return [...calleeInstrs, ...argsInstrs, callInstr]
			}
		})
		return matcher(expr)
	}
	const stmtMatcher = matchAll<Ast.Stmt, Instruction.T[]>({
		Expression({expression, semicolonToken}) {
			return exprMatcher(expression)
		},
		Assignment({name, value}) {
			const localIndex = resolver.resolveLocal(name)
			if (localIndex === null) {
				// FIXME: I think maybe assignment shouldn't try to generate a MakeConstant, only SetGlobal and GetGlobal should.
				const mkIdentifier = new Instruction.MakeConstant(name.lexeme, resolver.functionName)
				return [...exprMatcher(value), mkIdentifier, new Instruction.SetGlobal(name.line, mkIdentifier)]
			} else {
				return [...exprMatcher(value), new Instruction.SetLocal(name.line, localIndex)]
			}
		},
		While({condition, block}) {
			const conditionInstrs = exprMatcher(condition)
			const blockInstrs = exprMatcher(block)

			let bytesToJumpOver = 3 + blockInstrs.map(_ => _.sizeInBytes()).reduce((a, b) => a + b)
			// FIXME: this doesn't make sense. I think we can emit -1 for the jump linenum
			// if we assume it won't ever error, but right now it can have an error if the jump
			// offset doesn't fit in 16 bits. Once we have a jump opcode that works with arbitrary
			// offsets, we can use -1.
			const jumpIfFalse = new Instruction.Jump(-1, Instruction.JumpMode.IfFalse, bytesToJumpOver)

			let conditionLen = conditionInstrs.map(_ => _.sizeInBytes()).reduce((a, b) => a + b)
			const jumpBack = new Instruction.Jump(-1, Instruction.JumpMode.Always, (-1 * bytesToJumpOver) - 1 - conditionLen)

			return [...conditionInstrs, jumpIfFalse, ...blockInstrs, jumpBack]
		},
		Print({expression, printToken}) {
			// TODO Thread print token here
			return [...exprMatcher(expression), new Instruction.Print(printToken.line)]
		},
		Debugger({debuggerToken}) {
			return [new Instruction.Debugger(debuggerToken.line)]
		},
		LetDeclaration({identifier, initializer}) {
			resolver.declareVariable(identifier)
			const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme, resolver.functionName)

			const initializerInstrs = initializer !== undefined
				? exprMatcher(initializer)
				: [new Instruction.LoadNil(identifier.line)]

			// For local variables, there's no "DefineLocal" instruction. The VM is already
			// going to have whatever value we want as the local at the top of the stack.
			// We also don't put the local name into the constant table since we're going
			// to use array indexing to find locals.
			if (resolver.inLocalScope()) {
				resolver.markInitialized()
				return initializerInstrs
			} else {
				return [mkIdentifier, ...initializerInstrs, new Instruction.DefineGlobal(identifier.line, mkIdentifier)]
			}
		},
		Return({expression}) {
			const exprInstrs = exprMatcher(expression)
			const line = exprInstrs[exprInstrs.length - 1].line
			const returnInstr = new Instruction.Return(line)
			return [...exprInstrs, returnInstr]
		},
	})

	const instructions = ast.flatMap(stmtMatcher)
	return { instructions, declarationMap: declMap }
}


export function genBytecode2(declarationMap: DeclarationMap): InstructionBuffer[] {
	const bufs = [] as InstructionBuffer[]
	for (const [functionName, arity, instructions] of declarationMap.entries()) {
		const instructionBuffer = {
			functionName,
			arity,
			instructions: [],
			constants: [],
			lineNumbers: [],
		}
		for (const instruction of instructions) {
			instruction.encode(instructionBuffer)
		}
		bufs.push(instructionBuffer)

	}
	return bufs
}

//export function genBytecode(instructions: Instruction.T[]): InstructionBuffer {
//	const instructionBuffer = {
//		instructions: [],
//		constants: [],
//		lineNumbers: [],
//	} as InstructionBuffer
//
//	for (const instruction of instructions) {
//		instruction.encode(instructionBuffer)
//	}
//
//	return instructionBuffer
//}

export function toBuf(instrBufs: InstructionBuffer[]): string {
	let final_bytecode = ''
	final_bytecode += 'VERSION 0\n'
	final_bytecode += '\n'

	for (const buf of instrBufs) {
		final_bytecode += '---\n'
		final_bytecode += `START FUNCTION ${buf.functionName} ${buf.arity}\n`
		final_bytecode += getBody(buf.instructions)
		final_bytecode += 'END\n\n'

		final_bytecode += 'START CONSTANTS\n'
		final_bytecode += getBody(buf.constants)
		final_bytecode += 'END\n\n'

		final_bytecode += 'START LINENUM\n'
		final_bytecode += getBody(buf.lineNumbers)
		final_bytecode += 'END\n'
	}
	final_bytecode += '\n'
	return final_bytecode
}

export function toAnnotatedBuf(instrBuf: InstructionBuffer, source: string): string {
	let final_bytecode = ''
	console.log('VERSION 0\n')

	console.log('START INSTRUCTIONS')
	let printSrc = true;
	const srcLines  = source.split('\n')
	let currentByte = 0
	for (let i = 0; i < instrBuf.instructions.length; i++) {
		const instr = instrBuf.instructions[i]
		const currentLine = instrBuf.lineNumbers[i]
		const prevLine = instrBuf.lineNumbers[i-1]
		const nextLine = instrBuf.lineNumbers[i+1]

		const src = srcLines[currentLine-1]
		if (prevLine === currentLine) {
			printSrc = false
		} else {
			printSrc = true
		}
		const line = i.toString().padStart(10, '0')
		let bytesInLine = instr.split(' ').length
		bytesInLine += instr.startsWith('jump') ? 1 : 0
		if (currentLine === -1) {
			console.log(line, currentByte.toString().padStart(10, '0'), instr.padEnd(50, ' ') + '.')
			currentByte += bytesInLine
			continue
		}
		if (printSrc) {
			console.log(line, currentByte.toString().padStart(10, '0'), instr.padEnd(50, ' ') + '| ' + currentLine.toString().padEnd(5, ' ') + src)
		} else {
			if (nextLine !== undefined && nextLine !== currentLine) {
				console.log(line, currentByte.toString().padStart(10, '0'), instr.padEnd(50, ' ') + '-')
			} else {
				console.log(line, currentByte.toString().padStart(10, '0'), instr.padEnd(50, ' ') + '* ')
			}
		}
		currentByte += bytesInLine
	}
	console.log('END\n')

	final_bytecode += 'START CONSTANTS\n'
	for (let i = 0; i < instrBuf.constants.length; i++) {
		const line = i.toString().padStart(10, '0')
		console.log(line, instrBuf.constants[i])
	}
	final_bytecode += 'END\n\n'

	return final_bytecode
}

function getBody<T extends {toString(): string}>(items: T[]): string {
	const body = items.map(_ => _.toString())
	if (body.length == 0) {
		return ''
	}
	return body.join('\n') + '\n'
}

function assertType<T extends number | string>(val: T, type: 'number' | 'string', msg?: string): asserts val is T {
	if (typeof val !== type) {
		throw new Error(msg ?? `${val} is not of type ${type}`)
	}
}
