import { Type, TypeLiteral, metaAnnotation } from '@deepkit/type'
export type SimpleType = string | number | boolean | null | bigint

export type Schema = {
  __type: 'schema'
  __registryKey?: string
  __isComponent?: boolean
  __isUndefined?: boolean
  description?: string
  type?: string
  not?: Schema
  pattern?: string
  multipleOf?: number
  minLength?: number
  maxLength?: number
  minimum?: number | bigint
  exclusiveMinimum?: number | bigint
  maximum?: number | bigint
  exclusiveMaximum?: number | bigint
  enum?: SimpleType[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  default?: any
  oneOf?: Schema[]

  $ref?: string
}
export const AnySchema: Schema = { __type: 'schema' }

// ---

// OpenAI claims to use JSON Schema 2020-12 / Draft 8 patch 1
// - https://community.openai.com/t/whitch-json-schema-version-should-function-calling-use/283535
// - https://json-schema.org/specification-links.html#2020-12
export type JSONSchemaEnum = string | number | boolean | bigint | null
export type JSONSchemaTypeString =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
export type JSONSchema = {
  type?: JSONSchemaTypeString
  description?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  enum?: JSONSchemaEnum[]
  required?: string[]
  $ref?: string
  $defs?: Record<string, JSONSchema>
}
export type JSONSchemaOpenAIFunction = {
  name: string
  description?: string
  parameters?: JSONSchema
}
export type Description<T extends string> = { __meta?: ['metaDescription', T] }
export const getMetaDescription = (t: Type) =>
  (metaAnnotation.getForName(t, 'metaDescription')?.[0] as TypeLiteral)?.literal as string
