QueryNest — Smart Customer Support Chatbot
QueryNest is a customer-support chatbot application designed to help website visitors find answers to common questions and connect with support when needed. The project includes a chat widget, an admin dashboard, and a Node.js/Express backend connected to MongoDB.
Project status: Local development. Confirm each feature in your current code before presenting it as production-ready. Public deployment and third-party website embedding should be documented as available only after they have been implemented and tested.

Features
- Interactive chatbot widget for visitor conversations.
- FAQ support to help users find answers to frequently asked questions.
- Popular questions to make common queries easier to access.
- Support ticket creation for queries that need further assistance.
- Chat session handling, including starting and ending sessions.
- FAQ rating flow to collect user feedback.
- Admin dashboard for supported administrative tasks.
- API documentation through Swagger UI.
- Security middleware and rate limiting configured in the Express server.
- MongoDB integration for application data.
Keep only the features that are implemented and working in your current version. Update this list as the project evolves.

Tech Stack
Area	Technology
Backend	Node.js, Express.js
Database	MongoDB, Mongoose
Frontend	HTML, CSS, JavaScript
API documentation	Swagger UI
Security / middleware	Helmet, CORS, rate limiting
Development tools	npm, Git



When the server is running locally on port 3000, open:
- Chatbot demo: http://localhost:3000
- Admin dashboard: http://localhost:3000/admin
- Health endpoint: http://localhost:3000/api/health
- Swagger API docs: http://localhost:3000/api-docs
These are local development URLs. They are not public links and will work only while the application is running on your computer.
