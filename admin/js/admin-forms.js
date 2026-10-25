/**
 * Admin Forms Module
 * Handles admin form creation, validation, and submission
 */

export const AdminForm = {
    /**
     * Close admin form and reset all fields
     */
    close: function() {
        const form = document.getElementById('adminForm');
        if (form) {
            form.reset();
           
            // Clear all form fields explicitly
            const nameField = document.getElementById('adminFormName');
            const usernameField = document.getElementById('adminFormUsername');
            const emailField = document.getElementById('adminFormEmail');
            const roleField = document.getElementById('adminFormRole');
            if (nameField) nameField.value = '';
            if (usernameField) usernameField.value = '';
            if (emailField) emailField.value = '';
            if (roleField) roleField.value = 'admin';
            
            // Clear any cached admin ID
            delete form.dataset.adminId;
        }
        
        // Reset super admin checkbox
        const superAdminCheckbox = document.getElementById('isSuperAdmin');
        if (superAdminCheckbox) {
            superAdminCheckbox.checked = false;
        }
        
        // Reset permissions to default state
        const permissionsGroupElement = document.getElementById('permissionsGroup');
        if (permissionsGroupElement) {
            const permissionCheckboxes = permissionsGroupElement.querySelectorAll('input[name="permissions"]');
            permissionCheckboxes.forEach(checkbox => {
                if (checkbox.value === 'canViewDashboard') {
                    checkbox.checked = true;
                    checkbox.disabled = true;
                } else {
                    checkbox.checked = false;
                    checkbox.disabled = false;
                }
            });
        }
        
        // Password field removed for Add Admin form
        // Role dropdown removed, so skip adminFormRoleGroup
        const superAdmin = document.getElementById('isSuperAdmin');
        if (superAdmin) {
            const superAdminGroup = superAdmin.closest('.form-group');
            if (superAdminGroup) superAdminGroup.style.display = 'block';
        }
        const permissionsGroup = document.getElementById('permissionsGroup');
        if (permissionsGroup) permissionsGroup.style.display = 'block';
        
        // Reset form scroll position
        const modalBody = document.querySelector('#adminModal .modal-body');
        if (modalBody) {
            modalBody.scrollTop = 0;
        }
        
        // Import UI module to hide modal
        import('./ui-manager.js').then(({ UI }) => {
            UI.hideModal('adminModal');
        });
    },
    
    /**
     * Attach Super Admin checkbox logic
     */
    attachSuperAdminHandler: function() {
        const superAdminCheckbox = document.getElementById('isSuperAdmin');
        const permissionsGroup = document.getElementById('permissionsGroup');
        if (!superAdminCheckbox || !permissionsGroup) return;

        superAdminCheckbox.addEventListener('change', function() {
            const permissionCheckboxes = permissionsGroup.querySelectorAll('input[name="permissions"]');
            if (superAdminCheckbox.checked) {
                permissionCheckboxes.forEach(cb => {
                    cb.checked = true;
                    cb.disabled = true;
                });
                // Optionally show note
                const note = document.getElementById('superAdminNote');
                if (note) note.style.display = 'block';
            } else {
                permissionCheckboxes.forEach(cb => {
                    if (cb.value === 'canViewDashboard') {
                        cb.checked = true;
                        cb.disabled = true;
                    } else {
                        cb.checked = false;
                        cb.disabled = false;
                    }
                });
                const note = document.getElementById('superAdminNote');
                if (note) note.style.display = 'none';
            }
        });
    },

    /**
     * Validate form inputs
     * @param {HTMLFormElement} form - The form to validate
     * @returns {Object} Admin data object
     * @throws {Error} If validation fails
     */
    validateInputs: function(form) {
        const nameInput = form.querySelector('input[name="name"]');
        const usernameInput = form.querySelector('input[name="username"]');
        const emailInput = form.querySelector('input[name="email"]');
        // Password field removed for Add Admin form

        if (!nameInput || !usernameInput) {
            throw new Error('Required form fields are missing');
        }

        const formData = new FormData(form);
        const adminData = Object.fromEntries(formData.entries());

        if (!adminData.name?.trim() || !adminData.username?.trim()) {
            throw new Error('Name and username are required');
        }

        // Email format validation (if email is provided)
        if (emailInput && emailInput.value.trim() !== '') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(emailInput.value.trim())) {
                throw new Error('Please enter a valid email address.');
            }
        }

        // Do not require password for new admin; it will be generated server-side

        return adminData;
    },

    /**
     * Validate password strength
     * Password must be at least 8 characters with uppercase, lowercase, number and special character
     * @param {string} password - Password to validate
     * @returns {boolean} True if password meets requirements
     */
    validatePassword: function(password) {
        if (!password) return false;
        
        // Password must be at least 8 characters long and include:
        // - At least one uppercase letter
        // - At least one lowercase letter
        // - At least one number
        // - At least one special character
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return passwordRegex.test(password);
    },

    /**
     * Save admin (create or update)
     * @param {HTMLFormElement} form - The admin form
     * @returns {Promise<Object>} Response from server
     * @throws {Error} If save fails
     */
    save: async function(form) {
        const adminData = this.validateInputs(form);
        const token = localStorage.getItem('admin_token');
        
        if (!token) {
            throw new Error('Not authenticated. Please log in again.');
        }

        // Do not validate password for new admin; it will be generated server-side

        // Handle super admin and permissions
        const isSuperAdmin = document.getElementById('isSuperAdmin').checked;
        adminData.role = isSuperAdmin ? 'super_admin' : 'admin';

        // Set permissions
        if (isSuperAdmin) {
            adminData.permissions = [
                'canViewDashboard',
                'canViewChats', 
                'canViewTickets',
                'canViewFAQs',
                'canViewAnalytics',
                'canManageAdmins',
                'canManageUsers',
                'canExportData'
            ];
        } else {
            const selectedPermissions = ['canViewDashboard'];
            const permissionBoxes = form.querySelectorAll('input[name="permissions"]:checked');
            permissionBoxes.forEach(box => {
                if (!selectedPermissions.includes(box.value)) {
                    selectedPermissions.push(box.value);
                }
            });
            adminData.permissions = selectedPermissions;
        }

        // Add email if username is email format AND no separate email field was provided
        if (adminData.username.includes('@') && !adminData.email) {
            adminData.email = adminData.username;
        }

        // Never send the plain password in URL parameters
        const url = form.dataset.adminId ? `/api/admin/${form.dataset.adminId}` : '/api/admin';
        
        // Make the API request with secure headers
        const response = await fetch(url, {
            method: form.dataset.adminId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify(adminData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save admin');
        }

        return await response.json();
    }
};

/**
 * Initialize admin form event listeners
 */
export function initializeAdminFormListeners() {
    // Admin cancel button handler
    const adminCancelBtn = document.getElementById('adminCancelBtn');
    if (adminCancelBtn) {
        adminCancelBtn.addEventListener('click', () => AdminForm.close());
    }

    // Admin save button handler
    const adminSaveBtn = document.getElementById('adminSaveBtn');
    if (adminSaveBtn) {
        adminSaveBtn.addEventListener('click', async () => {
            const btnText = adminSaveBtn.querySelector('.btn-text');
            const btnLoading = adminSaveBtn.querySelector('.btn-loading');
            if (btnText) btnText.style.display = 'none';
            if (btnLoading) btnLoading.style.display = 'inline-block';
            adminSaveBtn.disabled = true;
            try {
                const { Utils } = await import('./utils.js');
                const { DataLoader } = await import('./data-loaders.js');

                const form = document.getElementById('adminForm');
                if (!form) {
                    Utils.showError('Form not found. Please refresh the page.');
                    return;
                }

                const result = await AdminForm.save(form);
                Utils.showSuccess('Admin saved successfully');
                DataLoader.loadAdminList();
                AdminForm.close();
            } catch (error) {
                const { Utils } = await import('./utils.js');
                Utils.showError(error.message || 'Failed to save admin');
            } finally {
                if (btnText) btnText.style.display = '';
                if (btnLoading) btnLoading.style.display = 'none';
                adminSaveBtn.disabled = false;
            }
        });
    }

    // Attach Super Admin logic
    AdminForm.attachSuperAdminHandler();

    // Change Password Modal Event Listeners
    // Ensure password toggle works in modal
    import('./event-handlers.js').then(({ setupPasswordToggleHandlers }) => {
        setupPasswordToggleHandlers();
    });

    const passwordSaveBtn = document.getElementById('passwordSaveBtn');
    if (passwordSaveBtn) {
        passwordSaveBtn.addEventListener('click', async () => {
            try {
                const { Utils } = await import('./utils.js');
                const { API } = await import('./api.js');
                
                const form = document.getElementById('changePasswordForm');
                const formData = new FormData(form);
                const passwordData = Object.fromEntries(formData.entries());
                
                // Validate password strength
                const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
                if (!passwordRegex.test(passwordData.newPassword)) {
                    const errorDiv = document.getElementById('passwordError') || document.createElement('div');
                    errorDiv.id = 'passwordError';
                    errorDiv.className = 'error-message';
                    errorDiv.textContent = 'Password must be at least 8 characters long and include uppercase, lowercase, number and special character';
                    errorDiv.style.display = 'block';
                    
                    // Insert error message after the form
                    if (!document.getElementById('passwordError')) {
                        form.parentNode.insertBefore(errorDiv, form.nextSibling);
                    }
                    return;
                }

                if (passwordData.newPassword !== passwordData.confirmPassword) {
                    const errorDiv = document.getElementById('passwordError') || document.createElement('div');
                    errorDiv.id = 'passwordError';
                    errorDiv.className = 'error-message';
                    errorDiv.textContent = 'New passwords do not match';
                    errorDiv.style.display = 'block';
                    
                    // Insert error message after the form
                    if (!document.getElementById('passwordError')) {
                        form.parentNode.insertBefore(errorDiv, form.nextSibling);
                    }
                    return;
                }
                
                await API.request('/api/auth/admin/change-password', {
                    method: 'POST',
                    body: JSON.stringify(passwordData)
                });
                Utils.showSuccess('Password changed successfully');
                
                const { UI } = await import('./ui-manager.js');
                UI.hideModal('changePasswordModal');
                // toast for quick feedback
                if (UI && UI.showToast) UI.showToast('Password changed successfully', 'success');
                
                // Clear any error messages
                const errorDiv = document.getElementById('passwordError');
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                    errorDiv.textContent = '';
                }
            } catch (error) {
                const { Utils } = await import('./utils.js');
                // Show error in the password modal
                const errorDiv = document.getElementById('passwordError') || document.createElement('div');
                errorDiv.id = 'passwordError';
                errorDiv.className = 'error-message';
                errorDiv.textContent = error.message || 'Failed to change password';
                errorDiv.style.display = 'block';
                
                // Insert error message after the form
                const form = document.getElementById('changePasswordForm');
                if (!document.getElementById('passwordError')) {
                    form.parentNode.insertBefore(errorDiv, form.nextSibling);
                }
                // toast for quick feedback
                try {
                    const { UI } = await import('./ui-manager.js');
                    if (UI && UI.showToast) UI.showToast(error.message || 'Failed to change password', 'error');
                } catch (e) {
                    // ignore toast failure
                }
            }
        });
    }
}
