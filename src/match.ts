const Tag = '_tag'
type Tag = typeof Tag

/* Source: https://github.com/Microsoft/TypeScript/pull/21316#issuecomment-364982638 */
type DiscriminateUnion<Union, TagKey extends keyof Union, TagValue extends Union[TagKey]> = Union extends Record<
	TagKey,
	TagValue
>
	? Union
	: never

type MatchingFunc<Union extends TaggedUnion<Tag>, Key extends Union[Tag], R> = (
	props: Omit<DiscriminateUnion<Union, Tag, Key>, Tag>,
) => R

// FIXME: Tag type not used here, we should make the match tag configurable
// TaggedUnion will be a local type.
type TaggedUnion<Tag> = {
	[Tag]: string
}

type StrictMatchers<U extends TaggedUnion<Tag>, R> = {
	[Variant in U[Tag]]: MatchingFunc<U, Variant, R>
}

type PartialMatchers<U extends TaggedUnion<Tag>, R> =
	StrictMatchers<U, R> | (Partial<StrictMatchers<U, R>> & { default(item: U): R })

export function matchAll<U extends TaggedUnion<Tag>, R>(matchers: StrictMatchers<U, R>) {
	const matchersAny = matchers as any
	return (union: U): R => {
		const tag = union[Tag]
		const fn = matchersAny[tag]
		return fn(union)
	}
}

export function matchPartial<U extends TaggedUnion<Tag>, R>(matchers: PartialMatchers<U, R>) {
	const matchersAny = matchers as any
	return (union: U): R => {
		const fn = matchersAny[Tag]
		return fn !== undefined
			? fn(union)
			: matchersAny['default'](union)
	}
}
