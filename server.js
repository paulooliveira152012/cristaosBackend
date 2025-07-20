// Import required modules
const express = require('express');
const mongoose = require('mongoose');
// const dotenv = require('dotenv');
const routes = require('./routes');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenvFlow = require('dotenv-flow')
const cookieParser = require("cookie-parser");


// Load environment variables from .env file
// dotenv.config();

dotenvFlow.config()


console.log("Ambiente atual:", process.env.NODE_ENV);
console.log("URL de verificação:", process.env.VERIFICATION_URL);

// 0 - Initialize express app
const app = express();

// Create an HTTP server that wraps the Express app
const server = http.createServer(app);

// Define allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.15.91:3000',
  'https://cristaos-frontend.vercel.app',         // com hífen
  'https://www.cristaos-frontend.vercel.app',      // com www, se tiver
];

// Initialize Socket.IO (locally)
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "DELETE", "PUT"],
    credentials: true,
  }
});


// .index.js e socketHandlers.js sao necessarios... preciso juntar ambos em um so!

// Import the Socket.IO handling logic from socket/index.js
require('./socket')(io); // Assuming you handle your socket logic in `socket/index.js`
// require('./socket/socketHandlers')(io);





// 1st
// Set up CORS configuration for different environments
// Set up CORS for API
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));


// 2nd cookieParser 
app.use(cookieParser()); // <--- ESSENCIAL para ler cookies!

// 3rd JSON parser
// Middleware to parse JSON and handle CORS
app.use(express.json());

// 4th Rotas
// Use the imported routes for the API
app.use('/api', routes);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'An unexpected error occurred.' });
});

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });




// Set the port for the server (use environment variable if available, otherwise default to 5001)
const PORT = process.env.PORT || 5001;

// Start the server and listen on the specified port
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});