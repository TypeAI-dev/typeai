import { ReflectionFunction } from '@deepkit/type'
import { SchemaRegistry } from '../src/SchemaRegistry'
import { TypeSchemaResolver } from '../src/TypeSchemaResolver'
import { ToolFunction } from '../src/ToolFunction'
import Debug from 'debug'
const debug = Debug('test')

describe('Build JSON schema description of a TypeScript function', () => {
  // type Aircraft = {
  //   manufacturer: string
  //   type: 'fixed-wing' | 'rotary-wing'
  //   application: 'military' | 'civilian'
  // }

  test('it should generate a correct description', async () => {
    // https://json-schema.org/specification-links.html#2020-12

    /** @description about the temp */
    type TemperatureUnit = 'celsius' | 'fahrenheit'

    /** @description Info about the weather */
    type WeatherInfo = {
      location: string
      /** @description temp2 */
      temperature: number
      unit: TemperatureUnit
      forecast: string[]
      precipitationPct?: number
      pressureMmHg?: number
    }

    /** @description Options related to weather info */
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

    const registry = new SchemaRegistry()
    const rfn = ReflectionFunction.from(getCurrentWeather)
    const tsr = new TypeSchemaResolver(rfn.type, registry)
    tsr.resolve()
    const oaif = new ToolFunction(getCurrentWeather, registry)
    const doc = oaif.serialize()
    debug(JSON.stringify(doc, null, 2))

    expect(doc).toEqual({
      name: 'getCurrentWeather',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
          },
          unit: {
            $ref: '#/$defs/TemperatureUnit',
          },
          options: {
            $ref: '#/$defs/WeatherOptions',
          },
        },
        required: ['location', 'options'],
        $defs: {
          TemperatureUnit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
          },
          WeatherOptions: {
            type: 'object',
            properties: {
              flags: {
                type: 'object',
                properties: {
                  includePrecipitation: {
                    type: 'boolean',
                  },
                  includePressure: {
                    type: 'boolean',
                  },
                },
              },
              highPriority: {
                type: 'boolean',
              },
            },
            description: 'Options related to weather info',
          },
        },
      },
    })
  })
})
