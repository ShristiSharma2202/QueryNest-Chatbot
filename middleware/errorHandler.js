// Error handling middleware
const errorHandler = {
    // Custom error class for application errors
    AppError: class AppError extends Error {
        constructor(message, statusCode = 500, validationErrors = null) {
            super(message);
            this.name = 'AppError';
            this.statusCode = statusCode;
            this.validationErrors = validationErrors;
        }
    },

    // Validation error class for form validation errors
    ValidationError: class ValidationError extends Error {
        constructor(errors) {
            super('Validation failed');
            this.name = 'ValidationError';
            this.statusCode = 400;
            this.validationErrors = errors;
        }
    },

    // Not found error class
    NotFoundError: class NotFoundError extends Error {
        constructor(message = 'Resource not found') {
            super(message);
            this.name = 'NotFoundError';
            this.statusCode = 404;
        }
    },

    // Conflict error class
    ConflictError: class ConflictError extends Error {
        constructor(message = 'Resource conflict') {
            super(message);
            this.name = 'ConflictError';
            this.statusCode = 409;
        }
    },

    // Forbidden error class
    ForbiddenError: class ForbiddenError extends Error {
        constructor(message = 'Access forbidden') {
            super(message);
            this.name = 'ForbiddenError';
            this.statusCode = 403;
        }
    },

    // Database error class
    DatabaseError: class DatabaseError extends Error {
        constructor(message = 'Database operation failed', originalError = null) {
            super(message);
            this.name = 'DatabaseError';
            this.statusCode = 500;
            this.originalError = originalError;
        }
    },

    // Error handler middleware
    handleError: (err, req, res, next) => {
        console.error('Error:', {
            name: err.name,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            validationErrors: err.validationErrors,
        });

        // Handle different types of errors
        if (err instanceof errorHandler.ValidationError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                validationErrors: err.validationErrors
            });
        }

        if (err instanceof errorHandler.AppError) {
            return res.status(err.statusCode).json({
                success: false,
                message: err.message,
                ...(err.validationErrors && { validationErrors: err.validationErrors })
            });
        }

        // Handle custom error types
        if (err instanceof errorHandler.NotFoundError) {
            return res.status(404).json({
                success: false,
                message: err.message
            });
        }

        if (err instanceof errorHandler.ConflictError) {
            return res.status(409).json({
                success: false,
                message: err.message
            });
        }

        if (err instanceof errorHandler.ForbiddenError) {
            return res.status(403).json({
                success: false,
                message: err.message
            });
        }

        if (err instanceof errorHandler.DatabaseError) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        // Handle mongoose validation errors
        if (err.name === 'ValidationError') {
            const validationErrors = Object.values(err.errors).map(error => ({
                field: error.path,
                message: error.message
            }));

            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                validationErrors
            });
        }

        // Handle duplicate key errors
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `${field} already exists`,
                validationErrors: [{
                    field,
                    message: `${field} must be unique`
                }]
            });
        }

        // Handle JSON parsing errors
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON',
                validationErrors: [{
                    field: 'body',
                    message: 'Invalid JSON format'
                }]
            });
        }

        // Handle other errors
        return res.status(err.statusCode || 500).json({
            success: false,
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    },

    // Error wrapper for async route handlers
    asyncHandler: (fn) => {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    },

    // Request validation middleware
    validateRequest: (schema) => {
        return async (req, res, next) => {
            try {
                if (schema.body) {
                    req.body = await schema.body.validate(req.body, { abortEarly: false });
                }
                if (schema.query) {
                    req.query = await schema.query.validate(req.query, { abortEarly: false });
                }
                if (schema.params) {
                    req.params = await schema.params.validate(req.params, { abortEarly: false });
                }
                next();
            } catch (error) {
                if (error.name === 'ValidationError') {
                    next(new errorHandler.ValidationError(error.errors));
                } else {
                    next(error);
                }
            }
        };
    }
};

module.exports = errorHandler;