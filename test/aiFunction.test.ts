import { toAIFunction } from '../src/aiFunction'
import Debug from 'debug'
const debug = Debug('test')

describe('Build a magic AI function from a function stub', () => {
  test('it should work with primitive-typed single-parameter functions', async () => {
    /** @description Given `text`, returns a number between 1 (positive) and -1 (negative) indicating its sentiment score. */
    function sentimentSpec(text: string): number | void {}

    const sentiment = toAIFunction(sentimentSpec)

    const score1 = await sentiment('That was surprisingly easy!')
    debug(`sentiment: score:${score1} text:"That was surprisingly easy!"`)
    expect(score1).toBeGreaterThan(0.5)

    const score2 = await sentiment("I can't stand that movie.")
    debug(`sentiment: score:${score2} text:"I can't stand that movie."`)
    expect(score2).toBeLessThan(-0.5)
  }, 20000)

  test('it should work with object-typed single-parameter functions', async () => {
    /** @description Returns a list of `n` different fruits that all have the provided `color` */
    function listFruitSpec(input: { n: number; color: string }): string[] | void {}

    const listFruit = toAIFunction(listFruitSpec)

    const fruits = await listFruit({ n: 5, color: 'yellow' })
    const potentialYellowFruits = ['banana', 'lemon', 'pineapple', 'pear', 'apple', 'mango']
    const f = fruits as string[]
    debug(`listFruit: n:5 color:yellow results:${fruits}`)
    expect(f.length).toEqual(5)
    expect(f.every(f => potentialYellowFruits.includes(f))).toEqual(true)
  }, 20000)

  test('it should work with functions that return object-typed values', async () => {
    type WordSynonyms = {
      word: string
      synonyms: string[]
    }

    /** @description Returns a list of WordSynonym objects, one for each word passed in. */
    function generateSynonymsForWordsSpec(input: string[]): WordSynonyms[] | void {}

    const generateSynonymsForWords = toAIFunction(generateSynonymsForWordsSpec)

    const synonyms = await generateSynonymsForWords(['clear', 'yellow', 'tasty', 'changable'])
    debug(`synonyms: ${JSON.stringify(synonyms, null, 2)}`)
    expect(synonyms.length).toEqual(4)
  }, 20000)

  test('it should work with functions that return object-typed values', async () => {
    type Organism = {
      species: string
      genus: string
      family: string
      commonName: string
    }

    /** @description Returns an Organism object with the botanical classification corresponding to the input. */
    function getOrganismInfoSpec(input: string): Organism | void {}

    const getOrganismInfo = toAIFunction(getOrganismInfoSpec)

    const organism = await getOrganismInfo('the plant that produces espresso beans')
    debug(`organism: ${JSON.stringify(organism, null, 2)}`)
  }, 20000)
})
