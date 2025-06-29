const {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  makeUserSpeaker,
  minimizeUser,
} = require("./liveRoomUsers");

const { addUser, removeUser, emitOnlineUsers } = require("./onlineUsers");
const Room = require("../models/Room");

const roomMessages = {}; // { roomId: [message, message] }

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log("📥 Novo socket conectado:", socket.id);

    socket.onAny((event, args) => {
      console.log(`📥🟢 [onAny] Evento recebido: ${event}`, args);
    });

    // 🟢 LOGIN
    socket.on("userLoggedIn", (user) => {
      console.log("✅1");
      if (!user || !user._id) return;
      addUser(socket.id, user);
      emitOnlineUsers(io);
    });

    // 🔴 LOGOUT
    socket.on("userLoggedOut", (user) => {
      console.log("🚪 Usuário deslogou:", user?.username);
      removeUser(socket.id);
      emitOnlineUsers(io);
    });

    // 🔌 DESCONECTAR
    socket.on("disconnect", () => {
      console.log("❌ Socket desconectado:", socket.id);
      removeUser(socket.id);
      emitOnlineUsers(io);
    });

    // 🎧 Usuário **entrou na sala (como ouvinte)**
    socket.on("userJoinsRoom", async ({ roomId, user }) => {
      console.log("🐶 usuario entrou na sala");
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
        console.error("❌ Erro ao adicionar usuário à sala:", err);
      }
    });

    // 🧼 Usuário **saiu da sala**
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
        console.error("❌ Erro ao remover usuário da sala:", err);
      }
    });

    // 🫂 Usuário entrou oficialmente na sala (joinRoom)
    socket.on("joinRoom", ({ roomId, user }) => {
      console.log("✅1");
      if (!roomId || !user) {
        console.error("❌ joinRoom: dados ausentes");
        return;
      }

      socket.join(roomId);
      addUserToRoom(roomId, socket.id, user, io);
      emitLiveRoomUsers(io, roomId);

      // Carrega mensagens antigas do chat
      roomMessages[roomId] = roomMessages[roomId] || [];
      console.log(`💬 ${user?.username} entrou no chat da sala ${roomId}`);
      socket.emit("chatHistory", roomMessages[roomId]);
    });

    // 📝 Enviar mensagem
    socket.on("sendMessage", (msg) => {
      const {
        roomId,
        userId,
        username,
        profileImage,
        message: text,
        timestamp,
      } = msg;
      if (!roomId || !text?.trim()) return;

      const newMessage = {
        _id: Date.now().toString(),
        roomId,
        userId,
        username,
        profileImage,
        message: text,
        timestamp: timestamp || new Date(),
      };

      roomMessages[roomId] = roomMessages[roomId] || [];
      roomMessages[roomId].push(newMessage);

      io.to(roomId).emit("receiveMessage", newMessage);
    });

    // 🗑 Deletar mensagem
    socket.on("deleteMessage", ({ messageId, userId, roomId }) => {
      if (!roomId || !messageId || !userId) return;

      roomMessages[roomId] = roomMessages[roomId]?.filter(
        (msg) => msg._id !== messageId || msg.userId !== userId
      );

      io.to(roomId).emit("messageDeleted", messageId);
    });

    // 🚪 Sair do chat (apenas visualmente)
    socket.on("leaveRoomChat", ({ roomId }) => {
      socket.leave(roomId);
      console.log(`👋 Saiu do chat da sala ${roomId}`);
    });

    // 🎤 Subir ao palco
    socket.on("joinAsSpeaker", ({ roomId, user }) => {
      console.log(`🔊 ${user?.username} subiu ao palco na sala ${roomId}`);
      makeUserSpeaker(roomId, user._id, io); // <- Verifica se essa função emite o evento corretamente
    });

    // 🎙️ Ativar/desativar microfone
    socket.on("toggleMicrophone", ({ roomId, socketId, microphoneOn }) => {
      toggleMicrophone(roomId, socketId, microphoneOn, io);
    });

    // ⬇️ Minimizar sala
    socket.on("minimizeRoom", ({ roomId, userId, microphoneOn }) => {
      minimizeUser(roomId, userId, microphoneOn, io);
    });

    // 🚫 Deixar a sala completamente
    socket.on("leaveRoom", ({ roomId, userId }) => {
      removeUserFromRoom(roomId, userId, io);
      emitLiveRoomUsers(io, roomId);
    });
  });
};
