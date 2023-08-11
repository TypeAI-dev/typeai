import { DeepKitTypeError } from './errors'
import { SchemaRegistry } from './SchemaRegistry'
import {
  ReflectionFunction,
  ReceiveType,
  resolveReceiveType,
  InlineRuntimeType,
  Type,
} from '@deepkit/type'
import { TypeSchemaResolver } from './TypeSchemaResolver'
import { Schema } from './types'
import cloneDeepWith from 'lodash/cloneDeepWith'
import { JSONSchemaOpenAIFunction, JSONSchema, JSONSchemaTypeString, JSONSchemaEnum } from './types'
import {
  ChatCompletionRequestMessageRoleEnum,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  OpenAIApi,
} from 'openai'
import Debug from 'debug'
const debug = Debug('typeai')
const debugNet = Debug('typeai:net')

type HandleToolUseOptions = {
  model?: string
  registry?: SchemaRegistry
  handle?: 'single' | 'multiple'
}

export const handleToolUse = async function (
  openAIClient: OpenAIApi,
  originalRequest: CreateChatCompletionRequest,
  responseData: CreateChatCompletionResponse,
  options?: HandleToolUseOptions,
): Promise<CreateChatCompletionResponse | undefined> {
  const _options = { ...options, handle: options?.handle || 'multiple' }
  const messages = originalRequest.messages

  const currentMessage = responseData.choices[0].message
  const schemaRegistry = options?.registry || SchemaRegistry.getInstance()

  if (currentMessage?.function_call) {
    debug(`handleToolUse: function_call: ${JSON.stringify(currentMessage.function_call, null, 2)}`)
    const function_name = currentMessage.function_call.name as string
    const fn = schemaRegistry.getFunction(function_name)
    if (!fn) {
      throw new Error(`handleToolUse: function ${function_name} not found`)
    }
    const function_args = JSON.parse(currentMessage.function_call.arguments || '')
    debug(`handleToolUse: function_args: ${currentMessage.function_call.arguments}`)

    // Map args to positional args - naive for now - TODO
    const argKeys = Object.keys(function_args)
    const positionalArgs = argKeys.map(k => function_args[k])
    const function_response = await fn(...positionalArgs)

    // Send function result to LLM
    messages.push(currentMessage) // extend conversation with assistant's reply
    messages.push({
      role: ChatCompletionRequestMessageRoleEnum.Function,
      name: function_name,
      content: JSON.stringify(function_response),
    })
    const nextRequest: CreateChatCompletionRequest = {
      model: options?.model || responseData.model,
      messages,
      functions: originalRequest?.functions || [],
    }
    debugNet(`handleToolUse: nextRequest: ${JSON.stringify(nextRequest, null, 2)}`)

    const nextResponse = await openAIClient.createChatCompletion(nextRequest)
    debugNet(`handleToolUse: nextResponse: ${JSON.stringify(nextResponse.data, null, 2)}`)

    if (nextResponse.data.choices[0]?.finish_reason === 'stop' || _options.handle === 'single') {
      debug(
        `handleToolUse: Completed with finish_reason:${nextResponse.data.choices[0]?.finish_reason} handle:${_options.handle}`,
      )
      return responseData
    } else {
      return handleToolUse(openAIClient, originalRequest, nextResponse.data, _options)
    }
  } else {
    debug(`handleToolUse: Completed with no function_call`)
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

  static from<R>(
    fn: (...args: any[]) => R,
    schemaRegistry?: SchemaRegistry,
    options?: { overrideName?: string },
  ): ToolFunction {
    const reflectFn = ReflectionFunction.from(fn)
    const registry = schemaRegistry || SchemaRegistry.getInstance()
    const resolver = new TypeSchemaResolver(reflectFn.type, registry, {
      overrideName: options?.overrideName,
    })
    resolver.resolve()
    const oaif = new ToolFunction(fn, registry)
    return oaif
  }

  static modelSubmissionToolFor<T>(
    cb: (arg: T) => Promise<void>,
    t?: ReceiveType<T>,
  ): ToolFunction {
    const tType = resolveReceiveType(t)
    const modelType = tType as Type
    const name = `submit${modelType.typeName}Data`

    /** Submits generated data */
    const submitDataSpec = function submitDataSpec(
      data: InlineRuntimeType<typeof modelType>,
    ): string {
      debug(`submitData: for:${name} data:${JSON.stringify(data, null, 2)}`)
      cb(data)
      return '{ "status": "ok" }'
    }
    const fn = Object.defineProperty(submitDataSpec, 'name', {
      value: name,
      writable: false,
    })

    const submitDataTool = ToolFunction.from(fn, undefined, { overrideName: name })
    return submitDataTool
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
      if (schema.schema.type !== 'function' || schema.name != this.fn.name) continue
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
