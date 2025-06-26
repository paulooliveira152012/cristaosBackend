// socketHandlers.js
const {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  makeUserSpeaker,
  minimizeUser,
  initializeRoomIfNeeded,
} = require("./liveRoomUsers");

const { addUser, removeUser, emitOnlineUsers } = require("./onlineUsers");

const roomMessages = {}; // { [roomId]: [ { userId, message, ... } ] }

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("📥 New client connected:", socket.id);

    socket.on("userLoggedIn", (user) => {
      if (!user || !user._id) return;
      addUser(socket.id, user);
      emitOnlineUsers(io);
    });

    socket.on("userLoggedOut", (user) => {
      console.log("🚪 User logged out:", user?.username);
      removeUser(socket.id);
      emitOnlineUsers(io);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
      removeUser(socket.id);
      emitOnlineUsers(io);
    });

    // entrar na sala
    socket.on("joinRoom", ({ roomId, user }) => {
      if (!roomId || !user) {
        console.error("❌ joinRoom: Missing roomId or user");
        return;
      }

      socket.join(roomId);
      addUserToRoom(roomId, socket.id, user, io);
      emitLiveRoomUsers(io, roomId);

      // 👇 Chat automático ao entrar
      roomMessages[roomId] = roomMessages[roomId] || [];
      console.log(
        `💬 ${user?.username} também entrou no chat da sala ${roomId}`
      );
      socket.emit("chatHistory", roomMessages[roomId]);
    });

    // mandar mensagem
    socket.on("sendMessage", (message) => {
      const {
        roomId,
        userId,
        username,
        profileImage,
        message: text,
        timestamp,
      } = message;
      if (!roomId || !text?.trim()) return;

      const newMessage = {
        _id: Date.now().toString(), // ou use uuid se quiser
        userId,
        username,
        profileImage,
        message: text,
        roomId,
        timestamp: timestamp || new Date(),
      };

      roomMessages[roomId] = roomMessages[roomId] || [];
      roomMessages[roomId].push(newMessage);

      // Envia para todos na sala
      io.to(roomId).emit("receiveMessage", newMessage);
    });

    // deletar mensagem
    socket.on("deleteMessage", ({ messageId, userId, roomId }) => {
      if (!roomId || !messageId || !userId) return;

      roomMessages[roomId] = roomMessages[roomId]?.filter(
        (msg) => msg._id !== messageId || msg.userId !== userId
      );

      io.to(roomId).emit("messageDeleted", messageId);
    });

    // sair da sala
    socket.on("leaveRoomChat", ({ roomId }) => {
      socket.leave(roomId);
      console.log(`🚪 Usuário saiu do chat da sala ${roomId}`);
    });

    socket.on("joinAsSpeaker", ({ roomId, userId }) => {
      console.log(`🔊 Usuário ${userId} subiu ao palco na sala ${roomId}`);
      makeUserSpeaker(roomId, userId, io); // ✅ Atualiza isSpeaker no backend
    });

    socket.on("toggleMicrophone", ({ roomId, socketId, microphoneOn }) => {
      toggleMicrophone(roomId, socketId, microphoneOn, io);
    });

    socket.on("minimizeRoom", ({ roomId, userId, microphoneOn }) => {
      minimizeUser(roomId, userId, microphoneOn, io);
    });

    socket.on("leaveRoom", ({ roomId, userId }) => {
      removeUserFromRoom(roomId, userId, io);
      emitLiveRoomUsers(io, roomId);
    });
  });
};
