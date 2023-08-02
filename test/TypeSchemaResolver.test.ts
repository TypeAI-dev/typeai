import { typeOf } from '@deepkit/type'
import { unwrapTypeSchema } from '../src/TypeSchemaResolver'

test('serialize atomic types', () => {
  expect(unwrapTypeSchema(typeOf<string>())).toMatchObject({
    __type: 'schema',
    type: 'string',
  })

  expect(unwrapTypeSchema(typeOf<number>())).toMatchObject({
    __type: 'schema',
    type: 'number',
  })

  expect(unwrapTypeSchema(typeOf<bigint>())).toMatchObject({
    __type: 'schema',
    type: 'number',
  })

  expect(unwrapTypeSchema(typeOf<boolean>())).toMatchObject({
    __type: 'schema',
    type: 'boolean',
  })

  expect(unwrapTypeSchema(typeOf<null>())).toMatchObject({
    __type: 'schema',
    type: 'null',
  })
})

test('serialize enum', () => {
  enum E1 {
    a = 'a',
    b = 'b',
  }

  expect(unwrapTypeSchema(typeOf<E1>())).toMatchObject({
    __type: 'schema',
    type: 'string',
    enum: ['a', 'b'],
    __registryKey: 'E1',
  })

  enum E2 {
    a = 1,
    b = 2,
  }

  expect(unwrapTypeSchema(typeOf<E2>())).toMatchObject({
    __type: 'schema',
    type: 'number',
    enum: [1, 2],
    __registryKey: 'E2',
  })
})

test('serialize union', () => {
  type Union =
    | {
        type: 'push'
        branch: string
      }
    | {
        type: 'commit'
        diff: string[]
      }

  expect(unwrapTypeSchema(typeOf<Union>())).toMatchObject({
    __type: 'schema',
    oneOf: [
      {
        __type: 'schema',
        type: 'object',
        properties: {
          type: { __type: 'schema', type: 'string', enum: ['push'] },
          branch: { __type: 'schema', type: 'string' },
        },
        required: ['type', 'branch'],
      },
      {
        __type: 'schema',
        type: 'object',
        properties: {
          type: { __type: 'schema', type: 'string', enum: ['commit'] },
          diff: {
            __type: 'schema',
            type: 'array',
            items: { __type: 'schema', type: 'string' },
          },
        },
        required: ['type', 'diff'],
      },
    ],
  })

  type EnumLike = 'red' | 'black'

  expect(unwrapTypeSchema(typeOf<EnumLike>())).toMatchObject({
    __type: 'schema',
    type: 'string',
    enum: ['red', 'black'],
    __registryKey: 'EnumLike',
  })
})
