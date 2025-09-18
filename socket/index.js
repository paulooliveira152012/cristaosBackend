// socket/index.js
const cookie = require("cookie");
const Room = require("../models/Room")
const jwt = require("jsonwebtoken");

const {
  addUser,
  removeSocket,
  emitOnlineUsers,
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

const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

/* ===========================
 * Auth helpers
 * =========================== */
function parseCookies(cookieStr = "") {
  try {
    return cookie.parse(cookieStr || "");
  } catch {
    return {};
  }
}
function getTokenFromSocket(socket) {
  const hs = socket.handshake || {};
  const hdrs = hs.headers || {};
  if (hs.auth && hs.auth.token) return hs.auth.token;
  const auth = hdrs.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookies = parseCookies(hdrs.cookie);
  if (cookies.token) return cookies.token;
  if (hs.query && hs.query.token) return hs.query.token;
  return null;
}
function authMiddleware(io) {
  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        // guests permitidos: apenas não coloca userId
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 1) sv (session/global)
      const currentSv = Number(process.env.SESSIONS_VERSION || 1);
      if (Number(decoded.sv || 1) !== currentSv) {
        return next(new Error("unauthorized"));
      }

      // 2) carrega usuário
      const user = await User.findById(decoded.id).select("_id tokenVersion isBanned");
      if (!user) return next(new Error("unauthorized"));

      // 3) tv (tokenVersion por usuário)
      const tokenTv = Number(decoded.tv || 0);
      const userTv = Number(user.tokenVersion || 0);
      if (tokenTv !== userTv) return next(new Error("unauthorized"));

      // 4) ban
      if (user.isBanned) return next(new Error("banned"));

      // OK: anexa no socket e entra na sala do usuário
      socket.data.userId = String(user._id);
      socket.join(`user:${user._id}`);

      next();
    } catch (err) {
      next(new Error("unauthorized"));
    }
  });
}

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

/* ===========================
 * Presença em DMs (simples)
 * =========================== */
const dmPresence = new Map(); // convId -> Map<userId, Set<socketId>>
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
  if (!map) return true;
  if (map.has(uid)) {
    map.get(uid).delete(socketId);
    if (map.get(uid).size === 0) map.delete(uid);
  }
  if (map.size === 0) dmPresence.delete(k);
  return !(map && map.has && map.has(uid));
}
function currentUsers(convId) {
  const map = dmPresence.get(String(convId));
  return map ? Array.from(map.keys()) : [];
}

/* ===========================
 * Util: registrar online
 * =========================== */
async function registerOnline(socket, io) {
  const uid = socket.data?.userId;
  if (!uid) return;
  const user = await User.findById(uid)
    .select("_id username profileImage")
    .lean()
    .catch(() => null);
  if (!user) return;

  // ✨ GUARDE NO SOCKET PARA REUSAR NO LIVE ROOM
  socket.data.username = user.username; // <--- ADICIONE
  socket.data.profileImage = user.profileImage; // <--- ADICIONE

  // sala pessoal (opcional)
  socket.join(`user:${user._id}`);

  addUser({
    socketId: socket.id,
    userId: String(user._id),
    username: user.username,
    profileImage: user.profileImage,
  });

  // broadcast geral da lista
  emitOnlineUsers(io);

  // feedback imediato para quem entrou
  socket.emit("onlineUsers", getOnlineUsers());
}

/* ===========================
 * Inicialização
 * =========================== */
