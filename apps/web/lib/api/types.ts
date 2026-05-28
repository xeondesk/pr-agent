export interface ApiRequest<T = unknown> {
  body: T;
  userId: string;
  userRole: 'user' | 'admin';
  requestId: string;
  token: string;
}

export interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
  requestId?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  status: 'error';
  error: ApiErrorDetail;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type ApiHandler<TReq> = (
  req: ApiRequest<TReq>
) => Promise<Response> | Response;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
