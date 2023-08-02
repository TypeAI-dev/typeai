import { DeepKitTypeError } from './errors'
import { SchemaRegistry } from './SchemaRegistry'
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

export const handleLLMFunctionUse = async function (
  openAIClient: OpenAIApi,
  schemaRegistry: SchemaRegistry,
  messages: ChatCompletionRequestMessage[],
  responseData: CreateChatCompletionResponse,
  options?: { model?: string },
): Promise<CreateChatCompletionResponse | undefined> {
  const message = responseData.choices[0].message

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

export class OpenAIFunction {
  schemaRegistry: SchemaRegistry
  errors: DeepKitTypeError[] = []
  // eslint-disable-next-line @typescript-eslint/ban-types
  fn: Function

  constructor(
    // eslint-disable-next-line @typescript-eslint/ban-types
    fn: Function,
    public schemaRegisty: SchemaRegistry,
  ) {
    this.fn = fn
    this.schemaRegistry = schemaRegisty
  }

  schemaToJSONSchema(schema: Schema): JSONSchema {
    const jsonSchema: JSONSchema = {
      type: (schema.type as JSONSchemaTypeString) || 'null',
    }

    if (schema.type === 'array') {
      if (schema.items) {
        jsonSchema.items = this.schemaToJSONSchema(schema.items)
      }
    } else if (schema.properties) {
      jsonSchema.properties = {}
      for (const [key, property] of Object.entries(schema.properties)) {
        jsonSchema.properties[key] = this.schemaToJSONSchema(property)
      }
    }
    if (schema.description) jsonSchema.description = schema.description
    if (schema.required) jsonSchema.required = schema.required
    if (schema.enum) jsonSchema.enum = schema.enum as JSONSchemaEnum[]

    return jsonSchema
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
        functionSchema.parameters.properties[key] = {
          ...this.schemaToJSONSchema(subSchema || {}),
        }
      }
    }
    return functionSchema
  }

  serialize(): JSONSchemaOpenAIFunction {
    return cloneDeepWith(this.getFunctionSchema(), (c: any) => {
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
}
