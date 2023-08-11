import { DeepKitTypeError, DeepKitTypeErrors, LiteralSupported, TypeNotSupported } from './errors'
import { AnySchema, Schema, getMetaDescription } from './types'
import * as util from 'util'

import {
  reflect,
  ReflectionKind,
  Type,
  TypeClass,
  TypeEnum,
  TypeFunction,
  TypeLiteral,
  TypeObjectLiteral,
  TypeParameter,
} from '@deepkit/type'
import { getParentClass } from '@deepkit/core'
import { SchemaRegistry } from './SchemaRegistry'
import Debug from 'debug'
const debug = Debug('typeai')

// See DeepKit type reflection
// https://github.com/deepkit/deepkit-framework/blob/master/packages/type/src/reflection/reflection.ts
export class TypeSchemaResolver {
  result: Schema = { ...AnySchema }
  errors: DeepKitTypeError[] = []

  constructor(
    public t: Type,
    public schemaRegisty: SchemaRegistry,
    public options?: { overrideName?: string },
  ) {}

  resolveBasic() {
    debug(`*** resolveBasic: ${this.t.kind}`)
    const metaDescription = getMetaDescription(this.t)
    switch (this.t.kind) {
      case ReflectionKind.never:
        this.result.not = AnySchema
        return
      case ReflectionKind.any:
      case ReflectionKind.unknown:
      case ReflectionKind.void:
        this.result = AnySchema
        this.result.description = metaDescription || undefined
        return
      case ReflectionKind.object:
        this.result.type = 'object'
        return
      case ReflectionKind.string:
        this.result.type = 'string'
        this.result.description = metaDescription || undefined
        return
      case ReflectionKind.number:
        this.result.type = 'number'
        this.result.description = metaDescription || undefined
        return
      case ReflectionKind.boolean:
        this.result.type = 'boolean'
        this.result.description = metaDescription || undefined
        return
      case ReflectionKind.bigint:
        this.result.type = 'number'
        this.result.description = metaDescription || undefined
        return
      case ReflectionKind.null:
        this.result.type = 'null'
        return
      case ReflectionKind.undefined:
        this.result.__isUndefined = true
        return
      case ReflectionKind.literal: {
        const type = mapSimpleLiteralToType(this.t.literal)
        if (type) {
          this.result.type = type
          this.result.enum = [this.t.literal as any]
          this.result.description = metaDescription || undefined
        } else {
          this.errors.push(new LiteralSupported(typeof this.t.literal))
        }
        return
      }
      case ReflectionKind.templateLiteral:
        this.result.type = 'string'
        this.errors.push(
          new TypeNotSupported(this.t, 'Literal is treated as string for simplicity'),
        )
        return
      case ReflectionKind.class:
      case ReflectionKind.objectLiteral:
        this.resolveClassOrObjectLiteral()
        return
      case ReflectionKind.array: {
        this.result.type = 'array'
        const itemsResult = resolveTypeSchema(this.t.type, this.schemaRegisty)

        this.result.items = itemsResult.result
        this.result.description = metaDescription || undefined
        this.errors.push(...itemsResult.errors)
        return
      }
      case ReflectionKind.enum:
        this.resolveEnum()
        return
      case ReflectionKind.union:
        this.resolveUnion()
        return
      case ReflectionKind.function:
        this.resolveFunction()
        return

      default:
        this.errors.push(new TypeNotSupported(this.t, `kind: ${this.t.kind}`))
        return
    }
  }

  resolveFunction() {
    if (this.t.kind !== ReflectionKind.function) return
    this.result.type = 'function'
    this.result.description = this.t.description || undefined

    const typeFunction: TypeFunction | undefined = this.t
    const parameters: TypeParameter[] = typeFunction.parameters ?? []
    const required: string[] = []

    this.result.properties = {}

    for (const parameter of parameters) {
      if (parameter.kind !== ReflectionKind.parameter) {
        throw new Error(`Expected ReflectionKind.parameter, got ${parameter.kind}`)
      }
      const wrappedType = parameter.type
      const typeResolver = resolveTypeSchema(wrappedType, this.schemaRegisty)
      if (!parameter.default && !required.includes(String(parameter.name))) {
        required.push(String(parameter.name))
      }
      this.result.properties[String(parameter.name)] = typeResolver.result
      this.errors.push(...typeResolver.errors)
    }
    if (required.length) {
      this.result.required = required
    }

    // const registryKey = this.schemaRegisty.getSchemaKey(this.t)
    let registryKey: string = String(typeFunction.name)
    if (this.options?.overrideName) {
      registryKey = this.options.overrideName
    }
    debug(`*** resolveFunction: registryKey: ${registryKey}`)

    if (registryKey) {
      this.schemaRegisty.registerSchema(registryKey, this.t, this.result)
    }
  }

