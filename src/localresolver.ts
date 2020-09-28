import {matchAll, matchPartial} from './match'
import * as Ast from './ast'
import {Token} from './token'
import {error} from './error'
import {Instruction} from './backends/bytecode/instruction'


const UINT8_COUNT= 2**8

export class Resolver {
	locals = [] as Local[]
	// FIXME: I don't think I need this, I can just use .length and .push
	localCount = 0
	scopeDepth = 0
	constructor() {}
	beginScope() {
		this.scopeDepth++
	}
	markInitialized() {
		this.locals[this.localCount - 1].initialized = true
	}
	endScope(): Instruction.T[] {
		const instructions = [] as Instruction.T[]
		this.scopeDepth--
		while (this.localCount > 0 && this.locals[this.localCount - 1].depth > this.scopeDepth) {
			// FIXME: I think emitting -1 as the line number makes sense here?
			// Pop instructions are taking a variable off the stack when their scope is finished,
			// so they're technically an implementation detail of our stack-based bytecode.
			// I don't think they correspond 1:1 to any particular line in the source code.
			// Also, more practically, these instructions are never going to fail at runtime
			// (unless our bytecode compiler has a bug), which means the user is never going to run
			// into a "Error in line -1" error report.
			// TODO: Check how other languages do this.
			instructions.push(new Instruction.Pop(-1))
			this.localCount--
		}
		return instructions
	}
	inLocalScope() {
		return this.scopeDepth > 0
	}
	declareVariable(identifier: Token) {
		if (!this.inLocalScope()) {
			// Globals don't make use of the resolver since their
			// declaration is explicit in the bytecode.
			// i.e. the resolver doesn't keep track of globals
			return
		}

		// Look for a local with the same name in the same scope
		// If it exists, we report an error.
		for (let i = this.localCount - 1; i >= 0; i--) {
			const local = this.locals[i]
			if (local.depth !== -1 && local.depth < this.scopeDepth) {
				break
			}

			// FIXME: we could refactor this to create a Local before the loop
			// and use l1.equals(l2) instead of comparing lexemes.
			// Some overhead but it's cleaner...I think?
			if (local.name.lexeme === identifier.lexeme) {
				error(identifier, 'Variable with this name already declared in this scope')
			}
		}
		this.addLocal(identifier)
	}

	addLocal(identifier: Token) {
		if (this.localCount === UINT8_COUNT) {
			// FIXME: I think it's actually more precise to say "in scope", not "in function"
			error(identifier, 'Too many local variables in function')
			return
		}

		const local = new Local(identifier, this.scopeDepth)
		// FIXME: lol this is just a push
		this.locals[this.localCount++] = local
	}

	resolveLocal(identifier: Token): number | null {
		for (let i = this.localCount - 1; i >= 0; i--) {
			const local = this.locals[i]
			if (local.name.lexeme === identifier.lexeme) {
				if (!local.initialized) {
					// FIXME: We need error synchronization in the resolver/instruction generator too oops
					error(identifier, "Cannot read local variable in its own initiializer")
				}
				return i
			}
		}

		return null
	}
}

export class Local {
	constructor(readonly name: Token, readonly depth: number, public initialized = false) {}
}
