import axios, { AxiosError } from 'axios'
import { JSDOM } from 'jsdom'
import { ToolFunction } from '../ToolFunction'
import { truncateByTokens } from '../utils'
import Debug from 'debug'
const debug = Debug('typeai')
const debugNet = Debug('typeai:net')

// https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/quickstarts/rest/nodejs#example-json-response
// https://learn.microsoft.com/en-us/bing/search-apis/bing-web-search/reference/response-objects
type BingWebSearchResponseAbridged = {
  _type: string
  webPages?: {
    totalEstimatedMatches: number
    value: [
      {
        name: string
        url: string
        snippet: string
      },
    ]
  }
}
type BingWebSearchErrorResponse = {
  _type: string
  errors: [
    {
      code: string
      message: string
      moreDetails: string
      parameter: string
      subCode: string
      value: string
    },
  ]
}

/** @description Provides relevant web search results to well-constructed natural language queries  */
async function searchWeb(query: string): Promise<BingWebSearchResponseAbridged> {
  debug(`searchWeb: ${query}`)
  const url =
    `https://api.bing.microsoft.com/v7.0/search?responseFilter=Webpages&count=3&q=` +
    encodeURIComponent(query)
  let result
  try {
    const response = await axios.get(url, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SUBSCRIPTION_KEY },
      responseType: 'json',
    })
    switch (response.data._type) {
      case 'SearchResponse':
        result = response.data as BingWebSearchResponseAbridged
        break
      case 'ErrorResponse':
        result = response.data as BingWebSearchErrorResponse
        break
      default:
        result = { _type: 'UnknownResponse' }
    }
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const error = e as AxiosError
      debug(`FetchUrl: error: ${JSON.stringify(error.stack)}`)
      result = { _type: 'AxiosErrorResponse' }
    }
    console.error(e)
    result = { _type: 'FailedToLoadURL' }
  }
  debugNet(`searchWeb: response: ${JSON.stringify(result, null, 2)}`)
  return result
}

/** @description Fetch a valid URL and return its contents */
async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await axios.get(url)
    const contentType = response.headers['content-type']

    let content
    if (contentType?.includes('application/json')) {
      content = JSON.parse(response.data)
    } else if (contentType?.includes('text/html')) {
      const dom = new JSDOM(response.data)
      content = dom.window.document.textContent
    } else if (contentType?.includes('text/plain')) {
      content = response.data
    }
    debugNet(`FetchUrl: content: ${JSON.stringify(content)}`)
    content = truncateByTokens(content, 2000)
    return content
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const error = e as AxiosError
      debug(`FetchUrl: error: ${JSON.stringify(error.stack)}`)
      return 'Failed to load URL: Connection timed out'
    }
    console.error(e)
    return 'Failed to load URL'
  }
}

export const SearchWeb = ToolFunction.from(searchWeb)
export const FetchUrl = ToolFunction.from(fetchUrl)
