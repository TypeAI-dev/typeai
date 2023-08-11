import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'
import { encode } from 'gpt-tokenizer'
import { TypeEnum, resolveRuntimeType, ReceiveType } from '@deepkit/type'
import Debug from 'debug'
const debug = Debug('typeai:aiClassifier')

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const prompt = (purpose: string, enumKeys: string[]) => {
  return `${purpose}
The user will provide context through text, you will use your expertise 
to choose the best option based on it. ${
    purpose !== '' ? 'The options relate to ' + purpose + '.' : ''
  }
The options are:
  ${enumKeys.map((k, i) => `${i}. ${k}`).join(', ')}
`
}

const _infer = async (purpose: string, tStrings: string[], text: string): Promise<string> => {
  // Run a completion series
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: prompt(purpose, tStrings),
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: text,
    },
  ]
  const logit_bias = Object.fromEntries(
    [...Array(tStrings.length).keys()].map(k => [encode(String(k)), 100]),
  )
  const request: CreateChatCompletionRequest = {
    model: 'gpt-3.5-turbo',
    messages,
    logit_bias,
    stream: false,
    temperature: 0,
    max_tokens: 1,
  }
  debug(`toAIClassifier CreateChatCompletionRequest: ${JSON.stringify(request, null, 2)}`)

  const response = await openai.createChatCompletion(request)
  debug(`toAIClassifier CreateChatCompletionResponse: ${JSON.stringify(response.data, null, 2)}`)

  const index = Number(response.data.choices[0].message?.content)
  return tStrings[index]
}

export function toAIClassifier<T>(
  purposeOverride?: string,
  p?: ReceiveType<T>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
): <MagicAIClassifierFunction>(text: string, purposeOverride?: string) => Promise<T> {
  const enumType = resolveRuntimeType(p, []) as TypeEnum
  type Tstring = keyof T

  const tKeys = Object.keys(enumType.enum as object) as Tstring[]
  const tStrings = tKeys as string[]
  debug(`toAIClassifier: enum keys: ${JSON.stringify(tStrings, null, 2)}`)
  debug(`toAIClassifier: description: ${JSON.stringify(enumType.description, null, 2)}`)

  type MagicAIClassifierFunction = {
    (text: string): Promise<T>
    description: string
  }

  const fn = <MagicAIClassifierFunction>(async (text: string): Promise<T> => {
    const purpose = purposeOverride || enumType.description || ''
    debug(
      `MagicAIClassifierFunction "${enumType.typeName}": purpose: ${JSON.stringify(
        purpose,
        null,
        2,
      )}`,
    )
    const key = await _infer(purpose, tStrings, text)
    const res: T = enumType.enum[key] as T
    return res
  })
  fn.prototype = { description: enumType.description, name: enumType.typeName }
  return fn
}
