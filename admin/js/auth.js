/**
 * Authentication Module
 * Handles login, logout, session management, and token refresh
 */

import { API } from './api.js';
import { UI } from './ui-manager.js';
import { PermissionManager } from './permissions.js';
import { SESSION_CONFIG } from './config.js';

export const Auth = {
    sessionTimeout: null,
    lastActivity: null,

    /**
     * Check if user is authenticated
     * @returns {boolean} True if authenticated
     */
    isAuthenticated: () => {
        return !!localStorage.getItem('admin_token');
    },

    /**
     * Login with credentials
     * @param {Object} credentials - Email/username and password
     * @param {boolean} keepLoggedIn - Whether to keep user logged in
     * @returns {Promise<boolean>} True if login successful
     * @throws {Error} If login fails
     */
    login: async (credentials, keepLoggedIn = false) => {
        try {
            // Include keepLoggedIn in the credentials sent to server
            const loginData = {
                ...credentials,
                keepLoggedIn: keepLoggedIn
            };
            
            const response = await API.login(loginData);
            const authToken = response.data.accessToken;
            const currentAdmin = response.data.admin;
            
            // Use the server-provided expiration time
            const expiresIn = response.data.expiresIn || 86400; // Server-provided expiration in seconds
            const expirationTime = new Date().getTime() + (expiresIn * 1000);
            
            localStorage.setItem('admin_token', authToken);
            localStorage.setItem('refresh_token', response.data.refreshToken);
            localStorage.setItem('token_expiration', expirationTime);
            localStorage.setItem('keep_logged_in', keepLoggedIn.toString());
            
            // Update API token
            API.setAuthToken(authToken);
            // Set current admin globally so UI can access it immediately
            if (currentAdmin) {
                Auth.setCurrentAdmin(currentAdmin);
                window.currentAdmin = currentAdmin;
            }
            
            // Load permissions immediately after login
            if (currentAdmin && currentAdmin.permissions) {
                PermissionManager.setPermissions(currentAdmin.permissions);
                
                // Show all sections for super admins
                if (currentAdmin.role === 'super_admin') {
                    PermissionManager.showAllSections();
                } else {
                    // Ensure navigation is updated for regular admins
                    PermissionManager.updateNavigation();
                }
            }
            
            // Initialize session monitoring
            Auth.initSessionMonitor();
            return true;
        } catch (error) {
            throw error;
        }
    },

    /**
     * Logout user
     * @param {boolean} showMessage - Whether to show session expired message
     */
    logout: (showMessage = true) => {
        // Clear session data
        localStorage.removeItem('admin_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('token_expiration');
        localStorage.removeItem('last_activity');
        localStorage.removeItem('keep_logged_in');
        
        // Clear auth token in API
        API.clearAuthToken();
        
        // Clear session monitor
        if (Auth.sessionTimeout) {
            clearTimeout(Auth.sessionTimeout);
        }
        
        // Show login screen
        UI.showLoginScreen();
        
        // Show message if needed
        if (showMessage) {
            const message = document.getElementById('loginError');
            if (message) {
                message.textContent = 'Your session has expired. Please login again.';
                message.style.display = 'block';
            }
        }
        
        // Reload the page to clear any cached state
        setTimeout(() => {
            window.location.reload();
        }, 100);
    },

    /**
     * Initialize session monitoring
     */
    initSessionMonitor: () => {
        // Set up activity monitoring
        Auth.lastActivity = new Date().getTime();
        localStorage.setItem('last_activity', Auth.lastActivity);
        
        // Monitor user activity
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach(event => {
            document.addEventListener(event, Auth.updateLastActivity);
        });
        
        // Start session check timer
        Auth.checkSession();
    },

    /**
     * Update last activity time
     */
    updateLastActivity: () => {
        Auth.lastActivity = new Date().getTime();
        localStorage.setItem('last_activity', Auth.lastActivity);
    },

    /**
     * Check session validity and refresh if needed
     */
    checkSession: () => {
        Auth.sessionTimeout = setInterval(() => {
            const currentTime = new Date().getTime();
            const lastActivity = parseInt(localStorage.getItem('last_activity') || '0');
            const tokenExpiration = parseInt(localStorage.getItem('token_expiration') || '0');
            
            // Check token expiration
            if (currentTime >= tokenExpiration) {
                Auth.logout(true);
                return;
            }
            
            // Check inactivity
            if (currentTime - lastActivity >= SESSION_CONFIG.INACTIVE_TIMEOUT) {
                Auth.logout(true);
                return;
            }
            
            // If token is about to expire in the next hour, try to refresh it
            if (tokenExpiration - currentTime <= SESSION_CONFIG.TOKEN_REFRESH_THRESHOLD) {
                Auth.refreshToken();
            }
        }, SESSION_CONFIG.CHECK_INTERVAL);
    },

    /**
     * Refresh authentication token
     */
    refreshToken: async () => {
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) return;

            // Get the keepLoggedIn preference from localStorage
            const keepLoggedIn = localStorage.getItem('keep_logged_in') === 'true';

            const response = await API.request('/api/auth/admin/refresh-token', {
                method: 'POST',
                body: JSON.stringify({ 
                    refreshToken,
                    keepLoggedIn: keepLoggedIn
                })
            });

            if (response.success) {
                const authToken = response.data.accessToken;
                localStorage.setItem('admin_token', authToken);
                localStorage.setItem('token_expiration', 
                    new Date().getTime() + (response.data.expiresIn * 1000));
                
                // Update API token
                API.setAuthToken(authToken);
            }
        } catch (error) {
            // If refresh fails, logout user
            Auth.logout(true);
        }
    },

    /**
     * Check authentication and load current admin
     * @returns {Promise<boolean>} True if authenticated
     */
    checkAuth: async () => {
        const authToken = localStorage.getItem('admin_token');
        if (!authToken) return false;

        try {
            // Update API token
            API.setAuthToken(authToken);
            
            const response = await API.getCurrentAdmin();
            const currentAdmin = response.data.admin;

            // Set current admin globally so UI can read it
            if (currentAdmin) {
                Auth.setCurrentAdmin(currentAdmin);
                window.currentAdmin = currentAdmin;
            }
            
            // Load permissions immediately after auth check
            if (currentAdmin && currentAdmin.permissions) {
                PermissionManager.setPermissions(currentAdmin.permissions);
                
                // Show all sections for super admins
                if (currentAdmin.role === 'super_admin') {
                    PermissionManager.showAllSections();
                } else {
                    // Ensure navigation is updated for regular admins
                    PermissionManager.updateNavigation();
                }
            }
            
            return true;
        } catch (error) {
            Auth.logout();
            return false;
        }
    },

    /**
     * Get current admin data
     * @returns {Object} Current admin object
     */
    getCurrentAdmin: () => {
        const currentAdmin = window.currentAdmin;
        return currentAdmin;
    },

    /**
     * Set current admin data
     * @param {Object} admin - Admin object
     */
    setCurrentAdmin: (admin) => {
        window.currentAdmin = admin;
    }
};

export default Auth;
