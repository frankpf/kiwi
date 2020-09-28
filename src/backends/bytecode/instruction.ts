import * as Ast from '../../ast'
import {_, TupleLength} from '../../utils'
import {matchAll} from '../../match'
import {TokenType} from '../../token'
import {Resolver, Local} from '../../localresolver'

const resolver = new Resolver()


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

		constructor(readonly constant: string) {}

		encode(buf: InstructionBuffer) {
			const constant = MakeConstant.globalConstants[this.constant]
			if (constant !== undefined) {
				this._index = constant.index()
				return
			}

			const prefix = `s${this.constant.length}`
			const index = buf.constants.push(`${prefix} ${this.constant}`) - 1
			this._index = index
			MakeConstant.globalConstants[this.constant] = this
		}

		sizeInBytes() { return 0 }

		static for(constant: string): MakeConstant {
			return MakeConstant.globalConstants[constant]
		}

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

	export const Print = SimpleInstr('print')
	export type Print = InstanceType<typeof Print>

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
	instructions: string[]
	constants: string[] // f{number} or i{number}
	lineNumbers: number[]
}

export function fromAst(ast: Ast.Stmt[]): string {
	const instructions = instructionsFromAst(ast)
	const buf = genBytecode(instructions)
	const text = toBuf(buf)
	return text
}

function instructionsFromAst(ast: Ast.Stmt[]): Instruction.T[] {
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
					default:
						throw new Error(`Binary operator ${operator} not supported`)
				}
				return [...leftInstrs, ...rightInstrs, opInstr]
			},
			Grouping({expression}) {
				return exprMatcher(expression)
			},
			Unary({operator, right}) {
				const rightInstrs = exprMatcher(right)
				let opInstr: Instruction
				switch (operator.type) {
					case TokenType.Minus:
						opInstr = new Instruction.Negate(operator.line)
						break
					default:
						throw new Error(`Unary operator ${operator} not supported`)
				}
				return [...rightInstrs, opInstr]
			},
			LetAccess({identifier, startToken}) {
				const localIndex = resolver.resolveLocal(identifier)
				if (localIndex === null) {
					const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme)
					return [mkIdentifier, new Instruction.GetGlobal(startToken.line, mkIdentifier)]
				} else {
					return [new Instruction.GetLocal(startToken.line, localIndex)]
				}
			},
			If({condition, thenBlock, elseTail}) {
				return _()
			},
			Block({statements}) {
				resolver.beginScope()
				const instrs = statements.flatMap(stmtMatcher)
				const popInstrs = resolver.endScope()
				return [...instrs, ...popInstrs]
			},
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
				const mkIdentifier = new Instruction.MakeConstant(name.lexeme)
				return [...exprMatcher(value), mkIdentifier, new Instruction.SetGlobal(name.line, mkIdentifier)]
			} else {
				return [...exprMatcher(value), new Instruction.SetLocal(name.line, localIndex)]
			}
		},
		While({condition, block}) {
			throw 'While not supported'
			return _()
		},
		Print({expression, printToken}) {
			// TODO Thread print token here
			return [...exprMatcher(expression), new Instruction.Print(printToken.line)]
		},
		LetDeclaration({identifier, initializer}) {
			resolver.declareVariable(identifier)
			const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme)

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
	})
	const instrs = ast.flatMap(stmtMatcher)
	const lastLine = instrs[instrs.length - 1].line
	return [...instrs, new Instruction.Return(lastLine)]
}

export function genBytecode(instructions: Instruction.T[]): InstructionBuffer {
	const instructionBuffer = {
		instructions: [],
		constants: [],
		lineNumbers: [],
	} as InstructionBuffer

	for (const instruction of instructions) {
		instruction.encode(instructionBuffer)
	}

	return instructionBuffer
}

export function toBuf(instrBuf: InstructionBuffer): string {
	let final_bytecode = ''
	final_bytecode += 'VERSION 0\n'
	final_bytecode += '\n'

	final_bytecode += 'START INSTRUCTIONS\n'
	final_bytecode += getBody(instrBuf.instructions)
	final_bytecode += 'END\n\n'

	final_bytecode += 'START CONSTANTS\n'
	final_bytecode += getBody(instrBuf.constants)
	final_bytecode += 'END\n\n'

	final_bytecode += 'START LINENUM\n'
	final_bytecode += getBody(instrBuf.lineNumbers)
	final_bytecode += 'END\n'
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
