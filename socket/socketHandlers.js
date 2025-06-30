// socket/socketHandlers.js

const {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  makeUserSpeaker,
  minimizeUser,
  liveRoomUsers, // importante para acesso direto
} = require("./liveRoomUsers");

const { addUser, removeUser, emitOnlineUsers } = require("./onlineUsers");
const {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
} = require("./chatMessages");

const Room = require("../models/Room");

const roomMessages = {}; // Chat local na RAM
const roomSpeakers = {}; // Palco local na RAM

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("📥 Novo socket conectado:", socket.id);

    socket.onAny((event, args) => {
      console.log(`📥🟢 [onAny] Evento recebido: ${event}`, args);
    });

    // 🔐 LOGIN
    socket.on("userLoggedIn", (user) => {
      if (!user || !user._id) return;
      addUser(socket.id, user);
      emitOnlineUsers(io);
    });

    // 🔓 LOGOUT
    socket.on("userLoggedOut", ({ userId }) => {
      removeUser(socket.id);

      // Remover de todas as salas
      Object.keys(liveRoomUsers).forEach((roomId) => {
        removeUserFromRoom(roomId, userId);
        emitLiveRoomUsers(io, roomId);
        io.in(roomId).emit("userLeft", { userId });
      });

      emitOnlineUsers(io);
    });

    // 🔌 DESCONECTAR
    socket.on("disconnect", () => {
      console.log("❌ Socket desconectado:", socket.id);
      const user = removeUser(socket.id);

      Object.keys(roomSpeakers).forEach((roomId) => {
        roomSpeakers[roomId] = roomSpeakers[roomId].filter(
          (u) => u.socketId !== socket.id
        );
        io.to(roomId).emit("updateSpeakers", roomSpeakers[roomId]);
      });

      if (user && user._id) {
        Object.keys(liveRoomUsers).forEach((roomId) => {
          removeUserFromRoom(roomId, user._id);
          emitLiveRoomUsers(io, roomId);
          io.in(roomId).emit("userLeft", { userId: user._id });
        });
      }
      emitOnlineUsers(io);
    });

    // 🎧 Entrar como ouvinte (visualmente)
    socket.on("userJoinsRoom", async ({ roomId, user }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        const alreadyIn = room.currentUsersInRoom.some(
          (u) => u._id.toString() === user._id
        );

        if (!alreadyIn) {
          room.currentUsersInRoom.push(user);
          await room.save();
        }

        io.to(roomId).emit("currentUsersInRoom", room.currentUsersInRoom);
      } catch (err) {
        console.error("❌ Erro ao adicionar ouvinte à sala:", err);
      }
    });

    // 🧼 Sair da sala como ouvinte
    socket.on("userLeavesRoom", async ({ roomId, userId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        room.currentUsersInRoom = room.currentUsersInRoom.filter(
          (u) => u._id.toString() !== userId
        );
        await room.save();

        io.to(roomId).emit("currentUsersInRoom", room.currentUsersInRoom);
      } catch (err) {
        console.error("❌ Erro ao remover ouvinte da sala:", err);
      }
    });

    // 🫂 Join oficial à sala (como membro)
    socket.on("joinRoom", async ({ roomId, user }) => {
      if (!user || !roomId) return;

      await socket.join(roomId);
      addUserToRoom(roomId, socket.id, user, io);
      emitLiveRoomUsers(io, roomId);

      roomMessages[roomId] = roomMessages[roomId] || [];
      socket.emit("chatHistory", roomMessages[roomId]);
    });

    // 📝 Enviar mensagem
    socket.on("sendMessage", (msg) => {
      const { roomId, userId, username, profileImage, message: text } = msg;
      if (!roomId || !text?.trim()) return;

      const newMsg = {
        _id: Date.now().toString(),
        roomId,
        userId,
        username,
        profileImage,
        message: text,
        timestamp: new Date(),
      };

      roomMessages[roomId] = roomMessages[roomId] || [];
      roomMessages[roomId].push(newMsg);
      io.to(roomId).emit("receiveMessage", newMsg);
    });

    // 🗑 Deletar mensagem
    socket.on("deleteMessage", ({ messageId, userId, roomId }) => {
      if (!roomId || !messageId || !userId) return;

      roomMessages[roomId] = roomMessages[roomId]?.filter(
        (msg) => msg._id !== messageId || msg.userId !== userId
      );

      io.to(roomId).emit("messageDeleted", messageId);
    });

    // 🎤 Subir ao palco
    socket.on("joinAsSpeaker", ({ roomId, user }) => {
      if (!roomId || !user) return;
      if (!roomSpeakers[roomId]) roomSpeakers[roomId] = [];

      const alreadyIn = roomSpeakers[roomId].some((u) => u._id === user._id);
      if (!alreadyIn) roomSpeakers[roomId].push(user);

      io.to(roomId).emit("updateSpeakers", roomSpeakers[roomId]);
      makeUserSpeaker(roomId, user._id, io);
    });

    // 🎙️ Ativar/desativar mic
    socket.on("toggleMicrophone", ({ roomId, socketId, microphoneOn }) => {
      toggleMicrophone(roomId, socketId, microphoneOn, io);
    });

    // ⬇️ Minimizar sala
    socket.on("minimizeRoom", ({ roomId, userId, microphoneOn }) => {
      minimizeUser(roomId, userId, microphoneOn, io);
    });

    // 🚪 Sair da sala
    socket.on("leaveRoom", ({ roomId, userId }) => {
      removeUserFromRoom(roomId, userId);
      emitLiveRoomUsers(io, roomId);
      io.in(roomId).emit("userLeft", { userId });
      socket.leave(roomId);
    });
  });
};
