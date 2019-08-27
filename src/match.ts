import {AssertionError} from 'assert'

const Tag = '_tag'
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

type StrictMatchers<U extends TaggedUnion<Tag>, R> = {
	[Variant in U[Tag]]: MatchingFunc<U, Variant, R>
}

export function matchAll<U extends TaggedUnion<Tag>, R>(
	matchers: StrictMatchers<U, R>,
) {
	const matchersAny = matchers as any
	return (union: U): R => {
		const tag = union[Tag]
		const fn = matchersAny[tag]
		return fn(union)
	}
}

type DefaultMatcher<R> = {
	default(): R
}

// prettier-ignore
type PartialMatchers<U extends TaggedUnion<Tag>, R> = 
	Partial<StrictMatchers<U, R>> & DefaultMatcher<R>

export function matchPartial<U extends TaggedUnion<Tag>, R>(
	matchers: PartialMatchers<U, R>,
) {
	const matchersAny = matchers as any
	return (union: U): R => {
		const tag = union[Tag]
		const fn = matchersAny[tag]
		return fn ? fn(union) : matchersAny.default()
	}
}
