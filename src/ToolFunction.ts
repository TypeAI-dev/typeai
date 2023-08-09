import { DeepKitTypeError } from './errors'
import { SchemaRegistry } from './SchemaRegistry'
import { ReflectionFunction } from '@deepkit/type'
import { TypeSchemaResolver } from './TypeSchemaResolver'
import { Schema } from './types'
import cloneDeepWith from 'lodash/cloneDeepWith'
import { JSONSchemaOpenAIFunction, JSONSchema, JSONSchemaTypeString, JSONSchemaEnum } from './types'
import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  CreateChatCompletionResponse,
  OpenAIApi,
} from 'openai'
import Debug from 'debug'
const debug = Debug('typeai')

export type Components = {
  schemas?: Record<string, Schema>
}

export const handleToolUse = async function (
  openAIClient: OpenAIApi,
  messages: ChatCompletionRequestMessage[],
  responseData: CreateChatCompletionResponse,
  options?: { model?: string; registry?: SchemaRegistry },
): Promise<CreateChatCompletionResponse | undefined> {
  const message = responseData.choices[0].message
  const schemaRegistry = options?.registry || SchemaRegistry.getInstance()

  if (message?.function_call) {
    debug(`function_call: ${JSON.stringify(message.function_call, null, 2)}`)
    const function_name = message.function_call.name as string
    const fn = schemaRegistry.getFunction(function_name)
    if (!fn) {
      throw new Error(`function ${function_name} not found`)
    }
    const function_args = JSON.parse(message.function_call.arguments || '')
    debug(`function_args: ${message.function_call.arguments}`)

    // Map args to positional args - naive for now - TODO
    const argKeys = Object.keys(function_args)
    const positionalArgs = argKeys.map(k => function_args[k])
    const function_response = fn(...positionalArgs)
    debug(`function_response: ${JSON.stringify(function_response, null, 2)}`)

    // Send function result to LLM
    messages.push(message) // extend conversation with assistant's reply
    messages.push({
      role: ChatCompletionRequestMessageRoleEnum.Function,
      name: function_name,
      content: JSON.stringify(function_response),
    })
    debug(JSON.stringify(messages, null, 2))
    const second_response = await openAIClient.createChatCompletion({
      model: options?.model || responseData.model,
      messages,
    })
    const second_message = second_response.data.choices[0].message
    debug(`second_response: ${JSON.stringify(second_message, null, 2)}`)
    return second_response.data
  } else {
    return responseData
  }
}

export class ToolFunction {
  schemaRegistry: SchemaRegistry = SchemaRegistry.getInstance()
  errors: DeepKitTypeError[] = []
  // eslint-disable-next-line @typescript-eslint/ban-types
  fn: Function
  $defs: Map<string, JSONSchema> = new Map()
  _schema?: JSONSchemaOpenAIFunction

  constructor(
    // eslint-disable-next-line @typescript-eslint/ban-types
    fn: Function,
    schemaRegisty: SchemaRegistry,
  ) {
    this.fn = fn
    this.schemaRegistry = schemaRegisty || this.schemaRegistry
  }

  static fromFunction<R>(fn: (...args: any[]) => R, schemaRegistry?: SchemaRegistry): ToolFunction {
    const reflectFn = ReflectionFunction.from(fn)
    const registry = schemaRegistry || SchemaRegistry.getInstance()
    const resolver = new TypeSchemaResolver(reflectFn.type, registry)
    resolver.resolve()
    const oaif = new ToolFunction(fn, registry)
    return oaif
  }

  get schema(): JSONSchemaOpenAIFunction {
    this._schema = this._schema || this.serialize()
    return this._schema
  }
  get registry(): SchemaRegistry {
    return this.schemaRegistry
  }

  get name(): string {
    return this.fn.name
  }

  get description(): string {
    return this.schema.description || ''
  }

  registerDef(name: string, schema?: JSONSchema) {
    if (this.$defs.has(name) || !schema) return
    this.$defs.set(name, schema)
  }

  schemaToJSONSchema(schema: Schema): [JSONSchema, JSONSchema?] {
    let refJSONSchema: JSONSchema | undefined
    if (schema.__registryKey) {
      refJSONSchema = { $ref: `#/$defs/${schema.__registryKey}` }
    }
    const defJSONSchema: JSONSchema = {
      type: (schema.type as JSONSchemaTypeString) || 'null',
    }

    if (schema.type === 'array') {
      if (schema.items) {
        const [imm, def] = this.schemaToJSONSchema(schema.items)
        defJSONSchema.items = imm
        this.registerDef(schema.items.__registryKey as string, def)
      }
    } else if (schema.properties) {
      defJSONSchema.properties = {}
      for (const [key, property] of Object.entries(schema.properties)) {
        const [imm, def] = this.schemaToJSONSchema(property)
        defJSONSchema.properties[key] = imm
        this.registerDef(property.__registryKey as string, def)
      }
    }
    if (schema.description) defJSONSchema.description = schema.description
    if (schema.required) defJSONSchema.required = schema.required
    if (schema.enum) defJSONSchema.enum = schema.enum as JSONSchemaEnum[]

    if (refJSONSchema) {
      return [refJSONSchema, defJSONSchema]
    } else {
      return [defJSONSchema, undefined]
    }
  }

  getFunctionSchema(): JSONSchemaOpenAIFunction {
    const functionSchema: JSONSchemaOpenAIFunction = {
      name: this.fn.name,
    }

    for (const [, schema] of this.schemaRegistry.store) {
      if (schema.schema.type !== 'function') continue
      functionSchema.parameters = functionSchema.parameters ?? {
        type: 'object',
        properties: {},
      }
      functionSchema.parameters.properties = functionSchema.parameters.properties ?? {}
      functionSchema.parameters.required = schema.schema.required ?? []
      for (const [key, subSchema] of Object.entries(schema.schema.properties || {})) {
        const [imm, def] = this.schemaToJSONSchema(subSchema || {})
        this.registerDef(subSchema.__registryKey as string, def)
        const subSchemaJSON = imm
        functionSchema.parameters.properties[key] = {
          ...subSchemaJSON,
        }
      }
    }
    functionSchema.parameters = functionSchema.parameters || {}
    functionSchema.parameters.$defs = this.$defs.size ? Object.fromEntries(this.$defs) : undefined
    return functionSchema
  }

  serialize(): JSONSchemaOpenAIFunction {
    return cloneDeepWith(this.getFunctionSchema(), (c: any) => {
      if (typeof c === 'object') {
        for (const key of Object.keys(c)) {
          // Remove internal keys.
          if (key.startsWith('__')) delete c[key]
        }
      }
    })
  }
}
