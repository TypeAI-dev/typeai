import { ReflectionFunction } from '@deepkit/type'
import { SchemaRegistry } from '../src/SchemaRegistry'
import { TypeSchemaResolver } from '../src/TypeSchemaResolver'
import { OpenAIFunction } from '../src/OpenAIFunction'
import { JSONSchemaOpenAIFunction } from './types'

type LLMToolFunctionInfo = {
  registry: SchemaRegistry
  llmFunctionDescription: OpenAIFunction
  schema: JSONSchemaOpenAIFunction
}
export const generateLLMFunction = function generateLLMFunction<R>(
  fn: (...args: any[]) => R,
): LLMToolFunctionInfo {
  const reflectFn = ReflectionFunction.from(fn)
  const registry = new SchemaRegistry()
  const resolver = new TypeSchemaResolver(reflectFn.type, registry)
  resolver.resolve()
  const oaif = new OpenAIFunction(fn, registry)
  const jsonSchema = oaif.serialize()
  return { registry, llmFunctionDescription: oaif, schema: jsonSchema }
}
