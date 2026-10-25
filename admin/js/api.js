/**
 * API Service Module
 * All API endpoint methods and request handling
 */

import { API_BASE_URL } from './config.js';

let authToken = localStorage.getItem('admin_token');

export const API = {
    /**
     * Generic request handler
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     * @throws {Error} If request fails
     */
    request: async (endpoint, options = {}) => {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(authToken && { Authorization: `Bearer ${authToken}` })
            },
            ...options
        };

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            let data;

            try {
                data = await response.json();
            } catch (parseError) {
                console.error('Failed to parse response JSON:', parseError);
                console.error('Response status:', response.status);
                console.error('Response text:', await response.text());
                throw new Error(`Invalid response from server (Status: ${response.status})`);
            }

            if (!response.ok) {
                // User-friendly error for 404 admin actions (singular path)
                if (response.status === 404 && endpoint.startsWith('/api/admin/')) {
                    alert('Admin not found or already deleted.');
                }

                // Build a helpful error message from server response
                let serverMessage = data.message || null;
                let validationErrors = null;
                if (!serverMessage && data.errors && Array.isArray(data.errors)) {
                    // express-validator style errors
                    serverMessage = data.errors.map(err => err.msg || err.msg || JSON.stringify(err)).join('; ');
                }
                if (!serverMessage && data.data && data.data.errors) {
                    serverMessage = JSON.stringify(data.data.errors);
                }
                if (data.validationErrors) {
                    validationErrors = data.validationErrors;
                }

                console.error('API Error Response:', {
                    status: response.status,
                    message: serverMessage,
                    validationErrors,
                    data: data
                });

                const errorObj = new Error(serverMessage || `HTTP ${response.status}`);
                if (validationErrors) errorObj.validationErrors = validationErrors;
                throw errorObj;
            }

            return data;
        } catch (error) {
            console.error('API Request Error:', {
                endpoint,
                error: error.message
            });
            throw error;
        }
    },

    /**
     * Set auth token (called after login)
     * @param {string} token - Auth token
     */
    setAuthToken: (token) => {
        authToken = token;
    },

    /**
     * Get current auth token
     * @returns {string} Current auth token
     */
    getAuthToken: () => authToken,

    /**
     * Clear auth token (called on logout)
     */
    clearAuthToken: () => {
        authToken = null;
    },

    // ==================== Auth Endpoints ====================

    /**
     * Login with email and password
     * @param {Object} credentials - Email and password
     * @returns {Promise<Object>} Login response
     */
    login: (credentials) => API.request('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
    }),

    /**
     * Get current admin information
     * @returns {Promise<Object>} Current admin data
     */
    getCurrentAdmin: () => API.request('/api/auth/admin/me'),

    // ==================== Dashboard Endpoints ====================

    /**
     * Get dashboard data
     * @param {string} period - Time period (week, month, etc)
     * @returns {Promise<Object>} Dashboard data
     */
    getDashboard: (period = 'week') => API.request(`/api/admin/dashboard?period=${period}`),

    // ==================== Chat Endpoints ====================

    /**
     * Get chats with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Chats list
     */
    getChats: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return API.request(`/api/admin/chats?${query}`);
    },

    /**
     * End a chat session
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Response
     */
    endChat: (conversationId) => API.request(`/api/admin/chats/${conversationId}/end`, { method: 'PATCH' }),

    /**
     * Delete a chat
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Response
     */
    deleteChat: (conversationId) => API.request(`/api/admin/chats/${conversationId}`, { method: 'DELETE' }),

    /**
     * Archive a chat
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Response
     */
    archiveChat: (conversationId) => API.request(`/api/admin/chats/${conversationId}/archive`, { method: 'PATCH' }),

    /**
     * Unarchive a chat
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Response
     */
    unarchiveChat: (conversationId) => API.request(`/api/admin/chats/${conversationId}/unarchive`, { method: 'PATCH' }),

    /**
     * Mark chat as important
     * @param {string} conversationId - Conversation ID
     * @param {boolean} important - Whether to mark as important
     * @returns {Promise<Object>} Response
     */
    markImportant: (conversationId, important) => API.request(`/api/admin/chats/${conversationId}/important`, {
        method: 'PATCH',
        body: JSON.stringify({ important })
    }),

    // ==================== Ticket Endpoints ====================

    /**
     * Get tickets with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Tickets list
     */
    getTickets: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return API.request(`/api/tickets/admin/all?${query}`);
    },

    /**
     * Delete a ticket
     * @param {string} ticketId - Ticket ID
     * @returns {Promise<Object>} Response
     */
    deleteTicket: (ticketId) => API.request(`/api/tickets/admin/${ticketId}`, {
        method: 'DELETE'
    }),

    /**
     * Update ticket status
     * @param {string} ticketId - Ticket ID
     * @param {Object} data - Status data
     * @returns {Promise<Object>} Response
     */
    updateTicketStatus: (ticketId, data) => API.request(`/api/tickets/admin/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),

    /**
     * Archive a ticket
     * @param {string} ticketId - Ticket ID
     * @returns {Promise<Object>} Response
     */
    archiveTicket: (ticketId) => API.request(`/api/tickets/admin/${ticketId}/archive`, {
        method: 'PATCH'
    }),

    /**
     * Unarchive a ticket
     * @param {string} ticketId - Ticket ID
     * @returns {Promise<Object>} Response
     */
    unarchiveTicket: (ticketId) => API.request(`/api/tickets/admin/${ticketId}/unarchive`, {
        method: 'PATCH'
    }),

    /**
     * Mark ticket as important
     * @param {string} ticketId - Ticket ID
     * @param {boolean} important - Whether to mark as important
     * @returns {Promise<Object>} Response
     */
    markTicketImportant: (ticketId, important) => API.request(`/api/tickets/admin/${ticketId}/important`, {
        method: 'PATCH',
        body: JSON.stringify({ important })
    }),

    /**
     * Assign ticket
     * @param {string} ticketId - Ticket ID
     * @param {Object} data - Assignment data
     * @returns {Promise<Object>} Response
     */
    assignTicket: (ticketId, data) => API.request(`/api/tickets/admin/${ticketId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),

    /**
     * Update ticket priority
     * @param {string} ticketId - Ticket ID
     * @param {Object} data - Priority data
     * @returns {Promise<Object>} Response
     */
    updateTicketPriority: (ticketId, data) => API.request(`/api/tickets/admin/${ticketId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),

    /**
     * Reply to ticket
     * @param {string} ticketId - Ticket ID
     * @param {Object} data - Reply data
     * @returns {Promise<Object>} Response
     */
    replyToTicket: (ticketId, data) => API.request(`/api/tickets/admin/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    // ==================== FAQ Endpoints ====================

    /**
     * Get FAQs with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} FAQs list
     */
    getFAQs: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return API.request(`/api/faqs/admin/all?${query}`);
    },

    /**
     * Get single FAQ by ID
     * @param {string} id - FAQ ID
     * @returns {Promise<Object>} FAQ data
     */
    getFAQById: (id) => API.request(`/api/faqs/admin/${id}`),

    /**
     * Create new FAQ
     * @param {Object} data - FAQ data
     * @returns {Promise<Object>} Created FAQ
     */
    createFAQ: (data) => API.request('/api/faqs/admin/create', {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    /**
     * Update FAQ
     * @param {string} id - FAQ ID
     * @param {Object} data - FAQ data
     * @returns {Promise<Object>} Updated FAQ
     */
    updateFAQ: (id, data) => API.request(`/api/faqs/admin/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),

    /**
     * Delete FAQ (soft delete)
     * @param {string} id - FAQ ID
     * @returns {Promise<Object>} Response
     */
    deleteFAQ: (id) => API.request(`/api/faqs/admin/${id}`, {
        method: 'DELETE'
    }),

    /**
     * Hard delete FAQ
     * @param {string} id - FAQ ID
     * @returns {Promise<Object>} Response
     */
    hardDeleteFAQ: (id) => API.request(`/api/faqs/admin/${id}?hard=true`, {
        method: 'DELETE'
    }),

    /**
     * Toggle FAQ status (active/inactive)
     * @param {string} id - FAQ ID
     * @returns {Promise<Object>} Response
     */
    toggleFAQStatus: (id) => API.request(`/api/faqs/admin/${id}/toggle`, {
        method: 'PATCH'
    }),

    /**
     * Bulk import FAQs
     * @param {Object} payload - Import payload
     * @returns {Promise<Object>} Import result
     */
    bulkImportFAQs: (payload) => API.request('/api/faqs/admin/bulk-import', {
        method: 'POST',
        body: JSON.stringify(payload)
    }),

    /**
     * Download FAQ template
     * @returns {Promise<Blob>} Template file
     */
    downloadFAQTemplate: () => API.request('/api/faqs/admin/template', { responseType: 'blob' }),

    // ==================== Admin Management Endpoints ====================

    /**
     * Get admin by ID
     * @param {string} adminId - Admin ID
     * @returns {Promise<Object>} Admin data
     */
    getAdmin: (adminId) => API.request(`/api/admin/${adminId}`),

    /**
     * Get list of all admins
     * @returns {Promise<Object>} Admins list
     */
    getAdminList: () => API.request('/api/admin/list'),

    /**
     * Create new admin
     * @param {Object} data - Admin data
     * @returns {Promise<Object>} Created admin
     */
    createAdmin: (data) => API.request('/api/admin', {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    /**
     * Update admin
     * @param {string} adminId - Admin ID
     * @param {Object} data - Admin data
     * @returns {Promise<Object>} Updated admin
     */
    updateAdmin: (adminId, data) => API.request(`/api/admin/${adminId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),

    /**
     * Delete admin
     * @param {string} adminId - Admin ID
     * @returns {Promise<Object>} Response
     */
    deleteAdmin: (adminId) => API.request(`/api/admin/${adminId}`, {
        method: 'DELETE'
    }),

    /**
     * Check username availability (does not require admin list permission)
     * @param {string} username
     * @param {string} [excludeId]
     * @returns {Promise<Object>} { available: boolean }
     */
    checkUsername: (username, excludeId) => {
        const q = `?username=${encodeURIComponent(username)}${excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''}`;
        return API.request(`/api/admin/check-username${q}`);
    },

    /**
     * Toggle admin status
     * @param {string} adminId - Admin ID
     * @returns {Promise<Object>} Response
     */
    toggleAdmin: (adminId) => API.request(`/api/admin/${adminId}/toggle`, {
        method: 'PATCH'
    }),

    /**
     * Update admin permissions
     * @param {string} adminId - Admin ID
     * @param {Array} permissions - Permission array
     * @returns {Promise<Object>} Response
     */
    updateAdminPermissions: (adminId, permissions) => API.request(`/api/admin/${adminId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions })
    })
};

export default API;
