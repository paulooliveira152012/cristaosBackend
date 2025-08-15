const {
  addUser,
  removeUser,
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

const removeUserFromRoomDB = require("../utils/removeUserFromRoomDB");

const Room = require("../models/Room");
const User = require("../models/User");

let ioRef;

const privateChatPresence = {}; // Ex: { conversationId: [userId1, userId2] }

// wrapper para iniciar socket
module.exports = function (io) {
  // liveUsers online globalmente
  const liveState = { rooms: {} };
  // // roomMessages para chat local
  // const roomMessages = {};
  // // roomSpeakers para quem esta falando na sala
  // const roomSpeakers = {};

  ioRef = io;

  // Function to initialize a room if it doesn't exist
  const ensureRoom = (roomId) => {
    if (!liveState.rooms[roomId]) {
      liveState.rooms[roomId] = { users: [], speakers: [] };
    }
    return liveState.rooms[roomId];
  };

  // 1 - Quando um novo usuário se conecta, criamos um socket exclusivo para ele
  io.on("connection", (socket) => {
    // console.log(`New client connected: ${socket.id}`);

    // ... se houver algum erro...
    const emitError = (message) => {
      socket.emit("error", { message });
    };

    // ... para cada evento que acontecer...
    // socket.onAny((event, args) => {
    //   console.log(`📥🟢 [onAny] Evento recebido: ${event}`, args);
    // });

    // Escuta quando o front-end emite "setup" e coloca o socket na sala com ID do usuário
    socket.on("setup", (userId) => {
      if (!userId) return;
      socket.join(userId); // Adiciona o socket à sala com o ID do usuário
      // console.log(
      //   `✅ Usuário ${userId} entrou na sua sala pessoal via socket.`
      // );
    });

    // 2 - Definimos os eventos que esse socket (usuário) poderá emitir durante a sessão

    // 2.a - emitir usuario online globalmente
    socket.on("userLoggedIn", (user) => {
      // if (!user || !user._id) {
      //   emitError("Invalid user data received for login.");
      //   return;
      // }
      // console.log("user:", user);
      addUser(socket.id, user);
      emitOnlineUsers(io);
    });

    // 2.b - buscar historico de chat
    socket.on("requestChatHistory", ({ roomId }) => {
      if (!roomId) {
        emitError("Room ID is required to fetch chat history.");
        return;
      }
      emitChatHistory(socket, roomId);
    });

    // 2.c - adicionar usuario a uma sala visualmente
    socket.on("joinRoom", async ({ roomId, user, userId }) => {
      if (!roomId) return;

      // MAIN CHAT: sem tocar no DB
      if (roomId === "mainChatRoom") {
        await socket.join(roomId);
        emitChatHistory(socket, roomId);
        socket.emit("successMessage", `Joined room ${roomId} successfully.`);
        return;
      }

      // LIVE ROOM: exige `user`
      const u = user || (userId ? { _id: userId } : null);
      if (!u || !u._id) return;

      await socket.join(roomId);

      const state = ensureRoom(roomId);
      state.users = state.users.filter((x) => String(x._id) !== String(u._id));
      state.users.push(u);

      // toca Mongo apenas em live rooms
      addUserToRoom(roomId, u._id, u, io);

      const room = await Room.findById(roomId);
      if (room?.currentUsersSpeaking?.length) {
        socket.emit("updateSpeakers", room.currentUsersSpeaking);
      }

      io.to(roomId).emit("liveRoomUsers", state.users);
      emitChatHistory(socket, roomId);
      socket.emit("successMessage", `Joined room ${roomId} successfully.`);
    });

    socket.on("joinRoomChat", ({ roomId, user }) => {
      if (!roomId || !user) return;
      socket.join(roomId);
      console.log(`${user.username} entrou na sala de chat ${roomId}`);
    });

    // 2.d subir usuario para quem esta falando
    // 🎤 Subir ao palco
    socket.on("joinAsSpeaker", async ({ roomId, userId }) => {
      if (!roomId || !userId) return;

      await makeUserSpeaker(roomId, userId, io); // <-- persiste (use seu helper)
      const state = ensureRoom(roomId);

      // (opcional) manter cache local alinhado
      const user = await User.findById(userId).select(
        "_id username profileImage"
      );
      if (
        user &&
        !state.speakers.some((u) => String(u._id) === String(userId))
      ) {
        state.speakers.push({
          _id: String(user._id),
          username: user.username,
          profileImage: user.profileImage,
          micOpen: false,
        });
      }

      // fonte da verdade passa a ser o DB:
      const room = await Room.findById(roomId).lean();
      io.to(roomId).emit("updateSpeakers", room?.currentUsersSpeaking || []);
    });

    // 2.e escutando quando microphone for ativado
    socket.on("micStatusChanged", ({ roomId, userId, micOpen }) => {
      toggleMicrophone(roomId, userId, micOpen, io); // use o helper
    });

    // 2.f minimizar a sala
    socket.on("minimizeRoom", ({ roomId, userId, microphoneOn }) => {
      if (!roomId || !userId) return;
      const state = liveState.rooms[roomId];
      if (!state) return;

      const exists = state.users.some((u) => String(u._id) === String(userId));
      if (!exists) return;

      minimizeUser(roomId, userId, true, microphoneOn, io);
      io.in(roomId).emit("userMinimized", {
        userId,
        minimized: true,
        microphoneOn,
      });
    });

    // 2.g sair da sala
    // 🧼 Sair da sala como ouvinte
    socket.on("userLeavesRoom", async ({ roomId, userId }) => {
      if (!roomId || !userId) return;

      // remove do estado e Mongo via util central
      const updatedRoom = await removeUserFromRoomDB(roomId, userId);

      // mantenha cache local consistente
      const state = ensureRoom(roomId);
      state.users = (state.users || []).filter(
        (u) => String(u._id) !== String(userId)
      );
      state.speakers = (state.speakers || []).filter(
        (u) => String(u._id) !== String(userId)
      );

      // saia da sala no socket
      socket.leave(roomId);

      // emita listas atualizadas
      io.to(roomId).emit(
        "liveRoomUsers",
        updatedRoom?.currentUsersInRoom || []
      );
      io.to(roomId).emit(
        "updateSpeakers",
        updatedRoom?.currentUsersSpeaking || []
      );

      // limpe cache se sala vazia
      if (!updatedRoom?.currentUsersInRoom?.length) {
        delete liveState.rooms[roomId];
      }
    });

    // 2.h sair da sala (main chat)
    socket.on("leaveRoom", ({ roomId, userId }) => {
      if (!roomId) return;
      // MainChat não mantém presença; não mexe em liveState nem DB
      if (roomId === "mainChatRoom") {
        socket.leave(roomId);
        // opcional: io.to(roomId).emit("userLeftMain", { userId });
        return;
      }
      // Para salas ao vivo, o certo é userLeavesRoom
      socket.emit("warn", {
        message: "Use 'userLeavesRoom' para salas ao vivo.",
      });
    });

    socket.on("userLoggedOut", () => {
      const removedId = removeUser(socket.id); // padroniza
      const uid = removedId; // pode ser null se não achou
      for (const roomId of Object.keys(liveState.rooms)) {
        removeUserFromRoom(roomId, uid);
        emitLiveRoomUsers(io, roomId);
      }
      emitOnlineUsers(io);
    });

    // 2.i mandar mensagem
    socket.on("sendMessage", (data) => {
      console.log("📥 Nova mensagem recebida:", data);

      const { roomId } = data;
      if (!roomId) {
        emitError("Room ID is required to send a message.");
        return;
      }

      data.profileImage = data.profileImage || "";
      handleSendMessage(io, roomId, data);
    });

    socket.on("deleteMessage", async ({ messageId, userId, roomId }) => {
      if (!roomId || !userId) {
        emitError("Room ID and User ID are required to delete a message.");
        return;
      }
      try {
        await handleDeleteMessage(socket, messageId, userId, roomId);
      } catch (error) {
        emitError("Error deleting the message.");
      }
    });

    // pedir usuarios online
    socket.on("getOnlineUsers", () => {
      const users = getOnlineUsers();
      socket.emit("onlineUsers", users);
    });

    socket.on("disconnect", async () => {
      const userId = removeUser(socket.id);
      if (!userId) return;

      for (const roomId of Object.keys(liveState.rooms)) {
        const updatedRoom = await removeUserFromRoomDB(roomId, userId);

        // ajuste cache
        const state = liveState.rooms[roomId];
        if (state) {
          state.users = (state.users || []).filter(
            (u) => String(u._id) !== String(userId)
          );
          state.speakers = (state.speakers || []).filter(
            (u) => String(u._id) !== String(userId)
          );
        }

        io.to(roomId).emit(
          "liveRoomUsers",
          updatedRoom?.currentUsersInRoom || []
        );
        io.to(roomId).emit(
          "updateSpeakers",
          updatedRoom?.currentUsersSpeaking || []
        );

        if (!updatedRoom?.currentUsersInRoom?.length) {
          delete liveState.rooms[roomId];
        }
      }

      emitOnlineUsers(io);
    });

    // directMessaging
    // Usuário entra numa conversa privada
    socket.on("joinPrivateChat", async ({ conversationId, userId }) => {
      console.log(`conversationId: ${conversationId}, userId: ${userId}`);
      socket.join(conversationId);
      socket.join(userId.toString());

      if (!privateChatPresence[conversationId]) {
        privateChatPresence[conversationId] = [];
      }

      if (!privateChatPresence[conversationId].includes(userId)) {
        privateChatPresence[conversationId].push(userId);
      }

      console.log(`🟢 ${userId} Entrou na conversa privada: ${conversationId}`);

      // 🔔 Envia para os outros membros da sala que esse usuário entrou
      const user = await User.findById(userId).select("username");

      socket.to(conversationId).emit("userJoinedPrivateChat", {
        conversationId,
        joinedUser: {
          userId,
          username: user?.username || "Usuário",
        },
      });

      // Envia de volta quem já está na sala
      const otherUsers = privateChatPresence[conversationId].filter(
        (id) => id !== userId
      );

      io.to(conversationId).emit("currentUsersInPrivateChat", {
        conversationId,
        users: otherUsers,
      });

      console.log(`🟢 ${userId} Entrou na conversa privada: ${conversationId}`);
    });

    // Usuário sai
    // Usuário sai da conversa privada
    socket.on("leavePrivateChat", ({ conversationId, userId, username }) => {
      console.log("socket ao sair da conversa acionado");
      socket.leave(conversationId);
      socket.leave(userId.toString());
      console.log(`🔴 ${username} saiu da conversa privada: ${conversationId}`);

      if (privateChatPresence[conversationId]) {
        privateChatPresence[conversationId] = privateChatPresence[
          conversationId
        ].filter((id) => id !== userId);
      }

      console.log(`🔴 ${username} saiu da conversa privada: ${conversationId}`);

      const systemMsg = {
        system: true,
        message: `${username} saiu da conversa.`,
        conversationId,
        timestamp: new Date(),
      };

      // Enviar para todos que ainda estão na sala
      io.to(conversationId).emit("newPrivateMessage", systemMsg);

      // 🔥 Emitir evento para atualizar UI do outro usuário
      io.to(conversationId).emit("userLeftPrivateChat", {
        conversationId,
        leftUser: { username, userId },
      });

      // Emitir lista atualizada após remoção
      io.to(conversationId).emit("currentUsersInPrivateChat", {
        conversationId,
        users: privateChatPresence[conversationId],
      });
    });

    // Enviar mensagem privada
    socket.on("sendPrivateMessage", (data) => {
      handleSendPrivateMessage(io, socket, data);
    });

    socket.on("privateChatRead", ({ conversationId, userId }) => {
      // Envia esse evento apenas para o usuário em questão
      io.to(userId.toString()).emit("privateChatRead", {
        conversationId,
        userId,
      });
    });
  });
};

// permitir acesso ao io em controllers
module.exports.getIO = () => ioRef;

module.exports.emitAccepted = (conversationId, by) => {
  if (ioRef)
    ioRef.to(conversationId).emit("dm:accepted", { conversationId, by });
};
