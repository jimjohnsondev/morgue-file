// The one error type the app throws on purpose. Routes map its code to an HTTP status.

/** Every reason the app can refuse or fail a request on purpose. */
export type AppErrorCode =
  | 'forbidden-host'
  | 'forbidden-origin'
  | 'forbidden-cross-site'
  | 'missing-token'
  | 'not-found'
  | 'invalid-input';

/**
 * An expected failure with a stable code, so callers can react to the code
 * instead of parsing a message.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const statusByCode: Readonly<Record<AppErrorCode, number>> = {
  'forbidden-host': 403,
  'forbidden-origin': 403,
  'forbidden-cross-site': 403,
  'missing-token': 403,
  'not-found': 404,
  'invalid-input': 400,
};

/** Returns the HTTP status for an error code, kept in one place so routes agree. */
export function httpStatusForCode(code: AppErrorCode): number {
  return statusByCode[code];
}
