import { ToolFunction, handleToolUse } from '../src/ToolFunction'
import { SearchWeb } from '../src/tools/basic'
import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'

import Debug from 'debug'
const debug = Debug('test')

enum AircraftType {
  FixedWing = 'fixed-wing',
  RotaryWing = 'rotary-wing',
}
enum AircraftApplication {
  Military = 'military',
  Civilian = 'civilian',
}
type Aircraft = {
  manufacturer: string
  type: AircraftType
  application: AircraftApplication
}

let openai: OpenAIApi
describe('Tools', () => {
  beforeAll(() => {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })
    openai = new OpenAIApi(configuration)
  })

  test('ToolFunction.handleToolUse should handle multiple different function invocations by the LLM', async () => {
    let aircraftResponse: Aircraft

    /** Submits generated data regarding aircraft */
    const submitAircraftSpec = function submitAircraft(aircraft: Aircraft): string {
      aircraftResponse = aircraft
      debug(`aircraft: ${JSON.stringify(aircraft, null, 2)}`)
      return '{ "status": "ok" }'
    }

    // Build JSON schema description of the test function
    const submitAircraftTool = ToolFunction.from(submitAircraftSpec)

    // Run a completion series
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content:
          "You may use the provided functions to generate up-to-date responses. Your final answer to the user's request MUST be submitted via the submitAircraft function. Don't provide a narrative responseData.",
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Give me data on the F-35',
      },
    ]
    const request: CreateChatCompletionRequest = {
      model: 'gpt-4',
      messages,
      functions: [SearchWeb.schema, submitAircraftTool.schema],
      function_call: 'auto',
      stream: false,
      max_tokens: 1000,
    }
    let responseWithFnUse
    try {
      responseWithFnUse = await openai.createChatCompletion(request)
    } catch (e) {
      debug(e)
      debug(`responseWithFnUse: ${JSON.stringify(responseWithFnUse?.data, null, 2)}`)
      throw e
    }

    // Handle function use by the LLM
    const responseData = await handleToolUse(openai, messages, request, responseWithFnUse.data)
    const result = responseData?.choices[0].message

    expect(aircraftResponse!).toEqual({
      manufacturer: 'Lockheed Martin',
      type: AircraftType.FixedWing,
      application: AircraftApplication.Military,
    })
    debug(`responseData: ${JSON.stringify(responseData, null, 2)}`)
    debug(`Final result: ${JSON.stringify(result, null, 2)}`)
  }, 60000)
})
