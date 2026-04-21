export class UseCaseError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "UseCaseError";
  }
}

export function notFoundError(message: string) {
  return new UseCaseError(message, "NOT_FOUND", 404);
}

export function badRequestError(message: string) {
  return new UseCaseError(message, "BAD_REQUEST", 400);
}
