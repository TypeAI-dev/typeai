import { encode, decode } from 'gpt-tokenizer'
import { SchemaRegistry, SchemeEntry } from './SchemaRegistry'
import cloneDeepWith from 'lodash/cloneDeepWith'
import { JSONSchema, JSONSchemaTypeString, JSONSchemaEnum, Schema } from './types'
// import * as util from 'util'
// import Debug from 'debug'
// const debug = Debug('typeai')

export const truncateByTokens = (text: string, maxTokens: number): string => {
  return decode(encode(text).slice(0, maxTokens))
}

export function schemaToJSONSchema(schema: Schema): JSONSchema {
  const jsonSchema: JSONSchema = {
    type: (schema.type as JSONSchemaTypeString) || 'null',
  }
  // new
  if (schema.type === 'array') {
    if (schema.items) {
      jsonSchema.items = schemaToJSONSchema(schema.items)
    }
  } else if (schema.properties) {
    jsonSchema.properties = {}
    for (const [key, property] of Object.entries(schema.properties)) {
      jsonSchema.properties[key] = schemaToJSONSchema(property)
    }
  }
  if (schema.required) {
    jsonSchema.required = schema.required
  }
  jsonSchema.description = schema.description
  jsonSchema.enum = (schema.enum as JSONSchemaEnum[]) || undefined
  return jsonSchema
}

export function getSchema(registry: SchemaRegistry, se: SchemeEntry): JSONSchema {
  // console.log('SchemeEntry: ', util.inspect(se, { depth: 8 }))
  const s: JSONSchema = {
    type: (se.schema.type as JSONSchemaTypeString) || 'object',
    required: se.schema.required || [],
  }
  s.properties = {}
  for (const [key, subSchema] of Object.entries(se.schema.properties || {})) {
    s.properties[key] = {
      ...schemaToJSONSchema(subSchema || {}),
    }
  }
  return s
}

export function serialize(schema: JSONSchema): JSONSchema {
  // console.log('schema: ', util.inspect(schema, { depth: 8 }))
  return cloneDeepWith(schema, (c: any) => {
    if (typeof c === 'function') {
      if (c.__type === 'schema' && c.__registryKey && !c.__isComponent) {
        return {
          $ref: `#/components/schemas/${c.__registryKey}`,
        }
      }

      for (const key of Object.keys(c)) {
        // Remove internal keys.
        if (key.startsWith('__')) delete c[key]
      }
    }
  })
}
