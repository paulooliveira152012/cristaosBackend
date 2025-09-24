// socket/index.js
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Room = require("../models/Room")

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

// ===== Config =====
const ONLINE_WINDOW_MS = Number(process.env.ONLINE_WINDOW_MS || 3 * 60 * 1000);

// ===== Auth helpers =====
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
      if (!token) return next(); // guests permitidos
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const currentSv = Number(process.env.SESSIONS_VERSION || 1);
      if (Number(decoded.sv || 1) !== currentSv)
        return next(new Error("unauthorized"));

      const user = await User.findById(decoded.id).select(
        "_id tokenVersion isBanned"
      );
      if (!user) return next(new Error("unauthorized"));
      if (Number(decoded.tv || 0) !== Number(user.tokenVersion || 0))
        return next(new Error("unauthorized"));
      if (user.isBanned) return next(new Error("banned"));

      socket.data.userId = String(user._id);
      socket.join(`user:${user._id}`);
      next();
    } catch (err) {
      next(new Error("unauthorized"));
    }
  });
}
const requireAuth =
  (socket, name, fn) =>
  async (...args) => {
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

// ===== Online list via Mongo (lastHeartbeat) =====
// ===== Online list via Mongo (lastHeartbeat) =====
async function getActiveUsersFromDB() {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);

  return User.find({
    lastHeartbeat: { $gte: cutoff },   // só quem enviou heartbeat dentro da janela
    isBanned: { $ne: true },           // não banidos
    presenceStatus: "active",          // só ativos
  })
  // 👇 [ONLINE: FONTE DA LISTA] Quem aparece "online" no app vem DESTA query
    .select("_id username profileImage lastHeartbeat presenceStatus")
    .lean();
}

async function emitOnlineUsersFromDB(io, socket = null) {
  try {
    const list = await getActiveUsersFromDB();

    // Loga a lista de usuários ativos
    console.log("🔵 Usuários online (ativos):", list);

    // Envia a lista filtrada para o frontend
    (socket || io).emit("onlineUsers", list);
  } catch (err) {
    console.error("❌ Erro ao emitir usuários online:", err);
  }
}



// registra online no connect (opcionalmente marca active agora)
async function registerOnline(socket, io) {
  const uid = socket.data?.userId;
  if (!uid) return;

  // carrega alguns campos úteis no socket
  const user = await User.findById(uid)
    .select("_id username profileImage")
    .lean()
    .catch(() => null);
  if (!user) return;

  socket.data.username = user.username;
  socket.data.profileImage = user.profileImage;
  socket.join(`user:${user._id}`);

  // ✅ [ONLINE+: ADICIONADO AO "ONLINE" DO APP]
  await User.updateOne(
    { _id: uid },
    { $set: { presenceStatus: "active", lastHeartbeat: new Date() } }
  ).catch(() => {});

  // emite lista atualizada
  await emitOnlineUsersFromDB(io);

  // feedback imediato (apenas pro socket)
  const selfList = await getActiveUsersFromDB();
  socket.emit("onlineUsers", selfList);
}

//  limpeza ao disconectar
async function cleanupUserOnDisconnect(userId, io) {
  if (!userId) return;

  const rooms = await Room.find({
    $or: [
      { "currentUsers._id": userId },
      { "currentUsersSpeaking._id": userId },
      { "speakers._id": userId },
    ],
  });

  for (const room of rooms) {
    const uid = String(userId);

    room.currentUsers = (room.currentUsers || []).filter(
      (u) => String(u._id) !== uid
    );
    room.currentUsersSpeaking = (room.currentUsersSpeaking || []).filter(
      (u) => String(u._id) !== uid
    );
    room.speakers = (room.speakers || []).filter((s) => String(s._id) !== uid);

    // se nenhum owner/admin ficou nos speakers, encerra a live
    const privilegedIds = [
      String(room.owner?._id),
      ...(room.admins || []).map((a) => String(a._id)),
    ];
    const stillPrivileged = (room.speakers || []).some((s) =>
      privilegedIds.includes(String(s._id))
    );

    if (!stillPrivileged) {
      room.isLive = false;
      room.speakers = [];
    }

    await room.save();

    // atualiza os clientes
    io.emit("liveRoomUsers", {
      roomId: room._id,
      users: room.currentUsers,
      speakers: room.currentUsersSpeaking,
    });
    io.emit("room:live", {
      roomId: room._id,
      isLive: room.isLive,
      speakersCount: (room.speakers || []).length,
    });
  }
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
    // ===== Online users (busca no DB) =====
    socket.on("getOnlineUsers", async () => {
      try {
        const list = await getActiveUsersFromDB();
        socket.emit("onlineUsers", list);
      } catch {
        socket.emit("onlineUsers", []);
      }
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
        // removeSocket(socket.id);
        // emitOnlineUsers(io);
        await emitOnlineUsersFromDB(io);
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
        console.log("inserindo usuario na sala...")
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
        console.log("removendo usuario da sala...")
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
        // 1) limpa participação em salas/speakers e encerra live se preciso
        await cleanupUserOnDisconnect(uid, io);

        // 2) opcional: marca como idle imediatamente
        await User.updateOne(
          { _id: uid },
          { $set: { presenceStatus: "idle" } }
        ).catch(() => {});
      }

      // 3) reemite a lista de online baseada no Mongo (lastHeartbeat)
      await emitOnlineUsersFromDB(io);
    });
  });
};
