import { ReceiveType, resolveReceiveType, typeOf } from '@deepkit/type'
import { toAIFunctionViaRuntimeTypes } from '../src/aiFunction'
// import Debug from 'debug'
// const debug = Debug('typeai')

/**
 * Returns a synthesized function that returns an instance of the model type provided as `R`.
 *
 * @example
 * ```
 * \/** @description Model representing data about a biological organism *\/
 * type Organisim = {
 *    species: string & Description<'The principal natural taxonomic unit'>
 *    genus: string & Description<'A principal taxonomic category above species and below family'>
 *    family: string & Description<'A principal taxonomic category above genus and below order'>
 *    commonName: string & Description<'The principal natural taxonomic unit'>
 * }
 * const organism = toAIModel<Organisim>()
 * ```
 *
 * @typeParam R - the type of the model to be returned
 *
 * @returns A function with AI-backed implementation, which returns an instance of the model type provided as `R`, corresponding to the provided `input`.
 */
export function toAIModel<R>(r?: ReceiveType<R>): (input: string) => Promise<R> {
  const iType = typeOf<string>()
  const rType = resolveReceiveType(r)
  const fn = toAIFunctionViaRuntimeTypes<string, R>(iType, rType)
  return fn
}
