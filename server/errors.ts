/**
 * Application error with a stable machine-readable code that the
 * frontend translates (see src/i18n/*.json -> "errors.<code>").
 */
export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
