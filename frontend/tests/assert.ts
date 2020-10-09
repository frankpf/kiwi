import {strict as stdAssert} from 'assert'

export function assert<T>(actual: T, expected: T) {
	stdAssert.deepEqual(actual, expected)
}
