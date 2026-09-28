export type ApiError = {
  code: string;
  message_key: string;
  field_errors: Record<string, string[]>;
  retryable: boolean;
  request_id: string;
};

export function errorEnvelope(code: string, messageKey: string, requestId: string, retryable?: boolean): ApiError;
