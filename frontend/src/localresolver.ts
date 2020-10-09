import {debug} from './debug'
import {Token} from './token'
import {error} from './error'
import {Instruction} from './backends/bytecode/instruction'

const UINT8_COUNT= 2**8

export class Local {
	constructor(readonly name: string, readonly depth: number, public initialized = false) {}
}

export class Resolver {
	static last = 0
	private id: number
	locals = [] as Local[]
	localCount = 0 // FIXME: I don't think I need this, I can just use .length, .push and .pop
	scopeDepth = 0
	constructor(public readonly functionName: string) {
		this.id = Resolver.last++
	}
	beginScope() {
		this.scopeDepth++
	}
	markInitialized() {
		debug(`marking at ${this.localCount-1}`,this.locals)
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
		debug(`declareVariable[${this.id}]: depth=${this.scopeDepth} declaring ${identifier.lexeme}`)
		if (!this.inLocalScope()) {
			// Globals don't make use of the resolver since their
			// declaration is explicit in the bytecode.
			// i.e. the resolver doesn't keep track of globals
			debug(`declareVariable[${this.id}]: Not in local scope for ${identifier.lexeme}!`)
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
			if (local.name === identifier.lexeme) {
				error(identifier, 'Variable with this name already declared in this scope')
			}
		}
		debug(`declareVariable[${this.id}]: Adding local ${identifier.lexeme}`)
		this.addLocal(identifier)
	}

	addLocal(identifier: Token) {
		if (this.localCount === UINT8_COUNT) {
			// FIXME: I think it's actually more precise to say "in scope", not "in function"
			error(identifier, 'Too many local variables in function')
			return
		}

		const local = new Local(identifier.lexeme, this.scopeDepth)
		// FIXME: lol this is just a push
		this.locals[this.localCount++] = local
	}

	resolveLocal(identifier: Token): number | null {
		debug(`resolveLocal[${this.id}]: resolving `, identifier)
		debug(`resolveLocal[${this.id}]: locs`, this.locals)
		for (let i = this.localCount - 1; i >= 0; i--) {
			const local = this.locals[i]
			debug(`Comparing ${local.name} to ${identifier.lexeme}`)
			if (local.name === identifier.lexeme) {
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

