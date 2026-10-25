/**
 * Bulk Upload Module
 * Handles file upload, parsing, validation, and bulk FAQ import
 */

import { API } from './api.js';
import { Utils } from './utils.js';
import { UI } from './ui-manager.js';
import { DataLoader } from './data-loaders.js';
import { BULK_UPLOAD_CONFIG, JSON_TEMPLATE, CSV_TEMPLATE, API_BASE_URL } from './config.js';

export const BulkUpload = {
    selectedFile: null,
    initialized: false,

    /**
     * Initialize bulk upload functionality
     */
    init: () => {
        if (BulkUpload.initialized) {
            console.log('BulkUpload already initialized');
            return;
        }
        const uploadArea = document.getElementById('uploadArea');
        const browseBtn = document.getElementById('browseUploadBtn');
        const fileInput = document.getElementById('bulkUploadFile');
        const processBtn = document.getElementById('processBulkUpload');
        const downloadJsonBtn = document.getElementById('downloadJsonTemplateBtn');
        const downloadCsvBtn = document.getElementById('downloadCsvTemplateBtn');


        if (!uploadArea || !browseBtn || !fileInput || !processBtn || !downloadJsonBtn || !downloadCsvBtn) {
            return;
        }


        // Drag and drop functionality
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                BulkUpload.handleFileSelect(files[0]);
            }
        });

        browseBtn.addEventListener('click', (e) => {
            console.log('Browse button clicked');  // Add this
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });

        // File input change
        // File input change
        let lastSelectedFile = null;  // Add this outside the event listener

        fileInput.addEventListener('change', (e) => {
            console.log('File input changed', e.target.files);
            e.stopPropagation();

            if (e.target.files.length > 0) {
                const newFile = e.target.files[0];

                // Prevent duplicate processing of the same file
                if (lastSelectedFile &&
                    lastSelectedFile.name === newFile.name &&
                    lastSelectedFile.size === newFile.size &&
                    lastSelectedFile.lastModified === newFile.lastModified) {
                    console.log('Same file selected, ignoring duplicate event');
                    return;
                }

                lastSelectedFile = newFile;
                BulkUpload.handleFileSelect(newFile);
            }
        });

        // Process upload
        processBtn.addEventListener('click', () => {
            BulkUpload.processUpload();
        });

        // Download templates
        downloadJsonBtn.addEventListener('click', () => {
            BulkUpload.downloadJsonTemplate();
        });

        downloadCsvBtn.addEventListener('click', () => {
            BulkUpload.downloadCsvTemplate();
        });

        // Download PDF template
        const downloadPdfBtn = document.getElementById('downloadPdfTemplateBtn');
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', (e) => {
                e.preventDefault();
                BulkUpload.downloadPdfTemplate();
            });
        }

        // Info button for field requirements
        const templateInfoBtn = document.getElementById('templateInfoBtn');
        if (templateInfoBtn) {
            templateInfoBtn.addEventListener('click', () => {
                BulkUpload.showFieldRequirements();
            });
        }

        // Cancel upload
        const cancelBtn = document.getElementById('cancelBulkUpload');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                BulkUpload.reset();
                UI.hideModal('bulkUploadModal');
            });
        }

        // Close results modal
        const closeResultsBtn = document.getElementById('closeResultsModal');
        if (closeResultsBtn) {
            closeResultsBtn.addEventListener('click', () => {
                UI.hideModal('uploadResultsModal');
            });
        }
        BulkUpload.initialized = true;
    },

    /**
     * Handle file selection
     * @param {File} file - File object
     */
    handleFileSelect: (file) => {
        // Validate file type
        const allowedTypes = ['.json', '.csv', '.pdf'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowedTypes.includes(fileExtension)) {
            BulkUpload.showError('Please select a valid file format (JSON, CSV, or PDF only)');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            BulkUpload.showError('File size must be less than 10MB');
            return;
        }

        BulkUpload.selectedFile = file;
        BulkUpload.displayFileInfo(file);
        const processBtn = document.getElementById('processBulkUpload');
        if (processBtn) processBtn.disabled = false;

        // Show file options after file selection
        const fileOptions = document.getElementById('fileOptions');
        if (fileOptions) {
            fileOptions.style.display = 'block';
        }
    },

    /**
     * Display file information
     * @param {File} file - File object
     */
    displayFileInfo: (file) => {
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.add('has-file');

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';

        // Determine file icon based on type
        let icon = 'fa-file';
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'json') icon = 'fa-file-code';
        if (ext === 'csv') icon = 'fa-file-csv';
        if (ext === 'pdf') icon = 'fa-file-pdf';

        fileInfo.innerHTML = `
            <div class="file-details">
                <div class="file-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="file-info-text">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${BulkUpload.formatFileSize(file.size)}</div>
                </div>
                <button type="button" class="btn-icon" id="removeFileBtn" title="Remove file">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Remove existing file info if any
        const existingFileInfo = uploadArea.querySelector('.file-info');
        if (existingFileInfo) {
            existingFileInfo.remove();
        }

        uploadArea.appendChild(fileInfo);

        // Add event listener for remove button
        const removeBtn = fileInfo.querySelector('#removeFileBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                BulkUpload.removeFile();
            });
        }
    },

    /**
     * Remove selected file
     */
    removeFile: () => {
        BulkUpload.selectedFile = null;
        const processBtn = document.getElementById('processBulkUpload');
        if (processBtn) processBtn.disabled = true;

        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.remove('has-file');

        const fileInfo = uploadArea.querySelector('.file-info');
        if (fileInfo) {
            fileInfo.remove();
        }

        // Hide file options when file is removed
        const fileOptions = document.getElementById('fileOptions');
        if (fileOptions) {
            fileOptions.style.display = 'none';
        }

        // Reset file input
        const fileInput = document.getElementById('bulkUploadFile');
        if (fileInput) fileInput.value = '';
    },

    /**
     * Format file size to readable string
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Download JSON template file
     */
    downloadJsonTemplate: () => {
        const dataStr = JSON.stringify(JSON_TEMPLATE, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'faq_template.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Download CSV template file
     */
    downloadCsvTemplate: () => {
        const dataBlob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'faq_template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Download PDF template file
     */
    downloadPdfTemplate: async () => {
        try {
            const token = localStorage.getItem('admin_token');
            const response = await fetch(`${API_BASE_URL}/api/faqs/admin/template/pdf`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download PDF template');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'faq_template.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            BulkUpload.showError('Failed to download PDF template: ' + error.message);
        }
    },

    /**
     * Process and upload file
     */
    processUpload: async () => {
        if (!BulkUpload.selectedFile) {
            BulkUpload.showError('Please select a file first');
            return;
        }

        const processBtn = document.getElementById('processBulkUpload');
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        if (processBtn) processBtn.disabled = true;
        if (progressContainer) progressContainer.style.display = 'block';

        try {
            const ext = BulkUpload.selectedFile.name.split('.').pop().toLowerCase();

            // Handle PDF upload separately
            if (ext === 'pdf') {
                if (progressText) progressText.textContent = 'Processing PDF...';
                if (progressFill) progressFill.style.width = '20%';

                const formData = new FormData();
                formData.append('pdf', BulkUpload.selectedFile);

                const overwrite = document.getElementById('overwriteExisting')?.checked;
                if (overwrite) {
                    formData.append('overwrite', 'true');
                }

                if (progressFill) progressFill.style.width = '50%';
                if (progressText) progressText.textContent = 'Uploading to server...';

                const response = await fetch(`${API_BASE_URL}/api/faqs/admin/upload-pdf?overwrite=${overwrite}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to upload PDF');
                }

                const result = await response.json();

                if (progressFill) progressFill.style.width = '100%';
                if (progressText) progressText.textContent = 'Upload completed!';

                setTimeout(() => {
                    BulkUpload.showResults(result.data);
                    BulkUpload.reset();
                    UI.hideModal('bulkUploadModal');
                    DataLoader.loadFAQs();
                }, 500);
            } else {
                // Handle JSON/CSV as before
                if (progressText) progressText.textContent = 'Reading file...';
                if (progressFill) progressFill.style.width = '20%';

                const fileContent = await BulkUpload.readFile(BulkUpload.selectedFile);
                if (progressFill) progressFill.style.width = '40%';
                if (progressText) progressText.textContent = 'Parsing data...';

                const faqs = await BulkUpload.parseFile(fileContent, BulkUpload.selectedFile.name);
                if (progressFill) progressFill.style.width = '60%';
                if (progressText) progressText.textContent = 'Validating data...';

                const validatedFaqs = BulkUpload.validateFaqs(faqs);
                if (progressFill) progressFill.style.width = '80%';
                if (progressText) progressText.textContent = 'Uploading to server...';

                const overwrite = document.getElementById('overwriteExisting')?.checked;
                const result = await API.bulkImportFAQs({
                    faqs: validatedFaqs,
                    overwrite
                });

                if (progressFill) progressFill.style.width = '100%';
                if (progressText) progressText.textContent = 'Upload completed!';

                // Show results
                setTimeout(() => {
                    BulkUpload.showResults(result.data);
                    BulkUpload.reset();
                    UI.hideModal('bulkUploadModal');
                    DataLoader.loadFAQs();
                }, 500);
            }
        } catch (error) {
            BulkUpload.showError('Upload failed: ' + error.message);
            if (processBtn) processBtn.disabled = false;
            if (progressContainer) progressContainer.style.display = 'none';
        }
    },

    /**
     * Read file content
     * @param {File} file - File object
     * @returns {Promise<string>} File content
     */
    readFile: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },

    /**
     * Parse file content
     * @param {string} content - File content
     * @param {string} filename - Original filename
     * @returns {Promise<Array>} Parsed FAQs
     */
    parseFile: async (content, filename) => {
        const extension = filename.split('.').pop().toLowerCase();

        if (extension === 'json') {
            try {
                const json = JSON.parse(content);
                return Array.isArray(json.faqs) ? json.faqs : (Array.isArray(json) ? json : []);
            } catch (error) {
                throw new Error('Invalid JSON format');
            }
        } else if (extension === 'csv') {
            return BulkUpload.parseCSV(content);
        } else if (extension === 'pdf') {
            // PDF will be handled via API
            return null; // Signal to use API
        } else {
            throw new Error('Unsupported file format');
        }
    },

    /**
     * Parse CSV content
     * @param {string} content - CSV content
     * @returns {Array} Parsed FAQs
     */
    parseCSV: (content) => {
        // Filter out comment lines and empty lines
        const lines = content.split('\n')
            .filter(line => line.trim() && !line.trim().startsWith('#'))
            .map(line => line.trim());

        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }

        // Parse CSV header
        const headers = BulkUpload.parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
        const faqs = [];

        // Validate required headers
        const requiredHeaders = ['question', 'answer', 'patterns'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const values = BulkUpload.parseCSVLine(line);
            if (values.length !== headers.length) {
                throw new Error(`Row ${i + 1}: Expected ${headers.length} columns but found ${values.length}`);
            }

            const faq = {};
            headers.forEach((header, index) => {
                let value = values[index] ? values[index].trim() : '';

                // Special handling for patterns
                if (header === 'patterns') {
                    if (!value) {
                        throw new Error(`Row ${i + 1}: Patterns column cannot be empty`);
                    }
                    // Split patterns by pipe, semicolon, or comma and clean them
                    const patterns = value.split(/[|;,]/)
                        .map(p => p.trim())
                        .filter(p => p);

                    if (patterns.length === 0) {
                        throw new Error(`Row ${i + 1}: At least one valid pattern is required`);
                    }

                    // Validate each pattern
                    patterns.forEach((pattern, idx) => {
                        if (pattern.length < BULK_UPLOAD_CONFIG.PATTERN_MIN_LENGTH) {
                            throw new Error(`Row ${i + 1}, Pattern ${idx + 1}: Pattern must be at least ${BULK_UPLOAD_CONFIG.PATTERN_MIN_LENGTH} characters`);
                        }
                        if (pattern.length > BULK_UPLOAD_CONFIG.PATTERN_MAX_LENGTH) {
                            throw new Error(`Row ${i + 1}, Pattern ${idx + 1}: Pattern must be less than ${BULK_UPLOAD_CONFIG.PATTERN_MAX_LENGTH} characters`);
                        }
                    });

                    value = patterns;
                }

                // Special handling for priority
                if (header === 'priority') {
                    const priority = value ? parseInt(value) : BULK_UPLOAD_CONFIG.DEFAULT_PRIORITY;
                    if (isNaN(priority) || priority < BULK_UPLOAD_CONFIG.PRIORITY_MIN || priority > BULK_UPLOAD_CONFIG.PRIORITY_MAX) {
                        throw new Error(`Row ${i + 1}: Priority must be a number between ${BULK_UPLOAD_CONFIG.PRIORITY_MIN} and ${BULK_UPLOAD_CONFIG.PRIORITY_MAX}`);
                    }
                    value = priority;
                }

                // Special handling for category
                if (header === 'category') {
                    value = value || BULK_UPLOAD_CONFIG.DEFAULT_CATEGORY;
                    if (value.length > BULK_UPLOAD_CONFIG.CATEGORY_MAX_LENGTH) {
                        throw new Error(`Row ${i + 1}: Category must be less than ${BULK_UPLOAD_CONFIG.CATEGORY_MAX_LENGTH} characters`);
                    }
                }

                faq[header] = value;
            });

            faqs.push(faq);
        }

        return faqs;
    },

    /**
     * Parse CSV line handling quoted values
     * @param {string} line - CSV line
     * @returns {Array} Parsed fields
     */
    parseCSVLine: (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // Add the last field
        result.push(current);

        return result;
    },

    /**
     * Validate FAQs array
     * @param {Array} faqs - FAQs to validate
     * @returns {Array} Validated FAQs
     * @throws {Error} If validation fails
     */
    validateFaqs: (faqs) => {
        const validatedFaqs = [];
        const errors = [];

        faqs.forEach((faq, index) => {
            const error = BulkUpload.validateSingleFaq(faq, index);
            if (error) {
                errors.push(error);
            } else {
                validatedFaqs.push({
                    question: faq.question?.trim() || '',
                    answer: faq.answer?.trim() || '',
                    patterns: Array.isArray(faq.patterns) ? faq.patterns : [],
                    category: faq.category?.toLowerCase().trim() || BULK_UPLOAD_CONFIG.DEFAULT_CATEGORY,
                    priority: parseInt(faq.priority) || BULK_UPLOAD_CONFIG.DEFAULT_PRIORITY
                });
            }
        });

        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.length} items have errors`);
        }

        return validatedFaqs;
    },

    /**
     * Validate single FAQ
     * @param {Object} faq - FAQ to validate
     * @param {number} index - FAQ index
     * @returns {Object|null} Error object or null if valid
     */
    validateSingleFaq: (faq, index) => {
        const rowNum = index + 1;

        // Validate question
        if (!faq.question || faq.question.trim().length === 0) {
            return { index, question: faq.question || 'Empty', error: `Row ${rowNum}: Question is required` };
        }
        if (faq.question.trim().length < BULK_UPLOAD_CONFIG.QUESTION_MIN_LENGTH) {
            return { index, question: faq.question, error: `Row ${rowNum}: Question must be at least ${BULK_UPLOAD_CONFIG.QUESTION_MIN_LENGTH} characters (currently ${faq.question.trim().length})` };
        }
        if (faq.question.trim().length > BULK_UPLOAD_CONFIG.QUESTION_MAX_LENGTH) {
            return { index, question: faq.question, error: `Row ${rowNum}: Question must be less than ${BULK_UPLOAD_CONFIG.QUESTION_MAX_LENGTH} characters (currently ${faq.question.trim().length})` };
        }

        // Validate answer
        if (!faq.answer || faq.answer.trim().length === 0) {
            return { index, question: faq.question, error: `Row ${rowNum}: Answer is required` };
        }
        if (faq.answer.trim().length < BULK_UPLOAD_CONFIG.ANSWER_MIN_LENGTH) {
            return { index, question: faq.question, error: `Row ${rowNum}: Answer must be at least ${BULK_UPLOAD_CONFIG.ANSWER_MIN_LENGTH} characters (currently ${faq.answer.trim().length})` };
        }
        if (faq.answer.trim().length > BULK_UPLOAD_CONFIG.ANSWER_MAX_LENGTH) {
            return { index, question: faq.question, error: `Row ${rowNum}: Answer must be less than ${BULK_UPLOAD_CONFIG.ANSWER_MAX_LENGTH} characters (currently ${faq.answer.trim().length})` };
        }

        // Validate patterns
        if (!faq.patterns || !Array.isArray(faq.patterns) || faq.patterns.length === 0) {
            return { index, question: faq.question, error: `Row ${rowNum}: At least one search pattern is required` };
        }

        // Validate each pattern
        for (let i = 0; i < faq.patterns.length; i++) {
            const pattern = faq.patterns[i];
            if (!pattern || pattern.trim().length === 0) {
                return { index, question: faq.question, error: `Row ${rowNum}: Pattern ${i + 1} is empty` };
            }
            if (pattern.trim().length < BULK_UPLOAD_CONFIG.PATTERN_MIN_LENGTH) {
                return { index, question: faq.question, error: `Row ${rowNum}: Pattern "${pattern}" must be at least ${BULK_UPLOAD_CONFIG.PATTERN_MIN_LENGTH} characters` };
            }
            if (pattern.trim().length > BULK_UPLOAD_CONFIG.PATTERN_MAX_LENGTH) {
                return { index, question: faq.question, error: `Row ${rowNum}: Pattern "${pattern}" must be less than ${BULK_UPLOAD_CONFIG.PATTERN_MAX_LENGTH} characters` };
            }
        }

        // Validate category (optional but if provided, check length)
        if (faq.category && faq.category.trim().length > BULK_UPLOAD_CONFIG.CATEGORY_MAX_LENGTH) {
            return { index, question: faq.question, error: `Row ${rowNum}: Category must be less than ${BULK_UPLOAD_CONFIG.CATEGORY_MAX_LENGTH} characters (currently ${faq.category.trim().length})` };
        }

        // Validate priority (optional but if provided, check range)
        if (faq.priority !== undefined && faq.priority !== null) {
            const priority = parseInt(faq.priority);
            if (isNaN(priority) || priority < BULK_UPLOAD_CONFIG.PRIORITY_MIN || priority > BULK_UPLOAD_CONFIG.PRIORITY_MAX) {
                return { index, question: faq.question, error: `Row ${rowNum}: Priority must be a number between ${BULK_UPLOAD_CONFIG.PRIORITY_MIN} and ${BULK_UPLOAD_CONFIG.PRIORITY_MAX} (currently: ${faq.priority})` };
            }
        }

        return null;
    },

    /**
     * Show upload results
     * @param {Object} result - Upload result data
     */
    showResults: (result) => {
        const resultsBody = document.getElementById('uploadResultsBody');

        const html = `
            <div class="upload-results">
                <div class="result-summary">
                    <div class="result-stat success">
                        <span class="stat-number">${result.created || 0}</span>
                        <span class="stat-label">Created</span>
                    </div>
                    <div class="result-stat warning">
                        <span class="stat-number">${result.updated || 0}</span>
                        <span class="stat-label">Updated</span>
                    </div>
                    <div class="result-stat warning">
                        <span class="stat-number">${result.skipped || 0}</span>
                        <span class="stat-label">Skipped</span>
                    </div>
                    <div class="result-stat error">
                        <span class="stat-number">${result.errors?.length || 0}</span>
                        <span class="stat-label">Errors</span>
                    </div>
                </div>
                
                ${result.skippedItems && result.skippedItems.length > 0 ? `
                    <div class="result-section">
                        <h4>Skipped Items:</h4>
                        <div class="info-list">
                            ${result.skippedItems.map(item => `
                                <div class="info-item">
                                    <div class="info-header">
                                        <span class="info-title">${item.question}</span>
                                        <span class="info-badge">Skipped</span>
                                    </div>
                                    <div class="info-reason">${item.reason}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${result.errors && result.errors.length > 0 ? `
                    <div class="result-section">
                        <h4>Errors:</h4>
                        <div class="error-list">
                            ${result.errors.map(error => `
                                <div class="error-item">
                                    <div class="error-header">
                                        <span class="error-title">Row ${error.index}: ${error.question}</span>
                                        <span class="error-badge">Error</span>
                                    </div>
                                    <div class="error-message">${error.error}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        resultsBody.innerHTML = html;
        UI.showModal('uploadResultsModal');
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: (message) => {
        // Create a custom modal for errors instead of alert
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Upload Error</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="color: var(--danger-color); padding: 1rem; background-color: #fef2f2; border-radius: var(--radius-md);">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                        ${message}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="this.closest('.modal').remove()">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal handlers
        modal.querySelector('.modal-close').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    },

    /**
     * Reset bulk upload state
     */
    reset: () => {
        BulkUpload.selectedFile = null;
        const processBtn = document.getElementById('processBulkUpload');
        if (processBtn) processBtn.disabled = true;

        const progressContainer = document.getElementById('uploadProgress');
        if (progressContainer) progressContainer.style.display = 'none';

        const progressFill = document.getElementById('progressFill');
        if (progressFill) progressFill.style.width = '0%';

        const overwriteCheckbox = document.getElementById('overwriteExisting');
        if (overwriteCheckbox) overwriteCheckbox.checked = false;

        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea) {
            uploadArea.classList.remove('has-file', 'dragover');

            const fileInfo = uploadArea.querySelector('.file-info');
            if (fileInfo) {
                fileInfo.remove();
            }
        }

        const fileInput = document.getElementById('bulkUploadFile');
        if (fileInput) fileInput.value = '';

        // Hide file options when reset
        const fileOptions = document.getElementById('fileOptions');
        if (fileOptions) {
            fileOptions.style.display = 'none';
        }
    },

    /**
     * Show field requirements modal
     */
    showFieldRequirements: () => {
        // Create a modal to show field requirements
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'fieldRequirementsModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Required Fields Format</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="field-requirements-content">
                        <div class="requirement-item">
                            <span class="requirement-label">Question*:</span>
                            <span class="requirement-value">${BULK_UPLOAD_CONFIG.QUESTION_MIN_LENGTH}-${BULK_UPLOAD_CONFIG.QUESTION_MAX_LENGTH} characters</span>
                        </div>
                        <div class="requirement-item">
                            <span class="requirement-label">Answer*:</span>
                            <span class="requirement-value">${BULK_UPLOAD_CONFIG.ANSWER_MIN_LENGTH}-${BULK_UPLOAD_CONFIG.ANSWER_MAX_LENGTH} characters</span>
                        </div>
                        <div class="requirement-item">
                            <span class="requirement-label">Patterns*:</span>
                            <span class="requirement-value">At least 1 pattern, ${BULK_UPLOAD_CONFIG.PATTERN_MIN_LENGTH}-${BULK_UPLOAD_CONFIG.PATTERN_MAX_LENGTH} characters each</span>
                        </div>
                        <div class="requirement-item">
                            <span class="requirement-label">Category:</span>
                            <span class="requirement-value">Optional, max ${BULK_UPLOAD_CONFIG.CATEGORY_MAX_LENGTH} characters (default: ${BULK_UPLOAD_CONFIG.DEFAULT_CATEGORY})</span>
                        </div>
                        <div class="requirement-item">
                            <span class="requirement-label">Priority:</span>
                            <span class="requirement-value">Optional, ${BULK_UPLOAD_CONFIG.PRIORITY_MIN}-${BULK_UPLOAD_CONFIG.PRIORITY_MAX} (default: ${BULK_UPLOAD_CONFIG.DEFAULT_PRIORITY})</span>
                        </div>
                    </div>
                    <div class="requirements-note">
                        <strong>Note:</strong> Please delete the example data from the template before uploading your FAQs.
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-primary" id="closeFieldRequirements">Got it</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Show the modal
        modal.style.display = 'flex';

        // Add event listeners
        const closeBtn = modal.querySelector('.modal-close');
        const gotItBtn = modal.querySelector('#closeFieldRequirements');

        const closeModal = () => {
            modal.style.display = 'none';
            document.body.removeChild(modal);
        };

        closeBtn.addEventListener('click', closeModal);
        gotItBtn.addEventListener('click', closeModal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
};

export default BulkUpload;