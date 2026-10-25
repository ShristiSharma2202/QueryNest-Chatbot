const pdfParse = require('pdf-parse');

/**
 * Extract text from PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPDF(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text;
    } catch (error) {
        throw new Error(`Failed to parse PDF: ${error.message}`);

    }
}

// ← REMOVED: module.exports = { extractTextFromPDF };

/**
 * Parse structured FAQs from PDF text
 * Format: Q: question\nA: answer\nPatterns: pattern1, pattern2\nCategory: category\nPriority: 5
 * @param {string} text - Extracted PDF text
 * @returns {Array} Parsed FAQs
 */
function parseStructuredFAQs(text) {
    const faqs = [];
    
    // Split by Q: to find individual Q&A blocks
    const blocks = text.split(/^Q:\s+/gm).filter(block => block.trim());
    
    for (const block of blocks) {
        try {
            const faq = parseSingleBlock(block);
            if (faq) {
                faqs.push(faq);
            }
        } catch (error) {
            console.error('Error parsing FAQ block:', error.message);
        }
    }
    
    return faqs;
}

/**
 * Parse single Q&A block
 * @param {string} block - Single block text
 * @returns {Object|null} Parsed FAQ object
 */
function parseSingleBlock(block) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) return null;
    

    let question = '';
    let answerLines = [];
    let patterns = [];
    let category = 'general';
    let priority = 5;

    // First line is the question
    question = lines[0];

    let inAnswer = false;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        if (lower.startsWith('a:')) {
            inAnswer = true;
            answerLines.push(line.substring(2).trim());
        } else if (lower.startsWith('patterns:')) {
            const patternsStr = line.substring(9).trim();
            patterns = patternsStr.split(',').map(p => p.trim()).filter(p => p);
            inAnswer = false;
        } else if (lower.startsWith('category:')) {
            category = line.substring(9).trim() || 'general';
            inAnswer = false;
        } else if (lower.startsWith('priority:')) {
            priority = parseInt(line.substring(9).trim()) || 5;
            inAnswer = false;
        } else if (inAnswer) {
            answerLines.push(line);
        }
    }
    const answer = answerLines.join(' ').trim();
    
    // Auto-generate patterns if not provided
    if (patterns.length === 0) {
        patterns = generatePatternsFromQuestion(question);
    }
    
    // Validate minimum requirements
    if (!question || question.length < 5 || !answer || answer.length < 10) {
        return null;
    }
    
    return {
        question,
        answer,
        patterns,
        category,
        priority: Math.max(1, Math.min(10, priority))
    };
}

/**
 * Generate patterns from question
 * Extracts first 3-5 significant words as patterns
 * @param {string} question - FAQ question
 * @returns {Array} Generated patterns
 */
function generatePatternsFromQuestion(question) {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are'];
    
    // Split and filter
    const words = question
        .toLowerCase()
        .replace(/[?!.,]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Generate patterns from combinations
    const patterns = [];
    
    // Pattern 1: First 3 significant words
    if (words.length >= 3) {
        patterns.push(words.slice(0, 3).join(' '));
    }
    
    // Pattern 2: First 2 words
    if (words.length >= 2) {
        patterns.push(words.slice(0, 2).join(' '));
    }
    
    // Pattern 3: First word
    if (words.length >= 1) {
        patterns.push(words[0]);
    }
    
    // Pattern 4: Last 2 words if different from first 2
    if (words.length >= 4) {
        const lastTwo = words.slice(-2).join(' ');
        if (!patterns.includes(lastTwo)) {
            patterns.push(lastTwo);
        }
    }
    
    return patterns.slice(0, 5); // Return max 5 patterns
}

module.exports = {
    extractTextFromPDF,
    parseStructuredFAQs
};