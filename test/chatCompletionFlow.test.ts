import { handleToolUse } from '../src/ToolFunction'
import { ToolFunction } from '../src/ToolFunction'
import {
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'
import { Configuration, OpenAIApi } from 'openai'
import util from 'util'
import Debug from 'debug'
const debug = Debug('test')

describe('Perform a round trip test with the OpenAI API', () => {
  // Set up test function and types
  type TemperatureUnit = 'celsius' | 'fahrenheit'
  type WeatherInfo = {
    location: string
    temperature: number
    unit: TemperatureUnit
    forecast: string[]
    precipitationPct?: number
    pressureMmHg?: number
  }
  type WeatherOptions = {
    flags?: {
      includePrecipitation?: boolean
      includePressure?: boolean
    }
    highPriority?: boolean
  }
  const getCurrentWeather = function getCurrentWeather(
    location: string,
    unit: TemperatureUnit = 'fahrenheit',
    options?: WeatherOptions,
  ): WeatherInfo {
    const weatherInfo: WeatherInfo = {
      location: location,
      temperature: 82,
      unit: unit,
      precipitationPct: options?.flags?.includePrecipitation ? 25 : undefined,
      pressureMmHg: options?.flags?.includePressure ? 25 : undefined,
      forecast: ['sunny', 'cloudy'],
    }
    return weatherInfo
  }

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
  const openai = new OpenAIApi(configuration)

  test('it should work', async () => {
    // Build JSON schema description of the test function
    const getCurrentWeatherTool = ToolFunction.fromFunction(getCurrentWeather)
    const jsonSchemaGetCurrentWeather = getCurrentWeatherTool.schema
    const functionMap = {
      getCurrentWeather: getCurrentWeather,
    }
    debug(util.inspect(jsonSchemaGetCurrentWeather, { depth: 6 }))

    // Perform a round trip test with the OpenAI API
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: "What's the weather like in Boston? Say it like a weather reporter.",
      },
    ]
    const ccr: CreateChatCompletionRequest = {
      model: 'gpt-3.5-turbo-0613',
      messages,
      functions: [jsonSchemaGetCurrentWeather],
      stream: false,
      max_tokens: 1000,
    }
    debug(JSON.stringify(ccr, null, 2))

    const response = await openai.createChatCompletion(ccr)
    const message = response.data.choices[0].message
    if (message?.function_call) {
      debug(`function_call: ${JSON.stringify(message.function_call, null, 2)}`)
      const function_name = message.function_call.name
      const function_args = JSON.parse(message.function_call.arguments || '')
      const function_response = functionMap['getCurrentWeather'](
        function_args?.location,
        function_args?.unit,
        function_args?.options,
      )
      debug(`function_response: ${JSON.stringify(function_response, null, 2)}`)

      messages.push(message) // extend conversation with assistant's reply
      messages.push({
        role: ChatCompletionRequestMessageRoleEnum.Function,
        name: function_name,
        content: JSON.stringify(function_response),
      })
      debug(JSON.stringify(messages, null, 2))
      const second_response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo-0613',
        messages,
      })
      const second_message = second_response.data.choices[0].message
      debug(`second_response: ${JSON.stringify(second_message, null, 2)}`)
    }
    expect(1).toEqual(1)
  }, 30000)

  test('it should work using handleToolUse', async () => {
    // Build JSON schema description of the test function
    const getCurrentWeatherTool = ToolFunction.fromFunction(getCurrentWeather)
    const { registry, schema: jsonSchemaGetCurrentWeather } = getCurrentWeatherTool

    // Run a completion series
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: "What's the weather like in Boston? Say it like a weather reporter.",
      },
    ]
    const ccr: CreateChatCompletionRequest = {
      model: 'gpt-3.5-turbo-0613',
      messages,
      functions: [jsonSchemaGetCurrentWeather],
      stream: false,
      max_tokens: 1000,
    }
    const responseWithFnUse = await openai.createChatCompletion(ccr)
    debug(`API responseWithFnUse: ${JSON.stringify(responseWithFnUse.data, null, 2)}`)
    const responseData = await handleToolUse(openai, messages, responseWithFnUse.data, { registry })
    const result = responseData?.choices[0].message
    debug(`API final result: ${JSON.stringify(result, null, 2)}`)
  }, 30000)
})
