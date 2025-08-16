// server.js
const express = require('express');
const mongoose = require('mongoose');
const routes = require('./routes');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenvFlow = require('dotenv-flow');
const cookieParser = require('cookie-parser');

dotenvFlow.config();

const app = express();
app.set('trust proxy', 1); // cookies SameSite=None; Secure atrás de proxy
const server = http.createServer(app);

// ---- ORIGENS PERMITIDAS (hardcoded) ----
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.15.91:3000',
  process.env.FRONTEND_URL,
  'https://cristaos-frontend.vercel.app', // produção
].filter(Boolean);

// (opcional) liberar qualquer subdomínio vercel.app
const isVercel = (origin) => {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

// Função única de validação de origem (usada em HTTP e WS)
const originCheck = (origin, cb) => {
  if (!origin) return cb(null, true); // healthchecks/curl
  if (allowedOrigins.includes(origin) || isVercel(origin)) return cb(null, true);
  console.warn('🚫 CORS bloqueado para origin:', origin);
  return cb(new Error('Not allowed by CORS'));
};
// ----------------------------------------

// Socket.IO usando a MESMA política
const io = socketIo(server, {
  cors: {
    origin: originCheck,
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    credentials: true,
  },
});

// disponibiliza io no app (p/ controllers emitirem)
app.set('io', io);

// registra handlers de socket
require('./socket')(io);

// CORS do Express usando a MESMA política
app.use(cors({ origin: originCheck, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// rotas
app.use('/api', routes);

// erros globais
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  res.status(500).json({ message: 'An unexpected error occurred.' });
});

// mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP+WS on :${PORT}`);
});
