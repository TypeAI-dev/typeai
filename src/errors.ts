import { stringifyType, Type } from '@deepkit/type'

export class TypeAiError extends Error {}

export class DeepKitTypeError extends TypeAiError {}

export class TypeNotSupported extends DeepKitTypeError {
  constructor(
    public type: Type,
    public reason: string = '',
  ) {
    super(`${stringifyType(type)} is not supported. ${reason}`)
  }
}

export class LiteralSupported extends DeepKitTypeError {
  constructor(public typeName: string) {
    super(`${typeName} is not supported. `)
  }
}

export class DeepKitTypeErrors extends TypeAiError {
  constructor(
    public errors: DeepKitTypeError[],
    message: string,
  ) {
    super(message)
  }
}

export class TypeAiSchemaNameConflict extends TypeAiError {
  constructor(
    public newType: Type,
    public oldType: Type,
    public name: string,
  ) {
    super(
      `${stringifyType(newType)} and ${stringifyType(
        oldType,
      )} are not the same, but their schema are both named as ${JSON.stringify(name)}. ` +
        `Try to fix the naming of related types, or rename them using 'YourClass & Name<ClassName>'`,
    )
  }
}
