const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const auth = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');

const router = express.Router();

// Admin login
// Utility function to validate password
const validatePassword = (password) => {
    const validations = [
        { regex: /^.{8,}$/, message: 'Password must be at least 8 characters' },
        { regex: /[a-z]/, message: 'Password must include lowercase letter' },
        { regex: /[A-Z]/, message: 'Password must include uppercase letter' },
        { regex: /\d/, message: 'Password must include number' },
        { regex: /[@$!%*?&]/, message: 'Password must include special character' }
    ];

    for (const validation of validations) {
        if (!validation.regex.test(password)) {
            return { isValid: false, message: validation.message };
        }
    }

    // Check for repeated characters
    if (/^(.)\1+$/.test(password)) {
        return { isValid: false, message: 'Password cannot consist of the same character' };
    }

    return { isValid: true };
};

router.post('/admin/login', [
    body('email').custom((value) => {
        // Accept either email format or username (3+ characters, alphanumeric, can start with @)
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        const isUsername = /^[@]?[a-zA-Z0-9_]{3,}$/.test(value);
        
        if (!isEmail && !isUsername) {
            throw new Error('Must be a valid email or username (3+ alphanumeric characters, can start with @)');
        }
        return true;
    }),
    body('password').custom((value) => {
        // We'll just check minimum length at login since password should already be validated during creation
        if (!value || value.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }
        return true;
    })
], errorHandler.asyncHandler(async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, password, keepLoggedIn } = req.body;

        // Find admin by email or username
        const admin = await Admin.findByEmailOrUsername(email);
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked
        if (admin.isLocked) {
            return res.status(423).json({
                success: false,
                message: 'Account temporarily locked due to too many failed login attempts'
            });
        }

        // Check if admin is active
        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isValidPassword = await admin.comparePassword(password);
        if (!isValidPassword) {
            await admin.incLoginAttempts();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Reset login attempts and update last login
        await admin.resetLoginAttempts();

        // Determine token expiration based on keepLoggedIn preference
        let tokenExpiration = process.env.JWT_EXPIRES_IN || '1d';
        let expiresInSeconds = 86400; // Default 24 hours
        
        if (keepLoggedIn === true || keepLoggedIn === 'true') {
            tokenExpiration = '7d'; // 7 days for keep logged in
            expiresInSeconds = 7 * 24 * 60 * 60; // 7 days in seconds
        } else {
            // Parse the default expiration time
            const defaultExpiration = process.env.JWT_EXPIRES_IN || '1d';
            if (defaultExpiration.includes('d')) {
                const days = parseInt(defaultExpiration.replace('d', ''));
                expiresInSeconds = days * 24 * 60 * 60;
            } else if (defaultExpiration.includes('h')) {
                const hours = parseInt(defaultExpiration.replace('h', ''));
                expiresInSeconds = hours * 60 * 60;
            } else {
                expiresInSeconds = parseInt(defaultExpiration) || 86400;
            }
        }

        // Generate access token
        const accessToken = jwt.sign(
            { 
                id: admin._id, 
                email: admin.email, 
                role: admin.role,
                permissions: admin.permissions
            },
            process.env.JWT_SECRET,
            { 
                expiresIn: tokenExpiration,
                algorithm: 'HS256',
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE
            }
        );

        // Generate refresh token
        const refreshToken = jwt.sign(
            { id: admin._id },
            process.env.JWT_SECRET,
            { 
                expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
                algorithm: 'HS256',
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE
            }
        );

        // Update last login time
        admin.lastLogin = new Date();
        await admin.save();

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                expiresIn: expiresInSeconds,
                admin: {
                    id: admin._id,
                    username: admin.username,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                    permissions: admin.permissions,
                    lastLogin: admin.lastLogin
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}));

// Verify token and get current user
router.get('/admin/me', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const admin = await Admin.findById(req.user.id).select('-password');
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            data: {
                admin: {
                    id: admin._id,
                    username: admin.username,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                    permissions: admin.permissions,
                    lastLogin: admin.lastLogin,
                    isActive: admin.isActive
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}));

// Admin logout (client-side token removal, server can track if needed)
router.post('/admin/logout', auth(), (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful'
    });
});

// Change admin password
router.post('/admin/change-password', auth(), [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])/).withMessage('Password must include lowercase letter')
        .matches(/^(?=.*[A-Z])/).withMessage('Password must include uppercase letter')
        .matches(/^(?=.*\d)/).withMessage('Password must include number')
        .matches(/^(?=.*[@$!%*?&])/).withMessage('Password must include special character')
        .not().matches(/^(.)\1+$/).withMessage('Password cannot consist of the same character')
        .trim()
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;

        // Find admin
        const admin = await Admin.findById(req.user.id);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Verify current password
        const isValidPassword = await admin.comparePassword(currentPassword);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        admin.password = newPassword;
        admin.loginAttempts = 0; // Reset login attempts
        admin.lockUntil = undefined; // Remove any lock
        await admin.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}));

// Refresh token endpoint
router.post('/admin/refresh-token', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { refreshToken, keepLoggedIn } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE
        });

        // Get admin details
        const admin = await Admin.findById(payload.id).select('-password');
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Determine token expiration based on keepLoggedIn preference
        let tokenExpiration = process.env.JWT_EXPIRES_IN || '1d';
        let expiresInSeconds = 86400; // Default 24 hours
        
        if (keepLoggedIn === true || keepLoggedIn === 'true') {
            tokenExpiration = '7d'; // 7 days for keep logged in
            expiresInSeconds = 7 * 24 * 60 * 60; // 7 days in seconds
        } else {
            // Parse the default expiration time
            const defaultExpiration = process.env.JWT_EXPIRES_IN || '1d';
            if (defaultExpiration.includes('d')) {
                const days = parseInt(defaultExpiration.replace('d', ''));
                expiresInSeconds = days * 24 * 60 * 60;
            } else if (defaultExpiration.includes('h')) {
                const hours = parseInt(defaultExpiration.replace('h', ''));
                expiresInSeconds = hours * 60 * 60;
            } else {
                expiresInSeconds = parseInt(defaultExpiration) || 86400;
            }
        }

        // Generate new access token
        const accessToken = jwt.sign(
            { 
                id: admin._id, 
                email: admin.email, 
                role: admin.role,
                permissions: admin.permissions
            },
            process.env.JWT_SECRET,
            { 
                expiresIn: tokenExpiration,
                algorithm: 'HS256',
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE
            }
        );

        res.json({
            success: true,
            data: {
                accessToken,
                expiresIn: expiresInSeconds
            }
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
}));

module.exports = router;