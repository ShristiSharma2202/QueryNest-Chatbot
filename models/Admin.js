const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['super_admin', 'admin', 'moderator', 'support'],
        default: 'admin'
    },
    permissions: {
        canViewDashboard: {
            type: Boolean,
            default: true
        },
        canViewChats: {
            type: Boolean,
            default: false
        },
        canViewTickets: {
            type: Boolean,
            default: false
        },
        canViewFAQs: {
            type: Boolean,
            default: false
        },
        canViewAnalytics: {
            type: Boolean,
            default: false
        },
        canManageAdmins: {
            type: Boolean,
            default: false
        },
        canManageUsers: {
            type: Boolean,
            default: false
        },
        canManageTickets: {
            type: Boolean,
            default: false
        },
        canManageFAQs: {
            type: Boolean,
            default: false
        },
        canExportData: {
            type: Boolean,
            default: false
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    }
}, {
    timestamps: true
});

// Virtual for checking if account is locked
adminSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Convert checkbox values to boolean before saving
adminSchema.pre('save', function(next) {
    // Convert checkbox values from "on" strings to boolean values
    const convertCheckboxToBoolean = (value) => {
        if (typeof value === 'string') {
            return value === 'on' || value === 'true' || value === '1';
        }
        return Boolean(value);
    };

    // Convert all permission fields
    if (this.permissions) {
        Object.keys(this.permissions).forEach(key => {
            if (this.permissions[key] !== undefined) {
                this.permissions[key] = convertCheckboxToBoolean(this.permissions[key]);
            }
        });
    }

    next();
});

// Convert checkbox values to boolean before updating
adminSchema.pre(['updateOne', 'findOneAndUpdate', 'update'], function(next) {
    const update = this.getUpdate();
    
    if (update && update.permissions) {
        // Convert checkbox values from "on" strings to boolean values
        const convertCheckboxToBoolean = (value) => {
            if (typeof value === 'string') {
                return value === 'on' || value === 'true' || value === '1';
            }
            return Boolean(value);
        };

        // Convert all permission fields in the update
        Object.keys(update.permissions).forEach(key => {
            if (update.permissions[key] !== undefined) {
                update.permissions[key] = convertCheckboxToBoolean(update.permissions[key]);
            }
        });
    }
    
    next();
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Increment login attempts
adminSchema.methods.incLoginAttempts = function() {
    // If we have a previous lock that has expired, restart at 1
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: { lockUntil: 1 },
            $set: { loginAttempts: 1 }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    
    // After 5 attempts, lock for 2 hours
    if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
    }
    
    return this.updateOne(updates);
};

// Reset login attempts
adminSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 },
        $set: { lastLogin: Date.now() }
    });
};

// Static method to find admin by email
adminSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Static method to find admin by email or username
adminSchema.statics.findByEmailOrUsername = function(identifier) {
    return this.findOne({ 
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() }
        ]
    });
};

// Instance method to check if admin is super admin
adminSchema.methods.isSuperAdmin = function() {
    return this.role === 'super_admin';
};

// Instance method to check if admin can manage other admins
adminSchema.methods.canManageAdmins = function() {
    return this.isSuperAdmin() || this.permissions.canManageAdmins;
};

module.exports = mongoose.model('Admin', adminSchema);