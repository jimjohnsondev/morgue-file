// Maps thrown errors to HTTP responses in one place, so every route answers the same way.
import { AppError, httpStatusForCode } from '#core/errors.js';

import type { FastifyError, FastifyInstance } from 'fastify';

/**
 * Installs the handler that turns an AppError into its status and a short JSON body. The
 * message is written for the user, so pages such as setup can show it as it is.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(httpStatusForCode(error.code))
        .send({ error: error.code, message: error.message });
    }
    if (error.validation !== undefined) {
      return reply.code(400).send({ error: 'invalid-input' });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal' });
  });
}
