export class ServiceError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly retryable = false) {
    super(message);
  }
}

export function inputError(message: string, status = 400): ServiceError {
  return new ServiceError(message, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", false);
}

export function providerError(message: string, status = 502): ServiceError {
  return new ServiceError(message, status, status === 504 ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", true);
}
