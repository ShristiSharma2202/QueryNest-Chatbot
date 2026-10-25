/**
 * Enhanced Export Manager Module - FIXED
 * Properly formats nested data for CSV export with full message/field support
 */


export const ExportManager = {
    init() {
        const exportFAQsBtn = document.getElementById('exportFAQsBtn');
        if (exportFAQsBtn) exportFAQsBtn.addEventListener('click', () => this.exportFAQs());
    },

    // Flatten object for CSV (used for FAQ root fields)
    flattenObject(obj, prefix = '', maxDepth = 10, currentDepth = 0) {
        let flattened = {};
        if (currentDepth >= maxDepth) return flattened;
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}_${key}` : key;
                if (value === null || value === undefined) {
                    flattened[newKey] = '';
                } else if (Array.isArray(value)) {
                    flattened[newKey] = JSON.stringify(value);
                } else if (typeof value === 'object') {
                    Object.assign(flattened, this.flattenObject(value, newKey, maxDepth, currentDepth + 1));
                } else {
                    flattened[newKey] = value;
                }
            }
        }
        return flattened;
    },

    // Expand FAQ Q&A pairs into separate rows
    expandFAQs(faqs) {
        const expanded = [];
        faqs.forEach(faq => {
            const faqData = this.flattenObject(faq);
            if (faq.questions && Array.isArray(faq.questions)) {
                faq.questions.forEach((q, idx) => {
                    const row = { ...faqData };
                    row[`question_${idx + 1}`] = q.question || '';
                    row[`answer_${idx + 1}`] = q.answer || '';
                    row[`tags_${idx + 1}`] = q.tags ? JSON.stringify(q.tags) : '';
                    expanded.push(row);
                });
            } else {
                expanded.push(faqData);
            }
        });
        return expanded;
    },

    /**
     * Special handling for chat sessions - expand messages into separate rows with full data
     */
    expandChats(chats) {
        const expanded = [];
        
        chats.forEach(chat => {
            const baseData = {
                sessionId: chat.sessionId || '',
                conversationId: chat.conversationId || '',
                status: chat.status || '',
                duration: chat.duration || '',
                satisfaction: chat.satisfaction || '',
                startedAt: chat.startedAt || '',
                endedAt: chat.endedAt || '',
                location: chat.location || '',
                browser: chat.browser || '',
                device: chat.device || ''
            };

            if (Array.isArray(chat.messages) && chat.messages.length > 0) {
                chat.messages.forEach((msg, msgIdx) => {
                    expanded.push({
                        ...baseData,
                        messageIndex: msgIdx + 1,
                        messageRole: msg.role || '',
                        messageContent: msg.content || '',
                        messageTimestamp: msg.timestamp || '',
                        totalMessages: chat.messages.length
                    });
                });
            } else {
                expanded.push({
                    ...baseData,
                    messageIndex: '',
                    messageRole: '',
                    messageContent: '',
                    messageTimestamp: '',
                    totalMessages: 0
                });
            }
        });
        
        return expanded;
    },


    // Convert array of objects to CSV string
    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const csv = [headers.join(',')];
        data.forEach(row => {
            const values = headers.map(header => {
                const value = row[header] ?? '';
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            });
            csv.push(values.join(','));
        });
        return csv.join('\n');
    },


    // Only export FAQs
    async exportFAQs() {
        try {
            const { API_BASE_URL } = await import('./config.js');
            const { Utils } = await import('./utils.js');
            const authToken = localStorage.getItem('admin_token');
            const exportBtn = document.getElementById('exportFAQsBtn');
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Exporting...`;
            }
            const response = await fetch(`${API_BASE_URL}/api/admin/export/faqs?format=csv`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken && { Authorization: `Bearer ${authToken}` })
                }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }
            let rawData = await response.text();
            let csvData;
            if (rawData.trim().startsWith('{') || rawData.trim().startsWith('[')) {
                let jsonData = JSON.parse(rawData);
                if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
                    if (Array.isArray(jsonData.data)) {
                        jsonData = jsonData.data;
                    } else if (Array.isArray(jsonData.result)) {
                        jsonData = jsonData.result;
                    } else if (Array.isArray(jsonData.faqs)) {
                        jsonData = jsonData.faqs;
                    }
                }
                const expanded = this.expandFAQs(jsonData);
                csvData = this.convertToCSV(expanded);
            } else {
                csvData = rawData;
            }
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `faqs_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            Utils.showSuccess('Successfully exported FAQs');
        } catch (error) {
            console.error('Export error:', error);
            const { Utils } = await import('./utils.js');
            Utils.showError(`Failed to export FAQs: ${error.message}`);
        } finally {
            const exportBtn = document.getElementById('exportFAQsBtn');
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = `<i class="fas fa-download"></i> Export FAQs`;
            }
        }
    },
};