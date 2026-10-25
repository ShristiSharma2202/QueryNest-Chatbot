const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('dotenv').config();

// Import routes
const chatRoutes = require('./routes/chat');
const ticketRoutes = require('./routes/tickets');
const faqRoutes = require('./routes/faqs');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;



const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "QueryNest Chatbot API",
            version: "1.0.0",
            description: "REST API Documentation for QueryNest Chatbot"
        },
        servers: [
            {
                url: "http://localhost:3000"
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT"
                }
            }
        },
        security: [
            {
                bearerAuth: []
            }
        ]
    },
    apis: ["./routes/*.js"]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);


// Validate critical environment variables
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    console.error('❌ SECURITY WARNING: Please set a strong JWT_SECRET in your .env file!');
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

if (process.env.ADMIN_PASSWORD === 'Admin123!' || process.env.ADMIN_PASSWORD === 'ChangeMe123!@#') {
    console.warn('⚠️  WARNING: Please change the default admin password!');
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Static files middleware (serve frontend)
app.use(express.static(path.join(__dirname, 'widget')));
// Serve admin assets (CSS/JS) statically under /admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// MongoDB connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.NODE_ENV === 'production' 
            ? process.env.MONGODB_URI_PROD 
            : process.env.MONGODB_URI;
            
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        });
        console.log('🚀 MongoDB connected successfully!');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('\n📋 To fix this issue, you have two options:');
        console.log('1. Install MongoDB locally: https://www.mongodb.com/try/download/community');
        console.log('2. Use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas');
        console.log('\n⚠️  Running in LIMITED MODE - database features will not work!\n');
        
        // Don't exit in development, just warn
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

// Connect to database
connectDB();

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'QueryNest Chatbot API is running!',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// MongoDB availability middleware
app.use('/api/*', (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            error: 'Database unavailable',
            message: 'MongoDB connection is not established. Please set up MongoDB.',
            fallback: true
        });
    }
    next();
});

// API routes
app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);

// Serve the main chatbot widget
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'widget', 'index.html'));
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin/index.html'));
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path,
        method: req.method 
    });
});

// Handle all other routes (for SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'widget', 'index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('❌ Server Error:', error);
    
    if (process.env.NODE_ENV === 'development') {
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            stack: error.stack
        });
    } else {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Something went wrong!'
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 QueryNest Chatbot Server running on port ${PORT}`);
    console.log(`📱 Widget: http://localhost:${PORT}`);
    console.log(`🛠️  Admin: http://localhost:${PORT}/admin`);
    console.log(`🔍 Health: http://localhost:${PORT}/api/health`);
    console.log(`📖 Swagger Docs: http://localhost:${PORT}/api-docs`);
});

module.exports = app;