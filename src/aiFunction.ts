import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'
import { ReceiveType, ReflectionFunction, TypeObjectLiteral, Type } from '@deepkit/type'
import { schemaToJSONSchema } from './utils'
import { SchemaRegistry } from '../src/SchemaRegistry'
import { TypeSchemaResolver } from '../src/TypeSchemaResolver'
import { JSONSchema, JSONSchemaOpenAIFunction } from './types'
import Debug from 'debug'
import * as util from 'util'
const debug = Debug('typeai')
const debugNet = Debug('typeai:net')

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const prompt = (
  purpose: string,
  signature: string,
  inputJSONSchema: Record<string, JSONSchema> | undefined,
) => {
  const schema = JSON.stringify(inputJSONSchema, null, 2)
  return `Your job is to generate likely outputs for a TypeScript function with the
  following signature and docstring:
  
  signature: ${signature}
  docstring: ${purpose}

  The user will provide function inputs (if any) and you must respond with
  the most likely result. The user's input data will conform to the following JSON schema:

  \`\`\`json
  ${schema}
  \`\`\`
  
  You must submit your result via the submitLLMGeneratedData function.
`
}

const _infer = async <T, R>(
  purpose: string,
  signature: string,
  functionJSONSchema: JSONSchemaOpenAIFunction,
  inputJSONSchema: Record<string, JSONSchema> | undefined,
  input: T,
  options?: AIFunctionOptions,
  rt?: ReceiveType<R>,
): Promise<R> => {
  // Run a completion series
  const inputJSON = JSON.stringify(input, null, 2)
  debug(`functionJsonSchema: ${JSON.stringify(functionJSONSchema, null, 2)}`)
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: prompt(purpose, signature, inputJSONSchema),
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: inputJSON,
    },
  ]
  const request: CreateChatCompletionRequest = {
    model: options?.model || 'gpt-3.5-turbo',
    messages,
    functions: [functionJSONSchema],
    function_call: { name: 'submitLLMGeneratedData' },
    stream: false,
    max_tokens: 1000,
    temperature: 0,
  }
  debugNet(`MagicAIFunction CreateChatCompletionRequest: ${JSON.stringify(request, null, 2)}`)

  const response = await openai.createChatCompletion(request)
  debugNet(
    `MagicAIFunction CreateChatCompletionResponse: ${JSON.stringify(response.data, null, 2)}`,
  )

  const argsJSON = response.data.choices[0].message?.function_call?.arguments || '{}'
  const args = JSON.parse(argsJSON)
  return args?.result as R
}

export type ToAIFunctionOptions = {
  model?: string
  registry?: SchemaRegistry
}
export type AIFunctionOptions = {
  model?: string
  description?: string
}

/**
 * Returns a synthesized function that uses the OpenAI API to implement the desired behavior, with type signature matching `f`.
 *
 * @typeParam T - the input type of the generated AI function
 * @typeParam R - the output type of the generated AI function
 * @param f - a stub function with the desired type signature for the generated AI function
 * @param toAIFunctionOptions - options for the generated AI function
 *
 * @returns A function with AI-backed implementation, respecting the type signature of `f`
 *          and the behavior described in the JSDoc description tag for `f`.
 */
export function toAIFunction<T, R>(
  f: (input: T) => R,
  toAIFunctionOptions?: ToAIFunctionOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): <MagicAIFunction>(input: T, aiFunctionOptions?: AIFunctionOptions) => Promise<Exclude<R, void>> {
  const rfn = ReflectionFunction.from(f)
  const tType = rfn.type.parameters[0].type
  const rType = rfn.type.return
  const options: ToAIFunctionViaRuntimeTypesOptions = {
    model: toAIFunctionOptions?.model,
    name: f.name,
  }
  const fn = toAIFunctionViaRuntimeTypes<T, R>(tType, rType, options)
  return fn
}

export type ToAIFunctionViaRuntimeTypesOptions = ToAIFunctionOptions & {
  name?: string
}

export function toAIFunctionViaRuntimeTypes<T, R>(
  iType: Type,
  rType: Type,
  options?: ToAIFunctionViaRuntimeTypesOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): <MagicAIFunction>(input: T, aiFunctionOptions?: AIFunctionOptions) => Promise<Exclude<R, void>> {
  type RMinusVoid = Exclude<R, void>

  const toAIFunctionOptions = options
  const name = options?.name || `to${rType.typeName}`
  const inputJSONSchema = {
    input: {
      type: 'string',
    } as JSONSchema,
  }
  debug(`rType: ${util.inspect(rType, { depth: 8 })}`)

  // Build JSON schema description of submitLLMGeneratedData
  const registry = options?.registry || SchemaRegistry.getInstance()
  const resolver = new TypeSchemaResolver(rType, registry)
  resolver.resolve()
  debug(`registry.store: ${util.inspect(registry.store, { depth: 8 })}`)
  const rSchemaJSON = schemaToJSONSchema(resolver.result)

  const rKey = registry.getTypeKey(rType)
  const signature = `${name}(input: string) => ${rType.typeName || rKey}`

  const submitGeneratedDataSchema: JSONSchemaOpenAIFunction = {
    name: 'submitLLMGeneratedData',
    parameters: {
      type: 'object',
      properties: {
        result: rSchemaJSON,
      },
      required: ['result'],
    },
  }

  // Magic function
  type MagicAIFunction = {
    (input: T, options?: AIFunctionOptions): Promise<RMinusVoid>
    description: string
  }
  const fn = <MagicAIFunction>(async (
    input: T,
    options?: AIFunctionOptions,
  ): Promise<RMinusVoid> => {
    const aiFunctionOptions = options
    const _options: AIFunctionOptions = {
      model: aiFunctionOptions?.model || toAIFunctionOptions?.model,
      description: aiFunctionOptions?.description || '',
    }
    const purpose = aiFunctionOptions?.description || ''
    const res = await _infer(
      purpose,
      signature,
      submitGeneratedDataSchema,
      inputJSONSchema,
      input,
      _options,
    )
    return Promise.resolve(res as RMinusVoid)
  })
  fn.prototype = { description: (rType as TypeObjectLiteral).description }

  return fn
}
