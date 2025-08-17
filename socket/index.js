// socket/index.js
const cookie = require("cookie");
const jwt = require("jsonwebtoken");

const {
  addUser,
  removeSocket,
  emitOnlineUsers,
  updateUserProfile,
  getOnlineUsers,
} = require("./onlineUsers");

const {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
  handleSendPrivateMessage,
} = require("./chatMessages");

const {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  makeUserSpeaker,
  minimizeUser,
} = require("./liveRoomUsers");

const removeUserFromRoomDB = require("../utils/removeUserFromRoomDB");
const Room = require("../models/Room");
const User = require("../models/User");
const Conversation = require("../models/Conversation");

let ioRef;

/* ===========================
 * Helpers de autenticação WS
 * =========================== */

// parseia "a=b; c=d" -> { a: 'b', c: 'd' }
function parseCookies(cookieStr = "") {
  try {
    return cookie.parse(cookieStr || "");
  } catch {
    return {};
  }
}

// Token pode vir por vários lugares no handshake
function getTokenFromSocket(socket) {
  const hs = socket.handshake || {};
  const hdrs = hs.headers || {};
  // 1) handshake.auth.token (recomendado no browser)
  if (hs.auth && hs.auth.token) return hs.auth.token;
  // 2) Authorization: Bearer <token>
  const auth = hdrs.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  // 3) Cookie: token=...
  const cookies = parseCookies(hdrs.cookie);
  if (cookies.token) return cookies.token;
  // 4) Query ?token=...
  if (hs.query && hs.query.token) return hs.query.token;
  return null;
}

// Middleware de auth: anexa userId no socket.data (guests permitidos)
function authMiddleware(io) {
  io.use((socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        // guest permitido; se quiser bloquear, troque por: next(new Error("Unauthorized"))
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = String(decoded.id || decoded._id || decoded.userId);
      return next();
    } catch {
      // token inválido/expirado → segue como guest (ou bloqueie com erro)
      return next();
    }
  });
}

// Garante userId para handlers sensíveis
const requireAuth = (socket, name, fn) => {
  return async (...args) => {
    if (!socket.data?.userId) {
      console.warn(`🚫 ${name} ignorado: socket sem userId`);
      return;
    }
    try {
      await fn(...args);
    } catch (err) {
      console.error(`❌ erro em ${name}:`, err);
    }
  };
};

/* ===================================================
 * Estado local opcional (se precisar para live rooms)
 * =================================================== */
const liveState = { rooms: {} };
const ensureRoom = (roomId) => {
  if (!liveState.rooms[roomId]) {
    liveState.rooms[roomId] = { users: [], speakers: [] };
  }
  return liveState.rooms[roomId];
};

/* ===================================================
 * Presença em DMs: convId -> Map<userId, Set<socketId>> =====
 * =================================================== */
const dmPresence = new Map();

function presenceFor(convId) {
  const k = String(convId);
  if (!dmPresence.has(k)) dmPresence.set(k, new Map());
  return dmPresence.get(k);
}

function addPresence(convId, userId, socketId) {
  const map = presenceFor(convId);
  const uid = String(userId);
  if (!map.has(uid)) map.set(uid, new Set());
  map.get(uid).add(socketId);
  return map;
}

function removePresence(convId, userId, socketId) {
  const k = String(convId);
  const uid = String(userId);
  const map = dmPresence.get(k);
  if (!map) return true; // ninguém mais na conversa

  if (map.has(uid)) {
    map.get(uid).delete(socketId);
    if (map.get(uid).size === 0) map.delete(uid);
  }
  if (map.size === 0) dmPresence.delete(k);

  // true => esse usuário ficou totalmente fora da conversa (todas as abas)
  return !map.has(uid);
}

function currentUsers(convId) {
  const map = dmPresence.get(String(convId));
  return map ? Array.from(map.keys()) : [];
}

/* ===========================
 * Inicialização do Socket.IO
 * =========================== */
