export abstract class ControlledError extends Error {
  /** Do not log the stack trace. */
  isControlled = true
}

export class BadEntryError extends ControlledError {
  name = 'BadEntryError'
}