module.exports = function initSocket(io) {
  authMiddleware(io);

  io.on("connection", async (socket) => {
    const uid = socket.data?.userId || null;

    if (uid) {
      // assegura (de novo) que está na sala do user
      socket.join(`user:${uid}`);
      await registerOnline(socket, io);
    } else {
      console.warn("⚠️ WS conectado sem userId (sem cookie/JWT no handshake?)");
    }

    /* ONLINE USERS */
    socket.on("getOnlineUsers", () => {
      socket.emit("onlineUsers", getOnlineUsers());
    });

    socket.on(
      "addUser", // compat legado (se o front emitir)
      requireAuth(socket, "addUser", async () => {
        await registerOnline(socket, io);
      })
    );

    socket.on(
      "removeSocket",
      requireAuth(socket, "removeSocket", async () => {
        removeSocket(socket.id);
        emitOnlineUsers(io);
      })
    );

    /* CHAT PÚBLICO */
    socket.on(
      "joinRoomChat",
      requireAuth(socket, "joinRoomChat", async ({ roomId } = {}) => {
        if (!roomId) return;
        socket.join(String(roomId));
      })
    );

    socket.on(
      "leaveRoomChat",
      requireAuth(socket, "leaveRoomChat", async ({ roomId } = {}) => {
        if (!roomId) return;
        socket.leave(String(roomId));
      })
    );

    const lastHistoryReq = new Map();
    socket.on(
      "requestChatHistory",
      requireAuth(socket, "requestChatHistory", async ({ roomId } = {}) => {
        if (!roomId) return socket.emit("errorMessage", "roomId ausente.");
        const now = Date.now();
        const last = lastHistoryReq.get(socket.id) || 0;
        if (now - last < 700) return;
        lastHistoryReq.set(socket.id, now);
        await emitChatHistory(socket, String(roomId));
      })
    );

    socket.on(
      "sendMessage",
      requireAuth(socket, "sendMessage", async (payload = {}) => {
        const roomId = String(payload.roomId || "mainChatRoom");
        const text = String(payload.text ?? payload.message ?? "").trim();
        if (!text) return socket.emit("errorMessage", "Mensagem vazia");
        await handleSendMessage({
          io,
          socket,
          userId: socket.data.userId,
          payload: { roomId, text },
        });
      })
    );

    socket.on(
      "deleteMessage",
      requireAuth(socket, "deleteMessage", async (payload = {}) => {
        const messageId = payload?.messageId ? String(payload.messageId) : null;

        if (!messageId) {
          return socket.emit("errorMessage", "Missing messageId");
        }

        await handleDeleteMessage({
          io,
          socket,
          userId: socket.data.userId, // do token
          messageId,
        });
      })
    );

    /* DMs */
    socket.on(
      "joinPrivateChat",
      requireAuth(socket, "joinPrivateChat", async ({ conversationId }) => {
        const uid = socket.data.userId;
        const convId = String(conversationId || "");
        if (!convId) return;

        const conv = await Conversation.findById(convId)
          .select("participants waitingUser")
          .lean();
        if (!conv) return;
        const parts = (conv.participants || []).map(String);
        const allowed =
          parts.includes(uid) ||
          (conv.waitingUser && String(conv.waitingUser) === uid);
        if (!allowed) return;

        socket.join(convId);
        socket.join(uid);

        const before = new Set(currentUsers(convId));
        addPresence(convId, uid, socket.id);
        const after = currentUsers(convId);

        if (!before.has(uid)) {
          const u = await User.findById(uid).select("username").lean();
          socket.to(convId).emit("userJoinedPrivateChat", {
            conversationId: convId,
            joinedUser: { userId: uid, username: u?.username || "Usuário" },
          });
        }

        io.to(convId).emit("currentUsersInPrivateChat", {
          conversationId: convId,
          users: after,
        });
      })
    );

    socket.on(
      "leavePrivateChat",
      requireAuth(socket, "leavePrivateChat", async ({ conversationId }) => {
        const uid = socket.data.userId;
        const convId = String(conversationId || "");
        if (!convId) return;

        socket.leave(convId);
        socket.leave(uid);

        const fullyLeft = removePresence(convId, uid, socket.id);
        if (fullyLeft) {
          io.to(convId).emit("userLeftPrivateChat", {
            conversationId: convId,
            leftUser: { userId: uid },
          });
          // ❌ NÃO emita "newPrivateMessage" aqui
        }

        io.to(convId).emit("currentUsersInPrivateChat", {
          conversationId: convId,
          users: currentUsers(convId),
        });
      })
    );

    socket.on(
      "sendPrivateMessage",
      requireAuth(socket, "sendPrivateMessage", async (payload = {}) => {
        const conversationId = String(payload.conversationId || "");
        const message = String(payload.text ?? payload.message ?? "").trim();
        const sender = String(socket.data.userId || "");
        if (!conversationId || !message)
          return socket.emit("errorMessage", "Dados de DM incompletos.");
        await handleSendPrivateMessage({
          io,
          socket,
          conversationId,
          sender,
          message,
        });
      })
    );

    /* LIVE ROOMS */
    socket.on(
      "joinLiveRoom",
      requireAuth(socket, "joinLiveRoom", async ({ roomId }) => {
        if (!roomId) return;
        socket.join(String(roomId));
        await addUserToRoom({ io, socket, roomId, userId: socket.data.userId });
        emitLiveRoomUsers(io, roomId, socket); // snapshot para quem entrou
        emitLiveRoomUsers(io, roomId); // e broadcast p/ todos
      })
    );

    socket.on(
      "leaveLiveRoom",
      requireAuth(socket, "leaveLiveRoom", async ({ roomId }) => {
        if (!roomId) return;
        socket.leave(String(roomId));
        await removeUserFromRoom({ io, roomId, userId: socket.data.userId });
        emitLiveRoomUsers(io, roomId);
      })
    );

    socket.on(
      "toggleMicrophone",
      requireAuth(socket, "toggleMicrophone", async ({ roomId, on }) => {
        if (!roomId) return;
        await toggleMicrophone({ io, roomId, userId: socket.data.userId, on });
        emitLiveRoomUsers(io, roomId);
      })
    );

    socket.on(
      "joinAsSpeaker",
      requireAuth(socket, "joinAsSpeaker", async ({ roomId, on }) => {
        if (!roomId) return;
        //  garante que a sala e o usuário existem no registro
        await addUserToRoom({ io, socket, roomId, userId: socket.data.userId });
        await makeUserSpeaker({ io, roomId, userId: socket.data.userId, on });
        emitLiveRoomUsers(io, roomId);
      })
    );

    socket.on(
      "minimizeUser",
      requireAuth(socket, "minimizeUser", async ({ roomId }) => {
        if (!roomId) return;
        await minimizeUser({ io, roomId, userId: socket.data.userId });
        emitLiveRoomUsers(io, roomId);
      })
    );

    /* DISCONNECT */
    socket.on("disconnect", async () => {
      const uid = socket.data?.userId;
      if (uid) {
        // limpa presença de DMs para este socket
        for (const [convId, map] of dmPresence.entries()) {
          const s = map.get(String(uid));
          if (s && s.has(socket.id)) {
            removePresence(convId, uid, socket.id);
            io.to(convId).emit("currentUsersInPrivateChat", {
              conversationId: convId,
              users: currentUsers(convId),
            });
          }
        }
      }
      removeSocket(socket.id);
      emitOnlineUsers(io);

       try {
      // 🔎 encontre todas as salas onde esse user é speaker
      const rooms = await Room.find({ "currentUsersSpeaking._id": uid });
      for (const room of rooms) {
        // tira da lista de speakers
        room.speakers = room.speakers.filter(
          (s) => String(s._id) !== String(uid)
        );

        // se nenhum owner/admin sobrou nos speakers, encerra live
        const stillPrivileged = (room.speakers || []).some((s) =>
          [String(room.owner?._id), ...(room.admins || []).map((a) => String(a._id))].includes(String(s._id))
        );

        if (!stillPrivileged) {
          room.isLive = false;
          room.speakers = [];
        }

        await room.save();

        // emite para todos os clients
        io.emit("room:live", {
          roomId: room._id,
          isLive: room.isLive,
          speakersCount: (room.speakers || []).length,
        });
      }
    } catch (err) {
      console.error("Erro ao processar disconnect speaker:", err);
    }
      
    });
  });
};
