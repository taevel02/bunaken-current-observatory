/** @typedef {{code: string, message_key: string, field_errors: Record<string, string[]>, retryable: boolean, request_id: string}} ApiError */

/** @returns {ApiError} */
export function errorEnvelope(code, messageKey, requestId, retryable = false) {
  return { code, message_key: messageKey, field_errors: {}, retryable, request_id: requestId };
}
