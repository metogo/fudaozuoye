"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceError = void 0;
exports.inputError = inputError;
exports.providerError = providerError;
class ServiceError extends Error {
    status;
    code;
    retryable;
    constructor(message, status, code, retryable = false) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}
exports.ServiceError = ServiceError;
function inputError(message, status = 400) {
    return new ServiceError(message, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", false);
}
function providerError(message, status = 502) {
    return new ServiceError(message, status, status === 504 ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", true);
}
