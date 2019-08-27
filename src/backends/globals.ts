import * as llvm from 'llvm-node'

export const createGlobals = (
	context: llvm.LLVMContext,
	module: llvm.Module,
) => ({
	print: llvm.Function.create(
		llvm.FunctionType.get(
			llvm.Type.getVoidTy(context),
			[llvm.Type.getDoubleTy(context)],
			false,
		),
		llvm.LinkageTypes.ExternalLinkage,
		'kiwi_print',
		module,
	),
})
