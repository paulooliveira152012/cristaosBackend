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
    socket.on(
      "getOnlineUsers",
      requireAuth(socket, "getOnlineUsers", () => {
        socket.emit("onlineUsers", getOnlineUsers()); // snapshot só para quem pediu
      })
    );

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
    socket.on(
      "sendMessage",
      requireAuth(socket, "sendMessage", async (payload) => {
        await handleSendMessage({
          io: ioRef,
          socket,
          userId: socket.data.userId,
          payload,
        });
      })
    );

    socket.on(
      "deleteMessage",
      requireAuth(socket, "deleteMessage", async (payload) => {
        await handleDeleteMessage({
          io: ioRef,
          socket,
          userId: socket.data.userId,
          payload,
        });
      })
    );

    socket.on(
      "requestChatHistory",
      requireAuth(socket, "requestChatHistory", async (payload) => {
        await emitChatHistory({
          io: ioRef,
          socket,
          userId: socket.data.userId,
          payload,
        });
      })
    );

    /* ==================
     * CHAT PRIVADO / DM
     * ================== */
    socket.on(
      "sendPrivateMessage",
      requireAuth(socket, "sendPrivateMessage", async (payload) => {
        await handleSendPrivateMessage({
          io: ioRef,
          socket,
          userId: socket.data.userId,
          payload,
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
