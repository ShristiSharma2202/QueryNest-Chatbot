// Send new admin credentials email
const sendAdminCredentials = async ({ to, name, username, password }) => {
    if (!transporter) {
        await initializeTransporter();
    }
    if (!transporter) {
        throw new Error('Email service is not configured. Please set email environment variables.');
    }
    if (!isValidEmail(to)) {
        throw new Error(`Invalid email address: ${to}`);
    }
    if (!checkRateLimit(to)) {
        throw new Error(`Rate limit exceeded for ${to}. Please try again later.`);
    }
    const companyName = process.env.COMPANY_NAME || 'QueryNest';
    const htmlContent = `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f4;}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px #0001;}.header{background:#007bff;color:#fff;padding:30px 20px;text-align:center;}.content{padding:30px 20px;}.footer{background:#f4f4f4;text-align:center;padding:20px;color:#666;font-size:12px;}</style></head><body><div class="container"><div class="header"><h1>Welcome to ${escapeHtml(companyName)}</h1></div><div class="content"><p>Dear ${escapeHtml(name)},</p><p>Your admin account has been created.</p><p><strong>Username:</strong> ${escapeHtml(username)}<br><strong>Password:</strong> ${escapeHtml(password)}</p><p>Please log in and change your password immediately for security.</p><p>If you did not request this account, please contact support.</p></div><div class="footer"><p>© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p></div></div></body></html>
    `;
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: `Your Admin Account for ${companyName}`,
        html: htmlContent,
        text: `Dear ${name},\n\nYour admin account has been created.\nUsername: ${username}\nPassword: ${password}\n\nPlease log in and change your password immediately.\n\nIf you did not request this account, please contact support.\n\n${companyName}`
    };
    return await sendEmailWithRetry(mailOptions);
};

const nodemailer = require('nodemailer');
require('dotenv').config();

