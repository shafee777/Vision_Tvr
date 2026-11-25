/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — ZOD VALIDATION MIDDLEWARE
 * Intercepts request payloads and rejects malformed inputs before handlers
 * ═════════════════════════════════════════════════════════════════════
 */

/**
 * Validate request body against a Zod schema
 * @param {import('zod').ZodSchema} schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formattedErrors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        error_code: 'VALIDATION_ERROR',
        message: formattedErrors[0]?.message || 'Invalid request payload.',
        errors: formattedErrors
      });
    }

    // Replace req.body with the sanitized & parsed output
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody
};
