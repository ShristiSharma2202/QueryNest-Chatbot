const Admin = require('../models/Admin');

// Middleware to validate admin roles and permissions
const roleValidation = {
    // Only super admins can access
    isSuperAdmin: async (req, res, next) => {
        try {
            const admin = await Admin.findById(req.user.id);
            if (!admin || !admin.isSuperAdmin() || admin.isActive === false) {
                return res.status(403).json({
                    success: false,
                    message: 'Super admin access required'
                });
            }
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to verify admin role'
            });
        }
    },

    // Can manage admins (super admin or has specific permission)
    canManageAdmins: async (req, res, next) => {
        try {
            const admin = await Admin.findById(req.user.id);
            if (!admin || !admin.canManageAdmins() || admin.isActive === false) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to manage admins'
                });
            }
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to verify admin permissions'
            });
        }
    },

    // Check for specific permission
    hasPermission: (permission) => {
        return async (req, res, next) => {
            try {
                const admin = await Admin.findById(req.user.id);
                if (!admin || admin.isActive === false || (!admin.isSuperAdmin() && !admin.permissions[permission])) {
                    return res.status(403).json({
                        success: false,
                        message: 'Insufficient permissions'
                    });
                }
                next();
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to verify permissions'
                });
            }
        };
    },

    // Check for any of the given permissions
    hasAnyPermission: (permissions) => {
        return async (req, res, next) => {
            try {
                const admin = await Admin.findById(req.user.id);
                if (!admin || admin.isActive === false) {
                    return res.status(403).json({
                        success: false,
                        message: 'Insufficient permissions'
                    });
                }

                // Super admins have all permissions
                if (admin.isSuperAdmin()) {
                    return next();
                }

                // Check if admin has any of the required permissions
                const hasRequiredPermission = permissions.some(perm => admin.permissions[perm]);
                if (!hasRequiredPermission) {
                    return res.status(403).json({
                        success: false,
                        message: 'Insufficient permissions'
                    });
                }

                next();
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to verify permissions'
                });
            }
        };
    },

    // Check for all of the given permissions
    hasAllPermissions: (permissions) => {
        return async (req, res, next) => {
            try {
                const admin = await Admin.findById(req.user.id);
                if (!admin || admin.isActive === false) {
                    return res.status(403).json({
                        success: false,
                        message: 'Insufficient permissions'
                    });
                }

                // Super admins have all permissions
                if (admin.isSuperAdmin()) {
                    return next();
                }

                // Check if admin has all required permissions
                const hasAllPermissions = permissions.every(perm => admin.permissions[perm]);
                if (!hasAllPermissions) {
                    return res.status(403).json({
                        success: false,
                        message: 'Insufficient permissions'
                    });
                }

                next();
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to verify permissions'
                });
            }
        };
    }
};

module.exports = roleValidation;