import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'
import {
  ReceiveType,
  ReflectionFunction,
  stringifyType,
  TypeObjectLiteral,
  Type,
} from '@deepkit/type'
import { serialize, getSchema } from './utils'
import { SchemaRegistry, SchemeEntry } from '../src/SchemaRegistry'
import { TypeSchemaResolver } from '../src/TypeSchemaResolver'
import { JSONSchema, JSONSchemaOpenAIFunction } from './types'
import { ToolFunction } from './ToolFunction'
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
  const ccr: CreateChatCompletionRequest = {
    model: options?.model || 'gpt-3.5-turbo',
    messages,
    functions: [functionJSONSchema],
    function_call: { name: 'submitLLMGeneratedData' },
    stream: false,
    max_tokens: 1000,
    temperature: 0,
  }
  debugNet(`MagicAIFunction CreateChatCompletionRequest: ${JSON.stringify(ccr, null, 2)}`)

  const response = await openai.createChatCompletion(ccr)
  debugNet(
    `MagicAIFunction CreateChatCompletionResponse: ${JSON.stringify(response.data, null, 2)}`,
  )

  const argsJSON = response.data.choices[0].message?.function_call?.arguments || '{}'
  const args = JSON.parse(argsJSON)
  return args?.result as R
}

export type ToAIFunctionOptions = {
  model?: string
}
export type AIFunctionOptions = {
  model?: string
  description?: string
}
export function toAIFunction<T, R>(
  f: (input: T) => R,
  toAIFunctionOptions?: ToAIFunctionOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): <MagicAIFunction>(input: T, aiFunctionOptions?: AIFunctionOptions) => Promise<Exclude<R, void>> {
  type RMinusVoid = Exclude<R, void>
  const wrappedFn = ReflectionFunction.from(f)
  debug(`toAIFunction: wrappedFn: ${util.inspect(wrappedFn, { depth: 8 })}`)
  debug(`stringifyType: wrappedFn: ${stringifyType(wrappedFn.type)}`)

  const fnSignature = `${wrappedFn.name.replace('Spec', '')}${stringifyType(wrappedFn.type).replace(
    '| void',
    '',
  )}`

  // Function provided to LLM to submit answer
  const submitLLMGeneratedData = function submitLLMGeneratedData(result: R): string {
    debugNet(`LLM result: ${JSON.stringify(result, null, 2)}`)
    return '{ "status": "ok" }'
  }

  // Build JSON schema description of wrapped function
  const wrappedFnTool = ToolFunction.fromFunction(f)
  const wrappedFnJSONSchema = wrappedFnTool.schema
  const inputJSONSchema = wrappedFnJSONSchema.parameters?.properties

  // Build JSON schema description of submitLLMGeneratedData
  const submitLLMGeneratedDataTool = ToolFunction.fromFunction(submitLLMGeneratedData)
  const submitGeneratedDataSchema = submitLLMGeneratedDataTool.schema

  // Magic function
  type MagicAIFunction = {
    (input: T, aiFunctionOptions?: AIFunctionOptions): Promise<RMinusVoid>
    description: string
  }
  const fn = <MagicAIFunction>(async (
    input: T,
    aiFunctionOptions?: AIFunctionOptions,
  ): Promise<RMinusVoid> => {
    const options: AIFunctionOptions = {
      model: aiFunctionOptions?.model || toAIFunctionOptions?.model,
      description: aiFunctionOptions?.description || wrappedFn.description,
    }
    const purpose = aiFunctionOptions?.description || wrappedFn.description
    const res = await _infer(
      purpose,
      fnSignature,
      submitGeneratedDataSchema,
      inputJSONSchema,
      input,
      options,
    )
    return Promise.resolve(res as RMinusVoid)
  })
  fn.prototype = { description: wrappedFn.description }

  return fn
}

export function toAIFunctionViaRuntimeTypes<T, R>(
  iType: Type,
  rType: Type,
  toAIFunctionOptions?: ToAIFunctionOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): <MagicAIFunction>(input: T, aiFunctionOptions?: AIFunctionOptions) => Promise<Exclude<R, void>> {
  type RMinusVoid = Exclude<R, void>

  const signature = 'toLocation(input: string) => Location'
  const inputJSONSchema = {
    input: {
      type: 'string',
    } as JSONSchema,
  }
  debug(`rType: ${util.inspect(rType, { depth: 8 })}`)

  // Build JSON schema description of submitLLMGeneratedData
  const registry = new SchemaRegistry()
  const resolver = new TypeSchemaResolver(rType, registry)
  resolver.resolve()
  const rKey = registry.getTypeKey(rType)
  const rSchemeEntry = registry.store.get(rKey) as SchemeEntry
  const schema = getSchema(registry, rSchemeEntry)
  const rSchema = serialize(schema)
  debug(`registry.store: ${util.inspect(registry.store, { depth: 8 })}`)

  const submitGeneratedDataSchema: JSONSchemaOpenAIFunction = {
    name: 'submitLLMGeneratedData',
    parameters: {
      type: 'object',
      properties: {
        result: rSchema,
      },
      required: ['result'],
    },
  }

  // Magic function
  type MagicAIFunction = {
    (input: T, aiFunctionOptions?: AIFunctionOptions): Promise<RMinusVoid>
    description: string
  }
  const fn = <MagicAIFunction>(async (
    input: T,
    aiFunctionOptions?: AIFunctionOptions,
  ): Promise<RMinusVoid> => {
    const options: AIFunctionOptions = {
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
      options,
    )
    return Promise.resolve(res as RMinusVoid)
  })
  fn.prototype = { description: (rType as TypeObjectLiteral).description }

  return fn
}
