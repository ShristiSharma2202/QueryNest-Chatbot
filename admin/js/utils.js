/**
 * Utilities Module
 * Formatting, helper functions, and common utilities
 */

export const Utils = {
    /**
     * Format date to readable string
     * @param {string} dateString - Date string to format
     * @returns {string} Formatted date string
     */
    formatDate: (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Format date to short date string 'DD Mon YYYY' (e.g., 14 Jan 2026)
     * @param {string|Date} dateString - Date string or Date object
     * @returns {string} Formatted short date
     */
    formatShortDate: (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    /**
     * Format date and time with separate display
     * @param {string} dateString - Date string to format
     * @returns {string} HTML formatted date and time
     */
    formatDateAndTime: (dateString) => {
        const date = new Date(dateString);
        const dateStr = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        return `<div><strong>${dateStr}</strong></div><div class="text-xs">${timeStr}</div>`;
    },

    /**
     * Get time ago text (e.g., "5m ago", "2h ago")
     * @param {string} dateString - Date string
     * @returns {string} Time ago text
     */
    getTimeAgo: (dateString) => {
        const now = new Date();
        const date = new Date(dateString);
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'Just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes}m ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours}h ago`;
        } else if (diffInSeconds < 2592000) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days}d ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }
    },

    /**
     * Format duration in seconds to readable string
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration (e.g., "5m 30s")
     */
    formatDuration: (seconds) => {
        if (!seconds) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    },

    /**
     * Show error message
     * @param {string} message - Error message
     * @param {HTMLElement} element - Optional element to show inline error
     */
    showError: (message, element = null) => {
        if (element) {
            // For inline errors (form fields, etc)
            element.textContent = message;
            element.classList.add('show');
        } else {
            // Show enhanced error message in a toast notification
            const toast = document.createElement('div');
            toast.className = 'toast-error';
            
            // Detect specific error messages and provide more user-friendly versions
            let displayMessage = message;
            if (message.includes('email already exists')) {
                displayMessage = 'This email address is already registered with another admin account. Please use a different email.';
            } else if (message.includes('username already exists')) {
                displayMessage = 'This username is already taken. Please choose a different username.';
            } else if (message.includes('password must be')) {
                displayMessage = 'Please ensure your password is at least 8 characters and includes uppercase, lowercase, number and special characters.';
            }
            
            toast.innerHTML = `
                <div class="toast-content">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>${displayMessage}</span>
                </div>
            `;
            
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff4444;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-size: 14px;
                max-width: 400px;
                display: flex;
                align-items: center;
            `;
            
            // Add animation
            toast.animate([
                { transform: 'translateX(100%)' },
                { transform: 'translateX(0)' }
            ], {
                duration: 300,
                easing: 'ease-out'
            });
            
            document.body.appendChild(toast);
            
            // Auto-remove after 5 seconds with fade out
            setTimeout(() => {
                toast.animate([
                    { opacity: 1 },
                    { opacity: 0 }
                ], {
                    duration: 300,
                    easing: 'ease-out'
                }).onfinish = () => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                };
            }, 5000);
        }
    },

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess: (message) => {
        // Show user-friendly success message in a toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-success';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #44ff44;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            font-size: 14px;
            max-width: 300px;
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    },

    /**
     * Hide error message
     * @param {HTMLElement} element - Element containing error
     */
    hideError: (element) => {
        element.classList.remove('show');
        element.textContent = '';
    },

    /**
     * Clear all error and success messages
     */
    clearErrors: () => {
        // Clear any existing error messages
        const existingErrors = document.querySelectorAll('.error-message, .toast-error, .toast-success');
        existingErrors.forEach(error => {
            if (error.parentNode) {
                error.parentNode.removeChild(error);
            }
        });
    },

    /**
     * Show loading indicator
     * @param {HTMLElement} element - Element to show loading in
     * @param {string} text - Loading text
     */
    showLoading: (element, text = 'Loading...') => {
        element.innerHTML = `<div class="loading">${text}</div>`;
    },

    /**
     * Create status badge HTML
     * @param {string} status - Status value
     * @returns {string} HTML for status badge
     */
    createStatusBadge: (status) => {
        const statusLabels = {
            'new': 'New',
            'in_progress': 'In Progress',
            'closed': 'Closed',
            'active': 'Active',
            'ended': 'Ended',
            'ended_inactivity': 'Ended by Inactivity',
            'archived': 'Archived'
        };
        const label = statusLabels[status] || status;
        return `<span class="status-badge status-${status}">${label}</span>`;
    },

    /**
     * Create priority badge HTML
     * @param {string} priority - Priority value
     * @returns {string} HTML for priority badge
     */
    createPriorityBadge: (priority) => {
        return `<span class="priority-badge priority-${priority}">${priority}</span>`;
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Debounce delay in ms
     * @returns {Function} Debounced function
     */
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Create star rating display HTML
     * @param {number} averageRating - Average rating value
     * @param {number} ratingCount - Number of ratings
     * @returns {string} HTML for star rating
     */
    createStarRating: (averageRating, ratingCount) => {
        // Handle no rating case
        if (averageRating === null || averageRating === undefined || ratingCount === 0) {
            return '<div class="star-rating"><span class="no-rating">-</span></div>';
        }

        const rating = parseFloat(averageRating);
        const count = parseInt(ratingCount) || 0;
        
        let starsHtml = '<div class="star-rating"><div class="star-rating-display">';
        
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(rating)) {
                // Full star
                starsHtml += '<span class="star filled">★</span>';
            } else if (i === Math.ceil(rating) && rating % 1 !== 0) {
                // Half star
                starsHtml += '<span class="star half-filled">★</span>';
            } else {
                // Empty star
                starsHtml += '<span class="star">★</span>';
            }
        }
        
        starsHtml += '</div>';
        starsHtml += `<div class="rating-count">${count} rating${count !== 1 ? 's' : ''}</div>`;
        starsHtml += '</div>';
        
        return starsHtml;
    },

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml: (text = '') => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Format file size to readable string
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid email
     */
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} True if successful
     */
    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Failed to copy:', error);
            return false;
        }
    }
};

export default Utils;
