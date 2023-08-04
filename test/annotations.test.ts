import { TypeObjectLiteral, TypePropertySignature, typeOf } from '@deepkit/type'
import { Description, getMetaDescription } from '../src/types'
import { generateLLMFunction } from '../src/generateLLMFunction'
import * as util from 'util'
import Debug from 'debug'
const debug = Debug('test')

describe('Descriptions via annotation types', () => {
  test('exit on fields', async () => {
    type Organism = {
      species: string & Description<'test'>
      genus: string
      family: string
      commonName: string
    }

    const a = typeOf<Organism>()
    const tSpecies = ((a as TypeObjectLiteral).types?.[0] as TypePropertySignature)
      .type as TypePropertySignature
    debug(`tSpecies: ${util.inspect(tSpecies, { depth: 6 })}`)
    const md = getMetaDescription(tSpecies)

    expect(md).toEqual('test')
  }, 20000)

  test('exist in the serialized JSON schema', async () => {
    type Organism = {
      species: string & Description<'desc1'>
      genus: string & Description<'desc2'>
      family: string & Description<'desc3'>
      commonName: string & Description<'desc4'>
    }
    /** @description Accepts an Organism object with the botanical classification corresponding to the input. */
    function inferredOrganismSpec(organism: Organism): string {
      return 'OK'
    }

    const { schema: jsonSchema } = generateLLMFunction(inferredOrganismSpec)
    const organismProps = jsonSchema.parameters?.$defs?.Organism?.properties
    expect(organismProps?.species?.description).toEqual('desc1')
    expect(organismProps?.genus?.description).toEqual('desc2')
    expect(organismProps?.family?.description).toEqual('desc3')
    expect(organismProps?.commonName?.description).toEqual('desc4')
  }, 20000)
})
