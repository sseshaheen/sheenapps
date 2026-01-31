/**
 * Typed Route Wrapper - Contract-First Route Definition
 *
 * This utility enforces contract conformance at runtime by validating
 * both request and response against Zod schemas from @sheenapps/api-contracts.
 *
 * Benefits:
 * - Request validation with clear error messages
 * - Response validation catches bugs TypeScript misses (DB mappings, conditionals)
 * - Types flow automatically from schemas
 * - Consistent error response format
 *
 * Usage:
 * ```typescript
 * import { RequestCodeSchema, RequestCodeResponseSchema } from '@sheenapps/api-contracts';
 * import { defineRoute, RouteContract } from '../utils/defineRoute';
 *
 * const contract: RouteContract = {
 *   request: RequestCodeSchema,
 *   response: RequestCodeResponseSchema,
 * };
 *
 * app.post('/v1/auth/request-code', defineRoute(contract, async (input, request, reply) => {
 *   // input is typed as z.infer<typeof RequestCodeSchema>
 *   // return must match z.infer<typeof RequestCodeResponseSchema>
 *   return { success: true, expiresIn: 300 };
 * }));
 * ```
 */

import { z, ZodError } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '@sheenapps/api-contracts';

/**
 * Route contract definition
 */
export interface RouteContract<
  TRequest extends z.ZodTypeAny = z.ZodTypeAny,
  TResponse extends z.ZodTypeAny = z.ZodTypeAny,
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** Request body schema */
  request?: TRequest;
  /** Response data schema (the 'data' field in { ok: true, data }) */
  response: TResponse;
  /** URL params schema (optional) */
  params?: TParams;
  /** Query string schema (optional) */
  query?: TQuery;
}

/**
 * Handler function type
 */
export type RouteHandler<
  TRequest extends z.ZodTypeAny,
  TResponse extends z.ZodTypeAny,
  TParams extends z.ZodTypeAny,
  TQuery extends z.ZodTypeAny,
> = (
  input: TRequest extends z.ZodTypeAny ? z.infer<TRequest> : undefined,
  context: {
    request: FastifyRequest;
    reply: FastifyReply;
    params: TParams extends z.ZodTypeAny ? z.infer<TParams> : Record<string, string>;
    query: TQuery extends z.ZodTypeAny ? z.infer<TQuery> : Record<string, string>;
  }
) => Promise<z.infer<TResponse>>;

/**
 * Format Zod validation errors into user-friendly messages
 */
function formatZodErrors(error: ZodError): string {
  // Zod 4.x uses 'issues' instead of 'errors'
  return error.issues
    .map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Define a typed route with contract validation
 *
 * @param contract - The route contract with request/response schemas
 * @param handler - The route handler function
 * @returns Fastify route handler
 */
export function defineRoute<
  TRequest extends z.ZodTypeAny,
  TResponse extends z.ZodTypeAny,
  TParams extends z.ZodTypeAny = z.ZodUndefined,
  TQuery extends z.ZodTypeAny = z.ZodUndefined,
>(
  contract: RouteContract<TRequest, TResponse, TParams, TQuery>,
  handler: RouteHandler<TRequest, TResponse, TParams, TQuery>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate URL params if schema provided
      let validatedParams: any = request.params;
      if (contract.params) {
        const paramsResult = contract.params.safeParse(request.params);
        if (!paramsResult.success) {
          const error: ApiError = {
            code: 'VALIDATION_ERROR',
            message: `Invalid URL parameters: ${formatZodErrors(paramsResult.error)}`,
            details: paramsResult.error.flatten(),
          };
          return reply.code(400).send({ ok: false, error });
        }
        validatedParams = paramsResult.data;
      }

      // Validate query string if schema provided
      let validatedQuery: any = request.query;
      if (contract.query) {
        const queryResult = contract.query.safeParse(request.query);
        if (!queryResult.success) {
          const error: ApiError = {
            code: 'VALIDATION_ERROR',
            message: `Invalid query parameters: ${formatZodErrors(queryResult.error)}`,
            details: queryResult.error.flatten(),
          };
          return reply.code(400).send({ ok: false, error });
        }
        validatedQuery = queryResult.data;
      }

      // Validate request body if schema provided
      let validatedInput: any = undefined;
      if (contract.request) {
        const bodyResult = contract.request.safeParse(request.body);
        if (!bodyResult.success) {
          const error: ApiError = {
            code: 'VALIDATION_ERROR',
            message: formatZodErrors(bodyResult.error),
            details: bodyResult.error.flatten(),
          };
          return reply.code(400).send({ ok: false, error });
        }
        validatedInput = bodyResult.data;
      }

      // Execute handler
      const result = await handler(validatedInput, {
        request,
        reply,
        params: validatedParams,
        query: validatedQuery,
      });

      // Validate response (catches bugs TypeScript misses)
      const responseResult = contract.response.safeParse(result);
      if (!responseResult.success) {
        // Log the error for debugging but don't expose details to client
        console.error('[defineRoute] Response validation failed:', {
          path: request.url,
          method: request.method,
          errors: responseResult.error.flatten(),
          result: JSON.stringify(result).slice(0, 500),
        });

        const error: ApiError = {
          code: 'INTERNAL_ERROR',
          message: 'Response validation failed',
        };
        return reply.code(500).send({ ok: false, error });
      }

      // Return successful response
      return reply.send({ ok: true, data: responseResult.data });

    } catch (err: any) {
      // Handle known error types
      if (err.statusCode && err.code) {
        // Custom error with status code
        const error: ApiError = {
          code: err.code,
          message: err.message || 'An error occurred',
        };
        return reply.code(err.statusCode).send({ ok: false, error });
      }

      // Log unexpected errors
      console.error('[defineRoute] Unexpected error:', {
        path: request.url,
        method: request.method,
        error: err.message,
        stack: err.stack,
      });

      const error: ApiError = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
      return reply.code(500).send({ ok: false, error });
    }
  };
}

/**
 * Create a typed error to throw from handlers
 */
export function routeError(
  statusCode: number,
  code: ApiError['code'],
  message: string
): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  throw err;
}

/**
 * Common error helpers
 */
export const RouteErrors = {
  notFound: (message = 'Resource not found') => routeError(404, 'NOT_FOUND', message),
  unauthorized: (message = 'Unauthorized') => routeError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Forbidden') => routeError(403, 'FORBIDDEN', message),
  badRequest: (message: string) => routeError(400, 'VALIDATION_ERROR', message),
  rateLimit: (message = 'Rate limit exceeded') => routeError(429, 'RATE_LIMIT', message),
  quotaExceeded: (message = 'Quota exceeded') => routeError(402, 'QUOTA_EXCEEDED', message),
  internal: (message = 'Internal error') => routeError(500, 'INTERNAL_ERROR', message),
};
