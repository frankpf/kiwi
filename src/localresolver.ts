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
	endScope(): Instruction[] {
		const instructions = [] as Instruction[]
		this.scopeDepth--
		while (this.localCount > 0 && this.locals[this.localCount - 1].depth > this.scopeDepth) {
			console.log(this.localCount, this.scopeDepth, this.locals)
			instructions.push(new Instruction.Pop(-1))
			this.localCount--
		}
		return instructions
	}
	declareVariable(identifier: Token) {
		if (this.scopeDepth == 0) {
			return
		}

		for (let i = this.localCount - 1; i >= 0; i--) {
			const local = this.locals[i]
			if (local.depth !== -1 && local.depth < this.scopeDepth) {
				break
			}

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
}

export class Local {
	constructor(readonly name: Token, readonly depth: number) {}
}


const stmtMatcher = matchPartial<Ast.Stmt, void>({
	[Ast.Stmt.LetDeclaration.uri]({ identifier, initializer }) {
		declareVariable()
		if (resolver.scopeDepth > 0) {
			return 0 // dummy table index
		}
	},
	default() {}
})

function declareVariable(identifier: Token) {
}

function addLocal(identifier: Token) {
	if (resolver.localCount === UINT8_COUNT) {
		// FIXME: I think it's actually more precise to say "in scope", not "in function"
		error(identifier, 'Too many local variables in function')
		return
	}

	const local = new Local(identifier, resolver.scopeDepth)
	// FIXME: lol this is just a push
	resolver.locals[resolver.localCount++] = local
}
