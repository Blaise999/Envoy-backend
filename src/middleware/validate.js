// src/middleware/validate.js
// Generic body/query/params validator using Joi schemas
export const validate =
  (schema, where = "body") =>
  (req, res, next) => {
    try {
      const target = where === "query" ? req.query : where === "params" ? req.params : req.body;
      const { error, value } = schema.validate(target, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        return res.status(400).json({
          message: "Validation failed",
          details: error.details.map((d) => ({ message: d.message, path: d.path })),
        });
      }
      if (where === "query") req.query = value;
      else if (where === "params") req.params = value;
      else req.body = value;
      next();
    } catch (err) {
      return res.status(500).json({ message: "Validator error" });
    }
  };

// Helpers for readability
export const validateBody = (schema) => validate(schema, "body");
export const validateQuery = (schema) => validate(schema, "query");
export const validateParams = (schema) => validate(schema, "params");
