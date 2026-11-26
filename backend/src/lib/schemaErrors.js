import { STATUS_CODES } from 'node:http';

// The frontend shows body.error, so a validation failure must not answer with
// Fastify's default { error: 'Bad Request' }.
function describe(error) {
  return (error.validation ?? [])
    .map((issue) => {
      const field = issue.instancePath
        ? issue.instancePath.slice(1)
        : issue.params?.missingProperty ?? '';
      return field ? `${field} ${issue.message}` : issue.message;
    })
    .join('; ');
}

export function installSchemaErrors(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: `Invalid request: ${describe(error)}` });
    }

    const statusCode = error.statusCode ?? 500;
    // Fastify's default handler logs 5xx; keep that when replacing it.
    if (statusCode >= 500) request.log.error(error);

    return reply.code(statusCode).send({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: error.message,
    });
  });
}