module.exports = function initSocket(io) {
  ioRef = io;
  authMiddleware(io);

  io.on("connection", async (socket) => {
    const origin = socket.handshake?.headers?.origin;
    const uid = socket.data?.userId || null;
    console.log(
      "🔌 WS connected from",
      origin || "(unknown origin)",
      uid ? `user=${uid}` : "(guest)"
    );

    // Se autenticado, entra na sala pessoal (room = userId)
    if (uid) {
      socket.join(String(uid));
      const size = io.sockets.adapter.rooms.get(String(uid))?.size || 1;
      console.log(`👥 joined personal room ${uid} size=${size}`);
    } else {
      console.warn("⚠️ Socket sem userId (sem cookie/JWT no handshake?)");
    }

    /* ==========================
     * ONLINE USERS / PRESENÇA
     * ========================== */
    socket.on(
      "addUser",
      requireAuth(socket, "addUser", async () => {
        const user = await User.findById(socket.data.userId)
          .select("_id username profileImage")
          .lean();
        if (!user) return;

        // garante sala pessoal
        socket.join(String(user._id));

        addUser({
          socketId: socket.id,
          userId: String(user._id),
          username: user.username,
          profileImage: user.profileImage,
        });
        emitOnlineUsers(ioRef);
      })
    );

    // socket/index.js
    socket.on("getOnlineUsers", () => {
      socket.emit("onlineUsers", getOnlineUsers());
    });

    socket.on(
      "removeSocket",
      requireAuth(socket, "removeSocket", async () => {
        removeSocket(socket.id);
        emitOnlineUsers(ioRef);
      })
    );

    /* =============
     * CHAT PÚBLICO
     * ============= */

    // 👉 entrar em uma sala de chat (casa com o front)
    socket.on(
      "joinRoomChat",
      requireAuth(socket, "joinRoomChat", async ({ roomId } = {}) => {
        if (!roomId) return;
        roomId = String(roomId);
        socket.join(roomId);
        // opcional: avisar sala
        // ioRef.to(roomId).emit("room:joined", { roomId, userId: socket.data.userId });
      })
    );

    // 👉 sair da sala quando a tela desmonta
    socket.on(
      "leaveRoomChat",
      requireAuth(socket, "leaveRoomChat", async ({ roomId } = {}) => {
        if (!roomId) return;
        roomId = String(roomId);
        socket.leave(roomId);
        // opcional: avisar sala
        // ioRef.to(roomId).emit("room:left", { roomId, userId: socket.data.userId });
      })
    );

    // (Opcional) anti-flood simples para histórico
    const lastHistoryReq = new Map(); // socket.id -> ts
    socket.on(
      "requestChatHistory",
      requireAuth(socket, "requestChatHistory", async ({ roomId } = {}) => {
        if (!roomId) {
          socket.emit("errorMessage", "roomId ausente ao solicitar histórico.");
          return;
        }
        const now = Date.now();
        const last = lastHistoryReq.get(socket.id) || 0;
        if (now - last < 700) return; // evita bursts
        lastHistoryReq.set(socket.id, now);

        await emitChatHistory(socket, String(roomId)); // <- sua função já existente
      })
    );

    // enviar mensagem (garanta que seu handle exige roomId)
    // enviar mensagem
    socket.on(
      "sendMessage",
      requireAuth(socket, "sendMessage", async (payload = {}) => {
        const roomId = String(payload.roomId || "mainChatRoom");
        const rawText = payload.text ?? payload.message; // aceita .text ou .message do front
        console.log("roomId:", roomId, "text:", rawText);

        const text = (rawText || "").trim();
        if (!text) {
          socket.emit("errorMessage", "Mensagem vazia");
          return;
        }

        await handleSendMessage({
          io: ioRef, // 👈 passe a instância do servidor Socket.IO
          socket, // 👈 use socket para erros direcionados
          userId: socket.data.userId,
          payload: { roomId, text },
        });
      })
    );

    // deletar mensagem (idem)
    socket.on(
      "deleteMessage",
      requireAuth(socket, "deleteMessage", async (payload = {}) => {
        await handleDeleteMessage({
          io: ioRef,
          socket,
          userId: socket.data.userId,
          payload, // ideal: conter roomId e messageId
        });
      })
    );

    /* ==================
     * CHAT PRIVADO / DM
     * ================== */

    // Usuário entra numa conversa privada
    socket.on(
      "joinPrivateChat",
      requireAuth(socket, "joinPrivateChat", async ({ conversationId }) => {
        const uid = socket.data.userId; // ✅ vem do token

        const convId = String(conversationId || "");
        if (!convId) return;

        // (recomendado) valida se o usuário pertence à conversa
        const conv = await Conversation.findById(convId)
          .select("participants waitingUser")
          .lean();
        if (!conv) return;

        const parts = (conv.participants || []).map(String);
        const allowed =
          parts.includes(uid) ||
          (conv.waitingUser && String(conv.waitingUser) === uid);
        if (!allowed) {
          console.warn(
            `🚫 user=${uid} tentou entrar em DM sem permissão`,
            convId
          );
          return;
        }

        // entra nas salas
        socket.join(convId);
        socket.join(uid); // sala pessoal opcional

        // presença (conta múltiplos sockets da MESMA pessoa)
        const before = new Set(currentUsers(convId));
        addPresence(convId, uid, socket.id);
        const after = currentUsers(convId);

        // se é a primeira aba desse user na conversa, avisa os outros
        if (!before.has(uid)) {
          const user = await User.findById(uid).select("username").lean();
          socket.to(convId).emit("userJoinedPrivateChat", {
            conversationId: convId,
            joinedUser: { userId: uid, username: user?.username || "Usuário" },
          });
        }

        // snapshot atualizado para todos na conversa
        ioRef.to(convId).emit("currentUsersInPrivateChat", {
          conversationId: convId,
          users: after, // array de userIds
        });

        console.log(`🟢 ${uid} entrou na DM ${convId}`);
      })
    );

    // Usuário sai da conversa privada
    socket.on(
      "leavePrivateChat",
      requireAuth(socket, "leavePrivateChat", async ({ conversationId }) => {
        const uid = socket.data.userId;
        const convId = String(conversationId || "");
        if (!convId) return;

        socket.leave(convId);
        socket.leave(uid);

        // remove este socket; se não sobrou nenhum do usuário, ele saiu "de vez"
        const fullyLeft = removePresence(convId, uid, socket.id);

        if (fullyLeft) {
          ioRef.to(convId).emit("userLeftPrivateChat", {
            conversationId: convId,
            leftUser: { userId: uid },
          });
          // (opcional) mensagem de sistema
          ioRef.to(convId).emit("newPrivateMessage", {
            system: true,
            message: `Usuário saiu da conversa.`,
            conversationId: convId,
            timestamp: new Date(),
          });
        }

        ioRef.to(convId).emit("currentUsersInPrivateChat", {
          conversationId: convId,
          users: currentUsers(convId),
        });

        console.log(`🔴 ${uid} saiu da DM ${convId}`);
      })
    );

    // CHAT PRIVADO / DM
    socket.on(
      "sendPrivateMessage",
      requireAuth(socket, "sendPrivateMessage", async (payload = {}) => {
        const conversationId = String(payload.conversationId || "");
        const message = (payload.text ?? payload.message ?? "").trim();
        const sender = String(socket.data.userId || "");

        if (!conversationId || !message) {
          socket.emit("errorMessage", "Dados de DM incompletos.");
          return;
        }

        await handleSendPrivateMessage({
          io: ioRef,
          socket,
          conversationId,
          sender,
          message,
        });
      })
    );

    /* =================
     * LIVE ROOMS / VOZ
     * ================= */
    socket.on(
      "joinLiveRoom",
      requireAuth(socket, "joinLiveRoom", async ({ roomId }) => {
        if (!roomId) return;
        ensureRoom(roomId);
        await addUserToRoom({
          io: ioRef,
          socket,
          roomId,
          userId: socket.data.userId,
        });
        emitLiveRoomUsers(ioRef, roomId);
      })
    );

    socket.on(
      "leaveLiveRoom",
      requireAuth(socket, "leaveLiveRoom", async ({ roomId }) => {
        if (!roomId) return;
        await removeUserFromRoom({
          io: ioRef,
          socket,
          roomId,
          userId: socket.data.userId,
        });
        emitLiveRoomUsers(ioRef, roomId);
      })
    );

    socket.on(
      "toggleMicrophone",
      requireAuth(socket, "toggleMicrophone", async ({ roomId, on }) => {
        if (!roomId) return;
        await toggleMicrophone({
          io: ioRef,
          roomId,
          userId: socket.data.userId,
          on,
        });
        emitLiveRoomUsers(ioRef, roomId);
      })
    );

    socket.on(
      "joinAsSpeaker",
      requireAuth(socket, "joinAsSpeaker", async ({ roomId }) => {
        if (!roomId) return;
        await makeUserSpeaker({
          io: ioRef,
          roomId,
          userId: socket.data.userId,
        });
        emitLiveRoomUsers(ioRef, roomId);
      })
    );

    socket.on(
      "minimizeUser",
      requireAuth(socket, "minimizeUser", async ({ roomId }) => {
        if (!roomId) return;
        await minimizeUser({
          io: ioRef,
          roomId,
          userId: socket.data.userId,
        });
        emitLiveRoomUsers(ioRef, roomId);
      })
    );

    /* ===========
     * DISCONNECT
     * ========== */
    socket.on("disconnect", async () => {
      try {
        const u = socket.data?.userId;
        removeSocket(socket.id);
        emitOnlineUsers(ioRef); // 🔔 atualiza todo mundo após desconectar
        // opcional: limpeza de presença de salas persistentes
        // await removeUserFromRoomDB(u).catch(()=>{});
      } catch (e) {
        console.error("Erro no disconnect:", e?.message || e);
      }
    });
  });
};
