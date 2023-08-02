import { ReceiveType, resolveReceiveType, typeOf } from '@deepkit/type'
import { toAIFunctionViaRuntimeTypes } from '../src/aiFunction'
// import Debug from 'debug'
// const debug = Debug('typeai')

export function toAIModel<R>(r?: ReceiveType<R>): (input: string) => Promise<R> {
  const iType = typeOf<string>()
  const rType = resolveReceiveType(r)
  const fn = toAIFunctionViaRuntimeTypes<string, R>(iType, rType)
  return fn
}