// HTML escaping utility to prevent XSS
const escapeHtml = (text) => {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// Email validation utility
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Rate limiting map (in production, use Redis or similar)
const emailRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_EMAILS_PER_WINDOW = 10;

const checkRateLimit = (email) => {
    const now = Date.now();
    const userLimit = emailRateLimit.get(email) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    
    if (now > userLimit.resetTime) {
        // Reset the limit
        emailRateLimit.set(email, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    if (userLimit.count >= MAX_EMAILS_PER_WINDOW) {
        return false;
    }
    
    userLimit.count++;
    emailRateLimit.set(email, userLimit);
    return true;
};

// Validate email configuration
const validateEmailConfig = () => {
    const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing email configuration: ${missing.join(', ')}`);
    }
    
    if (!isValidEmail(process.env.EMAIL_FROM)) {
        throw new Error('EMAIL_FROM must be a valid email address');
    }
};

// Initialize transporter
let transporter = null;

const initializeTransporter = async () => {
    if (transporter) return transporter;
    
    try {
        validateEmailConfig();
        
        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT),
            secure: parseInt(process.env.EMAIL_PORT) === 465,
            connectionTimeout: 10000, // 10 seconds
            greetingTimeout: 10000,
            socketTimeout: 10000,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            pool: true, // Use pooled connections
            maxConnections: 5,
            maxMessages: 100
        });
        
        // Await verification
        await transporter.verify();
        console.log('✅ Email service initialized successfully!');
        
        return transporter;
    } catch (error) {
        console.error('❌ Email service initialization failed:', error.message);
        if (error.code === 'EAUTH') {
            console.warn('\n⚠️  Email Configuration Issue:');
            console.warn('Please verify your email credentials in the .env file:');
            console.warn('- EMAIL_USER: Should be your Gmail address');
            console.warn('- EMAIL_PASSWORD: Should be your App Password (not your regular password)');
            console.warn('- For Gmail: https://myaccount.google.com/apppasswords\n');
        }
        throw error;
    }
};

// Retry logic for sending emails
const sendEmailWithRetry = async (mailOptions, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully on attempt ${attempt}:`, info.messageId);
            return info;
        } catch (error) {
            lastError = error;
            console.warn(`⚠️  Email send attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error('❌ All email send attempts failed');
    throw lastError;
};

// Generate ticket reply HTML template
const generateTicketReplyTemplate = (data) => {
    const { ticketId, customerName, originalMessage, replyMessage, adminName } = data;
    const companyName = process.env.COMPANY_NAME || 'QueryNest';
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #f9f9f9;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .header {
                    background-color: #007bff;
                    color: white;
                    padding: 30px 20px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    background-color: white;
                    padding: 30px 20px;
                }
                .ticket-info {
                    background-color: #f0f0f0;
                    padding: 15px;
                    border-left: 4px solid #007bff;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .ticket-info strong {
                    color: #007bff;
                }
                .message-box {
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                    border: 1px solid #e0e0e0;
                }
                .original-message {
                    background-color: #fff3cd;
                    padding: 15px;
                    border-left: 4px solid #ffc107;
                    margin: 15px 0;
                    border-radius: 4px;
                }
                .footer {
                    background-color: #f4f4f4;
                    text-align: center;
                    padding: 20px;
                    color: #666;
                    font-size: 12px;
                }
                h3 {
                    color: #333;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Support Ticket Reply</h1>
                </div>
                <div class="content">
                    <p>Dear ${escapeHtml(customerName)},</p>
                    
                    <p>Thank you for contacting us! We have a response to your support ticket.</p>
                    
                    <div class="ticket-info">
                        <strong>Ticket ID:</strong> ${escapeHtml(ticketId)}<br>
                        <strong>Status:</strong> Responded<br>
                        <strong>Response From:</strong> ${escapeHtml(adminName)}
                    </div>
                    
                    <h3>Your Original Message:</h3>
                    <div class="original-message">
                        <p>${escapeHtml(originalMessage).replace(/\n/g, '<br>')}</p>
                    </div>
                    
                    <h3>Our Response:</h3>
                    <div class="message-box">
                        <p>${escapeHtml(replyMessage).replace(/\n/g, '<br>')}</p>
                    </div>
                    
                    <p>If you have any follow-up questions or concerns, please don't hesitate to reply to this email or visit your ticket dashboard.</p>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
                    <p>This is an automated email. Please do not reply directly to this message.</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

// Generate ticket confirmation HTML template
const generateTicketConfirmationTemplate = (data) => {
    const { ticketId, customerName, message } = data;
    const companyName = process.env.COMPANY_NAME || 'QueryNest';
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #f9f9f9;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .header {
                    background-color: #28a745;
                    color: white;
                    padding: 30px 20px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    background-color: white;
                    padding: 30px 20px;
                }
                .ticket-info {
                    background-color: #f0f0f0;
                    padding: 15px;
                    border-left: 4px solid #28a745;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .ticket-info strong {
                    color: #28a745;
                }
                .message-box {
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                    border: 1px solid #e0e0e0;
                }
                .footer {
                    background-color: #f4f4f4;
                    text-align: center;
                    padding: 20px;
                    color: #666;
                    font-size: 12px;
                }
                h3 {
                    color: #333;
                    margin-top: 20px;
                }
                .highlight {
                    background-color: #fff3cd;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✓ Support Ticket Received</h1>
                </div>
                <div class="content">
                    <p>Dear ${escapeHtml(customerName)},</p>
                    
                    <p>Thank you for submitting a support ticket. We have received your request and will get back to you as soon as possible.</p>
                    
                    <div class="ticket-info">
                        <strong>Ticket ID:</strong> ${escapeHtml(ticketId)}<br>
                        <strong>Status:</strong> Received<br>
                        <strong>Created:</strong> ${new Date().toLocaleString()}
                    </div>
                    
                    <h3>Your Message:</h3>
                    <div class="message-box">
                        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
                    </div>
                    
                    <p>Our support team will review your ticket and respond within 24 hours.</p>
                    <p>Your ticket ID is <span class="highlight">${escapeHtml(ticketId)}</span>. Please keep this for your reference.</p>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
                    <p>This is an automated email. Please do not reply directly to this message.</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

// Send ticket reply email
const sendTicketReply = async (data) => {
    if (!transporter) {
        await initializeTransporter();
    }
    
    if (!transporter) {
        throw new Error('Email service is not configured. Please set email environment variables.');
    }
    
    const { to, ticketId, customerName, originalMessage, replyMessage, adminName, attachments } = data;
    
    // Validate email address
    if (!isValidEmail(to)) {
        throw new Error(`Invalid email address: ${to}`);
    }
    
    // Check rate limit
    if (!checkRateLimit(to)) {
        throw new Error(`Rate limit exceeded for ${to}. Please try again later.`);
    }
    
    const htmlContent = generateTicketReplyTemplate(data);
    
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: to,
        subject: `Reply to Support Ticket #${ticketId}`,
        html: htmlContent,
        text: `Support Ticket Reply\n\nDear ${customerName},\n\nTicket ID: ${ticketId}\nResponse from: ${adminName}\n\nYour message: ${originalMessage}\n\nOur response: ${replyMessage}`,
        attachments: attachments || []
    };
    
    return await sendEmailWithRetry(mailOptions);
};

// Send ticket confirmation email
const sendTicketConfirmation = async (data) => {
    if (!transporter) {
        await initializeTransporter();
    }
    
    if (!transporter) {
        throw new Error('Email service is not configured. Please set email environment variables.');
    }
    
    const { to, ticketId, customerName, message, attachments } = data;
    
    // Validate email address
    if (!isValidEmail(to)) {
        throw new Error(`Invalid email address: ${to}`);
    }
    
    // Check rate limit
    if (!checkRateLimit(to)) {
        throw new Error(`Rate limit exceeded for ${to}. Please try again later.`);
    }
    
    const htmlContent = generateTicketConfirmationTemplate(data);
    
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: to,
        subject: `Ticket #${ticketId} Received - We're Here to Help!`,
        html: htmlContent,
        text: `Support Ticket Received\n\nDear ${customerName},\n\nTicket ID: ${ticketId}\n\nYour message has been received.\n\nMessage: ${message}`,
        attachments: attachments || []
    };
    
    return await sendEmailWithRetry(mailOptions);
};

// Graceful shutdown
const closeTransporter = async () => {
    if (transporter) {
        transporter.close();
        console.log('Email transporter closed');
    }
};

// Initialize on module load (but don't await to avoid blocking)
initializeTransporter().catch(err => {
    console.error('Failed to initialize email service on startup:', err.message);
});

module.exports = {
    sendTicketReply,
    sendTicketConfirmation,
    sendAdminCredentials,
    initializeTransporter,
    closeTransporter
};
