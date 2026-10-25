/**
 * Permission Manager Module
 * Handles role-based access control and navigation permissions
 */

export const PermissionManager = {
    currentPermissions: null,
    
    /**
     * Set current user permissions
     * @param {Object} permissions - Permissions object
     */
    setPermissions: function(permissions) {
        this.currentPermissions = permissions;
        this.updateNavigation();
    },
    
    /**
     * Check if user has specific permission
     * @param {string} permission - Permission name
     * @returns {boolean} True if user has permission
     */
    hasPermission: function(permission) {
        if (!this.currentPermissions) return false; // Hide all sections until permissions are loaded
        return this.currentPermissions[permission] === true;
    },
    
    /**
     * Update navigation based on permissions
     */
    updateNavigation: function() {
        // Use a small delay to ensure DOM is ready
        setTimeout(() => {
            const navItems = document.querySelectorAll('.nav-item[data-permission]');
            
            navItems.forEach(item => {
                const permission = item.getAttribute('data-permission');
                const hasPermission = this.hasPermission(permission);
                
                // Always show navigation items, but add visual indicators for restricted access
                item.style.display = 'flex';
                
                if (!hasPermission) {
                    // Add restricted access indicator
                    item.classList.add('restricted-access');
                    item.title = 'You don\'t have permission to access this section';
                } else {
                    // Remove restricted access indicator
                    item.classList.remove('restricted-access');
                    item.title = '';
                }
            });
            
            // Handle admin management section
            const adminManagement = document.querySelector('.admin-management');
            if (adminManagement) {
                adminManagement.style.display = 'block';
                if (!this.hasPermission('canManageAdmins')) {
                    adminManagement.classList.add('restricted-access');
                    adminManagement.title = 'You don\'t have permission to access this section';
                } else {
                    adminManagement.classList.remove('restricted-access');
                    adminManagement.title = '';
                }
            }
        }, 100);
    },
    
    /**
     * Show all sections (for super admins)
     */
    showAllSections: function() {
        const navItems = document.querySelectorAll('.nav-item[data-permission]');
        navItems.forEach(item => {
            item.style.display = 'flex';
            item.classList.remove('restricted-access');
        });
        
        const adminManagement = document.querySelector('.admin-management');
        if (adminManagement) {
            adminManagement.style.display = 'block';
            adminManagement.classList.remove('restricted-access');
        }
    },

    /**
     * Get current permissions
     * @returns {Object} Current permissions object
     */
    getPermissions: function() {
        return this.currentPermissions;
    },

    /**
     * Check if user is super admin
     * @returns {boolean} True if user is super admin
     */
    isSuperAdmin: function() {
        // User is super admin if they have canManageAdmins permission
        return this.hasPermission('canManageAdmins');
    }
};

export default PermissionManager;
