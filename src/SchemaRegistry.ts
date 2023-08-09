import {
  isSameType,
  ReflectionKind,
  stringifyType,
  Type,
  TypeClass,
  TypeEnum,
  TypeObjectLiteral,
  TypeUnion,
  TypeFunction,
  ReflectionClass,
} from '@deepkit/type'
import camelCase from 'camelcase'
import { TypeAiSchemaNameConflict } from './errors'
import { Schema, getMetaDescription } from './types'
import util from 'util'
import Debug from 'debug'
const debug = Debug('typeai')

export interface SchemeEntry {
  name: string
  description?: string
  schema: Schema
  type: Type
}

export type RegistableSchema = TypeClass | TypeObjectLiteral | TypeEnum | TypeUnion | TypeFunction

export class SchemaRegistry {
  static _instance?: SchemaRegistry
  static getInstance(): SchemaRegistry {
    return this._instance || (this._instance = new SchemaRegistry())
  }
  static resetInstance() {
    this._instance = undefined
  }

  store: Map<string, SchemeEntry> = new Map()

  getSchemaKey(t: RegistableSchema): string {
    // Handle user preferred name
    const rootName = t.kind === ReflectionKind.class ? t.classType.name : t.typeName ?? ''

    const args = t.kind === ReflectionKind.class ? t.arguments ?? [] : t.typeArguments ?? []

    return camelCase([rootName, ...args.map(a => this.getTypeKey(a))], {
      pascalCase: true,
    })
  }

  getTypeKey(t: Type): string {
    if (
      t.kind === ReflectionKind.string ||
      t.kind === ReflectionKind.number ||
      t.kind === ReflectionKind.bigint ||
      t.kind === ReflectionKind.boolean ||
      t.kind === ReflectionKind.null ||
      t.kind === ReflectionKind.undefined
    ) {
      return stringifyType(t)
    } else if (
      t.kind === ReflectionKind.class ||
      t.kind === ReflectionKind.objectLiteral ||
      t.kind === ReflectionKind.enum ||
      t.kind === ReflectionKind.union ||
      t.kind === ReflectionKind.function
    ) {
      return this.getSchemaKey(t)
    } else if (t.kind === ReflectionKind.array) {
      return camelCase([this.getTypeKey(t.type), 'Array'], {
        pascalCase: false,
      })
    } else {
      // Complex types not named
      return ''
    }
  }

  registerSchema(name: string, type: Type, schema: Schema) {
    const currentEntry = this.store.get(name)

    let description = ''
    try {
      const refl = ReflectionClass.from(type)
      const metaDescription = getMetaDescription(type)
      description = refl?.description || metaDescription
      debug(`t: description: ${description}`)
      debug(`refl: ${util.inspect(refl, { depth: 6 })}`)
    } catch (e) {}

    if (currentEntry && !isSameType(type, currentEntry?.type)) {
      throw new TypeAiSchemaNameConflict(type, currentEntry.type, name)
    }

    this.store.set(name, { type, schema, name, description: description })
    schema.__registryKey = name
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  getFunction(name: string): Function | undefined {
    const currentEntry = this.store.get(name)
    if (!currentEntry) {
      throw new Error(`Schema ${name} not found`)
    }
    if (currentEntry.type.kind !== ReflectionKind.function) {
      throw new Error(`Schema ${name} is not a function`)
    }
    debug(`SchemaRegistry.getFunction: ${util.inspect(currentEntry)}`)

    return currentEntry.type.function
  }
}
