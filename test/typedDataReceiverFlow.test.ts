import { handleToolUse } from '../src/ToolFunction'
import { ToolFunction } from '../src/ToolFunction'
import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'
import Debug from 'debug'
const debug = Debug('test')

// Set up test function and types
type CityData = {
  name: string
  region: string
  country: string
  lat: number
  lon: number
  population: number
}

let openai: OpenAIApi
describe('Perform a round trip test with the OpenAI API', () => {
  beforeAll(() => {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })
    openai = new OpenAIApi(configuration)
  })

  test('it should work using handleToolUse', async () => {
    let citiesDataResponse: CityData[] = []
    const submitLLMGeneratedData = function submitLLMGeneratedData(citiesData: CityData[]): string {
      debug(`citiesData: ${JSON.stringify(citiesData, null, 2)}`)
      citiesDataResponse = citiesData
      return '{ "status": "ok" }'
    }

    // Build JSON schema description of the test function
    const submitLLMGeneratedDataTool = ToolFunction.from(submitLLMGeneratedData)
    const { registry, schema: jsonSchemaSubmitLLMGeneratedData } = submitLLMGeneratedDataTool

    // Run a completion series
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          'Generate data for the 10 largest world cities and provide your results via the submitGeneratedData function. When you call submitGeneratedData, you must minify the JSON in the arguments, ie: no extra whitespace, and no newlines.',
      },
    ]
    const ccr: CreateChatCompletionRequest = {
      model: 'gpt-3.5-turbo-0613',
      messages,
      functions: [jsonSchemaSubmitLLMGeneratedData],
      function_call: { name: 'submitLLMGeneratedData' },
      stream: false,
      max_tokens: 1000,
    }
    const responseWithFnUse = await openai.createChatCompletion(ccr)

    // Handle function use by the LLM
    const responseData = await handleToolUse(openai, messages, responseWithFnUse.data, { registry })
    const result = responseData?.choices[0].message
    debug(`responseData: ${JSON.stringify(responseData, null, 2)}`)
    debug(`Final result: ${JSON.stringify(result, null, 2)}`)

    expect(citiesDataResponse.length).toEqual(10)
  }, 30000)
})
