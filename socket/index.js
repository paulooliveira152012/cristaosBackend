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
  liveRoomUsers,
} = require("./liveRoomUsers");

const removeUserFromRoomDB = require("../utils/removeUserFromRoomDB");

const Room = require("../models/Room");
const User = require("../models/User");

const privateChatPresence = {}; // Ex: { conversationId: [userId1, userId2] }

// wrapper para iniciar socket
module.exports = function (io) {
  // liveUsers online globalmente
  const liveRoomUsers = {};
  // roomMessages para chat local
  const roomMessages = {};
  // roomSpeakers para quem esta falando na sala
  const roomSpeakers = {};

  // Function to initialize a room if it doesn't exist
  const initializeRoomIfNeeded = (roomId) => {
    if (!liveRoomUsers[roomId]) {
      liveRoomUsers[roomId] = []; // Create an empty array for the room
    }
  };

  // 1 - Quando um novo usuário se conecta, criamos um socket exclusivo para ele
  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

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
      console.log("user:", user);
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
    // 2.c - adicionar usuario a uma sala visualmente
    socket.on("joinRoom", async ({ roomId, user }) => {
      if (!user || !roomId) {
        emitError("User or Room ID is required to join the room.");
        return;
      }

      try {
        await socket.join(roomId);

        // 🧹 Garante estrutura do cache
        if (!liveRoomUsers[roomId]) {
          liveRoomUsers[roomId] = { users: [], speakers: [] };
        }

        // 🧼 Remove duplicatas de usuários
        liveRoomUsers[roomId].users = liveRoomUsers[roomId].users.filter(
          (u) => u._id !== user._id
        );

        // ➕ Adiciona novo usuário à lista local
        liveRoomUsers[roomId].users.push(user);

        // 🧠 Salva no MongoDB (assumindo que addUserToRoom faz isso)
        addUserToRoom(roomId, user._id, user, io);

        // 🎙️ Enviar lista atual de oradores ao usuário
        const room = await Room.findById(roomId);
        if (room?.currentUsersSpeaking?.length) {
          socket.emit("updateSpeakers", room.currentUsersSpeaking);
        }

        // 📣 Enviar lista atual de ouvintes para todos da sala
        io.to(roomId).emit("liveRoomUsers", liveRoomUsers[roomId].users);

        // 💬 Histórico do chat
        emitChatHistory(socket, roomId);

        // ✅ Confirmação
        socket.emit("successMessage", `Joined room ${roomId} successfully.`);
      } catch (error) {
        emitError(`Error joining room: ${error.message}`);
      }
    });

    socket.on("joinRoomChat", ({ roomId, user }) => {
      if (!roomId || !user) return;
      socket.join(roomId);
      console.log(`${user.username} entrou na sala de chat ${roomId}`);
    });

    // 2.d subir usuario para quem esta falando
    // 🎤 Subir ao palco
    socket.on("joinAsSpeaker", async ({ roomId, userId }) => {
      console.log("socket joinAsSpeaker alcançada...");

      if (!roomId || !userId) return;

      try {
        const user = await User.findById(userId).select(
          "_id username profileImage"
        );
        if (!user) {
          console.warn("Usuário não encontrado para subir ao palco.");
          return;
        }

        if (!liveRoomUsers[roomId]) {
          liveRoomUsers[roomId] = { speakers: [] };
        } else if (!Array.isArray(liveRoomUsers[roomId].speakers)) {
          liveRoomUsers[roomId].speakers = [];
        }

        const alreadySpeaker = liveRoomUsers[roomId].speakers.some(
          (u) => u._id.toString() === userId
        );

        if (!alreadySpeaker) {
          liveRoomUsers[roomId].speakers.push({
            _id: user._id.toString(),
            username: user.username,
            profileImage: user.profileImage,
            micOpen: false, // começa com mic desligado
          });
          console.log(`✅ ${user.username} subiu ao palco na sala ${roomId}`);
        } else {
          console.log(`ℹ️ ${user.username} já está no palco.`);
        }

        io.to(roomId).emit("updateSpeakers", liveRoomUsers[roomId].speakers);
      } catch (err) {
        console.error("❌ Erro ao processar joinAsSpeaker:", err);
      }
    });

    // 2.e escutando quando microphone for ativado
    socket.on("micStatusChanged", ({ roomId, userId, micOpen }) => {
      const room = liveRoomUsers[roomId];

      if (!room || !Array.isArray(room.speakers)) return;

      const user = room.speakers.find((u) => u._id === userId);

      if (user) {
        user.micOpen = micOpen;
        console.log(`🎙️ Mic do usuário ${user.username} agora está ${micOpen}`);
        io.to(roomId).emit("updateSpeakers", room.speakers);
      }
    });

    // 🎙️ Ativar/desativar mic
    socket.on("toggleMicrophone", ({ roomId, socketId, microphoneOn }) => {
      toggleMicrophone(roomId, socketId, microphoneOn, io);
    });

    // 2.f minimizar a sala
    socket.on("minimizeRoom", ({ roomId, userId, microphoneOn }) => {
      if (!roomId || !userId) {
        emitError("Room ID and User ID are required to minimize the room.");
        return;
      }

      // Check if the room and user exist in liveRoomUsers
      if (
        !liveRoomUsers[roomId] ||
        !liveRoomUsers[roomId].some((user) => user._id === userId)
      ) {
        console.log(
          `Room with ID ${roomId} or User with ID ${userId} does not exist.`
        );
        emitError("Invalid room or user ID.");
        return;
      }

      // Mark the user as minimized
      minimizeUser(roomId, userId, true, microphoneOn, io);

      // Emit an event to all clients in the room, including the current user, about the minimized state
      io.in(roomId).emit("userMinimized", {
        userId,
        minimized: true,
        microphoneOn,
      });

      console.log(`User ${userId} has minimized the room ${roomId}.`);
    });

    // 2.g sair da sala
    // 🧼 Sair da sala como ouvinte
    socket.on("userLeavesRoom", async ({ roomId, userId }) => {
      console.log("usuario saindo da sala");

      console.log("usuario:", userId);
      console.log("saindo da sala:", roomId);

      console.log("liveRoomUsers:", liveRoomUsers);

      if (!liveRoomUsers[roomId]) {
        liveRoomUsers[roomId] = { speakers: [] }; // garante que não seja undefined
      }

      try {
        const room = await Room.findById(roomId);

        console.log("room antes:", room);
        if (!room) return;

        console.log("sala antes de remover o usuario", room.currentUsersInRoom);

        // 1️⃣ Remover do currentUsersInRoom do MongoDB
        room.currentUsersInRoom = room.currentUsersInRoom.filter(
          (u) => u._id.toString() !== userId
        );

        console.log(
          "sala depois de remover o usuario dos 'na sala'",
          room.currentUsersInRoom
        );

        await room.save();

        // 🧹 Remover também do cache local de usuários online via socket
        if (liveRoomUsers[roomId]) {
          liveRoomUsers[roomId].users = (
            liveRoomUsers[roomId].users || []
          ).filter((u) => u._id !== userId);
        }

        console.log(
          "🧹 liveRoomUsers após remoção:",
          liveRoomUsers[roomId].users
        );

        console.log("usuario removido dos 'na sala'");

        console.log("removendo agora dos 'falando' se estiva falando...");

        // 2️⃣ Remover da lista de oradores (liveRoomUsers.speakers)

        console.log("room: depois", room);

        console.log(
          "✅ falentes na sala antes de sair:",
          liveRoomUsers[roomId].speakers
        );

        if (liveRoomUsers[roomId]?.speakers) {
          console.log("✅ Havia oradores! buscando o usuario para remover...");
          const prevLength = liveRoomUsers[roomId].speakers.length;
          console.log("usuarios antes de remover alguem:", prevLength);
          console.log("agora removendo o usuario se ele estiver la...");
          liveRoomUsers[roomId].speakers = liveRoomUsers[
            roomId
          ].speakers.filter((u) => u._id !== userId);
          const afterLength = liveRoomUsers[roomId].speakers.length;
          console.log("agora a lista e:", afterLength);

          if (prevLength !== afterLength) {
            console.log("🎙️ Removido dos oradores:", userId);
            io.to(roomId).emit(
              "updateSpeakers",
              liveRoomUsers[roomId].speakers
            );
          }
        }

        console.log("liveRoomUsers atualizado", liveRoomUsers[roomId]);
        console.log("liveRoomUsers atualizado", liveRoomUsers[roomId].speakers);

        // 3️⃣ Emitir nova lista de ouvintes
        // console.log(
        //   "emitindo lista de usuarios na sala atualizada",
        //   room.currentUsersInRoom
        // );
        // io.to(roomId).emit("liveRoomUsers", room.currentUsersInRoom);

        // já emitido acima se houve alteração nos speakers, não emitir de novo

        console.log(
          "emitindo lista de oradores na sala atualizada",
          liveRoomUsers[roomId].speakers
        );
        io.to(roomId).emit("updateSpeakers", liveRoomUsers[roomId].speakers);

        console.log(
          "✅✅✅✅✅✅✅✅ Speaker removido do banco de dados e via socket"
        );

        const updatedRoom = await Room.findById(roomId);
        io.to(roomId).emit("liveRoomUsers", updatedRoom.currentUsersInRoom);

        // 4️⃣ Se a sala estiver vazia (ninguém em currentUsersInRoom), limpamos os dados em memória
        if (room.currentUsersInRoom.length === 0) {
          console.log("🔚 Sala vazia. Limpando cache liveRoomUsers...");
          delete liveRoomUsers[roomId]; // <- limpa completamente
        }
      } catch (err) {
        console.error("❌ Erro ao remover ouvinte da sala:", err);
      }
    });

    // 2.h sair da sala
    socket.on("leaveRoom", ({ roomId, userId }) => {
      if (!userId || !roomId) {
        emitError("User ID or Room ID is required to leave the room.");
        return;
      }
      // remove the user from the room
      removeUserFromRoom(roomId, userId);
      // Emit the updated room members to all users in the room
      emitLiveRoomUsers(io, roomId);
      // notify all clients in the room that the user has left
      io.in(roomId).emit("userLeft", { userId });

      socket.leave(roomId);
      console.log(`User ${userId} has left room ${roomId}`);
    });

    socket.on("userLoggedOut", ({ userId }) => {
      removeUser(userId);

      Object.keys(liveRoomUsers).forEach((roomId) => {
        removeUserFromRoom(roomId, userId); // Remove from room
        emitLiveRoomUsers(io, roomId); // Update room users
      });
      emitOnlineUsers(io); // Emit global online users
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
      console.log("disconnect socket called");
      const userId = removeUser(socket.id); // Agora retorna o ID

      if (userId) {
        console.log(`👋 Desconectado: ${userId}`);

        for (const roomId of Object.keys(liveRoomUsers)) {
          await removeUserFromRoom(roomId, userId);

          // ✅ Atualiza e já recebe o documento atualizado
          const room = await removeUserFromRoomDB(roomId, userId);

          emitLiveRoomUsers(io, roomId);
          io.to(roomId).emit("userLeft", { userId });

          // ✅ Atualiza a lista de speakers no frontend
          if (room) {
            io.to(roomId).emit(
              "updateSpeakers",
              room.currentUsersSpeaking || []
            );
          }
        }

        emitOnlineUsers(io);
      }
    });

    // directMessaging
    // Usuário entra numa conversa privada
    socket.on("joinPrivateChat", async ({ conversationId, userId }) => {
      console.log(
        `conversationId: ${conversationId}, userId: ${userId}`
      );
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
