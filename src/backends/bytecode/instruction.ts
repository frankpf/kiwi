import * as Ast from '../../ast'
import {_} from '../../utils'
import {matchAll} from '../../match'
import {TokenType} from '../../token'

const NOLINE = 0

export type Instruction =
	| Instruction.Pop
	| Instruction.LoadConstant
	| Instruction.LoadNil
	| Instruction.LoadTrue
	| Instruction.LoadFalse
	| Instruction.Add
	| Instruction.Subtract
	| Instruction.Multiply
	| Instruction.Divide
	| Instruction.Negate
	| Instruction.Return
	| Instruction.Equal
	| Instruction.GreaterEqual
	| Instruction.LessEqual
	| Instruction.Greater
	| Instruction.Less
	| Instruction.Print
	| Instruction.MakeConstant
	| Instruction.DefineGlobal
	| Instruction.GetGlobal
	| Instruction.SetGlobal

export namespace Instruction {
	interface Instr<T> {
		readonly _tag: T
		readonly line: number
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
				this._index = constant.index
				return
			}

			const prefix = `s${this.constant.length}`
			const index = buf.constants.push(`${prefix} ${this.constant}`) - 1
			this._index = index
			MakeConstant.globalConstants[this.constant] = this
		}

		static for(constant: string): MakeConstant {
			return MakeConstant.globalConstants[constant]
		}

		get index() {
			if (this._index === undefined) {
				throw new Error('Tried to access constant with no index')
			}
			return this._index
		}
	}

	export class SetGlobal implements Instr<'SetGlobal'> {
		readonly _tag = 'SetGlobal'
		constructor(readonly line: number, readonly constantString: string) {}

		encode(buf: InstructionBuffer) {
			buf.instructions.push(`set_global ${MakeConstant.for(this.constantString).index}`)
			buf.lineNumbers.push(this.line)
		}
	}

	export class GetGlobal implements Instr<'GetGlobal'> {
		readonly _tag = 'GetGlobal'
		constructor(readonly line: number, readonly constantString: string) {}

		encode(buf: InstructionBuffer) {
			buf.instructions.push(`get_global ${MakeConstant.for(this.constantString).index}`)
			buf.lineNumbers.push(this.line)
		}
	}

	export class DefineGlobal implements Instr<'DefineGlobal'> {
		readonly _tag = 'DefineGlobal'
		constructor(readonly line: number, readonly constant: MakeConstant) {}

		encode(buf: InstructionBuffer): void {
			buf.instructions.push(`define_global ${this.constant.index}`)
			buf.lineNumbers.push(this.line)
		}
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

	function SimpleInstr<T extends string>(instr: T) {
		const classRef: { new(line: number): Instr<T> } = class implements Instr<T> {
			readonly _tag = instr
			constructor(readonly line: number) {}
			encode(buf: InstructionBuffer) {
				buf.instructions.push(instr)
				buf.lineNumbers.push(this.line)
			}
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

function instructionsFromAst(ast: Ast.Stmt[]): Instruction[] {
	function exprMatcher(expr: Ast.Expr): Instruction[] {
		const matcher = matchAll<Ast.Expr, Instruction[]>({
			Literal({value, startToken}) {
				if (typeof value === 'number') {
					if (startToken.type == TokenType.DoubleLit) {
						return [new Instruction.LoadConstant(NOLINE, value, true)]
					} else {
						return [new Instruction.LoadConstant(NOLINE, value, false)]
					}
				} else if (value === null) {
					return [new Instruction.LoadNil(NOLINE)]
				} else if (value === true) {
					return [new Instruction.LoadTrue(NOLINE)]
				} else if (value === false) {
					return [new Instruction.LoadFalse(NOLINE)]
				} else if (typeof value === 'string') {
					return [new Instruction.LoadConstant(NOLINE, value, false)]
				} else {
					throw new Error(`Unknown type for literal: ${value}`)
				}
			},
			Binary({left, operator, right}) {
				const leftInstrs = exprMatcher(left)
				const rightInstrs = exprMatcher(right)
				let opInstr: Instruction
				switch (operator.type) {
					case TokenType.Minus:
						opInstr = new Instruction.Subtract(NOLINE)
						break
					case TokenType.Plus:
						opInstr = new Instruction.Add(NOLINE)
						break
					case TokenType.Star:
						opInstr = new Instruction.Multiply(NOLINE)
						break
					case TokenType.Slash:
						opInstr = new Instruction.Divide(NOLINE)
						break
					case TokenType.EqualEqual:
						opInstr = new Instruction.Equal(NOLINE)
						break
					case TokenType.Greater:
						opInstr = new Instruction.Greater(NOLINE)
						break
					case TokenType.GreaterEqual:
						opInstr = new Instruction.GreaterEqual(NOLINE)
						break
					case TokenType.Less:
						opInstr = new Instruction.Less(NOLINE)
						break
					case TokenType.LessEqual:
						opInstr = new Instruction.LessEqual(NOLINE)
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
						opInstr = new Instruction.Negate(NOLINE)
						break
					default:
						throw new Error(`Unary operator ${operator} not supported`)
				}
				return [...rightInstrs, opInstr]
			},
			LetAccess({identifier}) {
				const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme)
				return [mkIdentifier, new Instruction.GetGlobal(NOLINE, identifier.lexeme)]
			},
			If({condition, thenBlock, elseTail}) {
				return _()
			},
			Block({statements}) {
				return _()
			},
		})
		return matcher(expr)
	}
	const stmtMatcher = matchAll<Ast.Stmt, Instruction[]>({
		Expression({expression}) {
			return [...exprMatcher(expression), new Instruction.Pop(NOLINE)]
		},
		Assignment({name, value}) {
			// FIXME: I think maybe assignment shouldn't try to generate a MakeConstant, only SetGlobal and GetGlobal should.
			const mkIdentifier = new Instruction.MakeConstant(name.lexeme)
			return [...exprMatcher(value), mkIdentifier, new Instruction.SetGlobal(NOLINE, name.lexeme)]
		},
		While({condition, block}) {
			throw 'While not supported'
			return _()
		},
		Print({expression}) {
			return [...exprMatcher(expression), new Instruction.Print(NOLINE)]
		},
		LetDeclaration({identifier, initializer}) {
			const mkIdentifier = new Instruction.MakeConstant(identifier.lexeme)
			const initializerInstrs = initializer !== undefined
				? exprMatcher(initializer)
				: [new Instruction.LoadNil(NOLINE)]

			return [mkIdentifier, ...initializerInstrs, new Instruction.DefineGlobal(NOLINE, mkIdentifier)]

		},
	})
	return ast.flatMap(stmtMatcher).concat([new Instruction.Return(NOLINE)])
}

export function genBytecode(instructions: Instruction[]): InstructionBuffer {
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