  resolveClassOrObjectLiteral() {
    if (this.t.kind !== ReflectionKind.class && this.t.kind !== ReflectionKind.objectLiteral) {
      return
    }

    const registryKey = this.schemaRegisty.getSchemaKey(this.t)
    if (this.schemaRegisty.store.has(registryKey)) {
      return
    } else if (registryKey) {
      this.schemaRegisty.registerSchema(registryKey, this.t, this.result)
    }

    this.result.type = 'object'
    this.result.description = this.t.description || undefined

    let typeClass: TypeClass | TypeObjectLiteral | undefined = this.t
    this.result.properties = {}

    const typeClasses: (TypeClass | TypeObjectLiteral | undefined)[] = [this.t]

    const required: string[] = []

    if (this.t.kind === ReflectionKind.class) {
      // Build a list of inheritance, from root to current class.
      for (;;) {
        const parentClass = getParentClass((typeClass as TypeClass).classType)
        if (parentClass) {
          typeClass = reflect(parentClass) as any
          typeClasses.unshift(typeClass)
        } else {
          break
        }
      }
    }

    // Follow the order to override properties.
    for (const typeClass of typeClasses) {
      for (const typeItem of typeClass!.types) {
        if (
          typeItem.kind === ReflectionKind.property ||
          typeItem.kind === ReflectionKind.propertySignature
        ) {
          const typeResolver = resolveTypeSchema(typeItem.type, this.schemaRegisty)

          if (!typeItem.optional && !required.includes(String(typeItem.name))) {
            required.push(String(typeItem.name))
          }

          this.result.properties[String(typeItem.name)] = typeResolver.result
          this.errors.push(...typeResolver.errors)
        }
      }
    }

    if (required.length) {
      this.result.required = required
    }

    if (registryKey) {
      this.schemaRegisty.registerSchema(registryKey, this.t, this.result)
    }
  }

  resolveEnum() {
    if (this.t.kind !== ReflectionKind.enum) {
      return
    }

    const registryKey = this.schemaRegisty.getSchemaKey(this.t)
    if (registryKey && this.schemaRegisty.store.has(registryKey)) {
      return
    } else {
      this.schemaRegisty.registerSchema(registryKey, this.t, this.result)
    }

    const types = new Set<string>()

    for (const value of this.t.values) {
      const currentType = mapSimpleLiteralToType(value)

      if (currentType === undefined) {
        this.errors.push(new TypeNotSupported(this.t, `Enum with unsupported members. `))
        continue
      }

      types.add(currentType)
    }

    this.result.type = types.size > 1 ? undefined : [...types.values()][0]
    this.result.description = this.t.description || undefined
    this.result.enum = this.t.values as any

    if (registryKey) {
      this.schemaRegisty.registerSchema(registryKey, this.t, this.result)
    }
  }

  resolveUnion() {
    if (this.t.kind !== ReflectionKind.union) {
      return
    }

    // Find out whether it is a union of literals. If so, treat it as an enum
    if (
      this.t.types.every(
        (t): t is TypeLiteral =>
          t.kind === ReflectionKind.literal &&
          ['string', 'number'].includes(mapSimpleLiteralToType(t.literal) as any),
      )
    ) {
      const enumType: TypeEnum = {
        ...this.t,
        kind: ReflectionKind.enum,
        // TODO: TypeKit needs support added for description on TypeUnion
        // description: this.t.description || undefined,
        enum: Object.fromEntries(this.t.types.map(t => [t.literal, t.literal as any])),
        values: this.t.types.map(t => t.literal as any),
        indexType: this.t,
      }

      const { result, errors } = resolveTypeSchema(enumType, this.schemaRegisty)
      this.result = result
      this.errors.push(...errors)
    } else if (
      this.t.types.length === 2 &&
      this.t.types.some(t => t.kind === ReflectionKind.void)
    ) {
      // We want to make it easier to write function stubs for wrapping, so we handle wrapping functions
      // with return types of the form "R | void" by removing the void from the return type.

      // Lift sole non-void type, replace union
      const nonVoidType = this.t.types.find(t => t.kind !== ReflectionKind.void)
      if (nonVoidType) {
        const { result, errors } = resolveTypeSchema(nonVoidType, this.schemaRegisty)
        this.result = result
        this.errors.push(...errors)
      }
    } else {
      this.result.type = undefined
      this.result.oneOf = []

      for (const t of this.t.types) {
        const { result, errors } = resolveTypeSchema(t, this.schemaRegisty)
        this.result.oneOf?.push(result)
        this.errors.push(...errors)
      }
    }
  }

  resolve() {
    this.resolveBasic()

    return this
  }
}

export const mapSimpleLiteralToType = (literal: any) => {
  if (typeof literal === 'string') {
    return 'string'
  } else if (typeof literal === 'bigint') {
    return 'integer'
  } else if (typeof literal === 'number') {
    return 'number'
  } else if (typeof literal === 'boolean') {
    return 'boolean'
  } else {
    return
  }
}

export const unwrapTypeSchema = (t: Type, r: SchemaRegistry = new SchemaRegistry()) => {
  const resolver = new TypeSchemaResolver(t, r).resolve()

  if (resolver.errors.length === 0) {
    return resolver.result
  } else {
    throw new DeepKitTypeErrors(resolver.errors, 'Errors with input type. ')
  }
}

export const resolveTypeSchema = (t: Type, r: SchemaRegistry = new SchemaRegistry()) => {
  let tsr
  try {
    tsr = new TypeSchemaResolver(t, r).resolve()
  } catch (e) {
    console.error(`Error: ${util.inspect(e, { depth: 3 })}`)
    console.error(`SchemaRegistry.store: ${util.inspect(r.store, { depth: 3 })}`)
    throw e
  }
  return tsr
}
