import { toAIModel } from '../src/aiModel'
import { Description } from '../src/types'
import Debug from 'debug'
const debug = Debug('test')

describe('Build a magic AI model from a function stub', () => {
  test('it should work', async () => {
    type Organisim = {
      species: string & Description<'The principal natural taxonomic unit'>
      genus: string & Description<'A principal taxonomic category above species and below family'>
      family: string & Description<'A principal taxonomic category above genus and below order'>
      commonName: string & Description<'The principal natural taxonomic unit'>
    }
    const organism = toAIModel<Organisim>()

    const organism1 = await organism('the plant that produces espresso beans')
    debug(`organism: ${JSON.stringify(organism1, null, 2)}`)
    expect(organism1).toEqual({
      species: 'Coffea arabica',
      genus: 'Coffea',
      family: 'Rubiaceae',
      commonName: 'Coffee',
    })
  })

  test('it should work', async () => {
    type Location = {
      city: string
      stateIso2: string
    }
    const location = toAIModel<Location>()

    const location1 = await location('The Big Apple')
    debug(`location: ${JSON.stringify(location1, null, 2)}`)
    expect(location1).toEqual({ city: 'New York', stateIso2: 'NY' })
  })
})
