const Tag = 'type'
type Tag = typeof Tag

/* Source: https://github.com/Microsoft/TypeScript/pull/21316#issuecomment-364982638 */
type DiscriminateUnion<
	Union,
	TagKey extends keyof Union,
	TagValue extends Union[TagKey]
> = Union extends Record<TagKey, TagValue> ? Union : never

type MatchingFunc<Union extends TaggedUnion<Tag>, Key extends Union[Tag], R> = (
	props: Omit<DiscriminateUnion<Union, Tag, Key>, Tag>,
) => R

type TaggedUnion<Tag> = {
	[Tag]: string
}

type DefaultMatcher<R> = {
	default(): R
}

type StrictMatchers<U extends TaggedUnion<Tag>, R> = {
	[Variant in U[Tag]]: MatchingFunc<U, Variant, R>
}

type Matchers<U extends TaggedUnion<Tag>, R> =
	| StrictMatchers<U, R>
	| Partial<StrictMatchers<U, R>> & DefaultMatcher<R>

import * as Ast from './ast'

type ZZZ = Z extends Record<'type', 'literal'> ? true : never
type ZZZ_ = DiscriminateUnion<Z, 'type', 'binary'>

type KKK = Record<'type', 'literal'>

const X = new Ast.Literal('x') as Ast.Expr
type Z = typeof X

export function match<U extends TaggedUnion<Tag>, R>(matchers: Matchers<U, R>) {
	const matchersAny = matchers as any
	return (union: U): R => {
		const tag = union[Tag]
		const fn = matchersAny[tag]
		return fn ? fn(union) : matchersAny.default()
	}
}
