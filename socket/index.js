const { addUser, removeUser, emitOnlineUsers } = require("./onlineUsers");

const {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
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

const Room = require("../models/Room");

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
    socket.onAny((event, args) => {
      console.log(`📥🟢 [onAny] Evento recebido: ${event}`, args);
    });

    // 2 - Definimos os eventos que esse socket (usuário) poderá emitir durante a sessão

    // 2.a - emitir usuario online globalmente
    socket.on("userLoggedIn", (user) => {
      if (!user || !user._id) {
        emitError("Invalid user data received for login.");
        return;
      }
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
    socket.on("joinRoom", async ({ roomId, user }) => {
      if (!user || !roomId) {
        emitError("User or Room ID is required to join the room.");
        return;
      }

      // Ensure the room is initialized before accessing liveRoomUsers[roomId]
      initializeRoomIfNeeded(roomId);

      try {
        await socket.join(roomId);
        addUserToRoom(roomId, user._id, user, io);
        emitLiveRoomUsers(io, roomId);
        emitChatHistory(socket, roomId);
        socket.emit("successMessage", `Joined room ${roomId} successfully.`);
      } catch (error) {
        emitError(`Error joining room: ${error.message}`);
      }
    });

    // 2.d subir usuario para quem esta falando
      // 🎤 Subir ao palco
    socket.on("joinAsSpeaker", ({ roomId, user }) => {
      if (!roomId || !user) return;
      if (!roomSpeakers[roomId]) roomSpeakers[roomId] = [];

      const alreadyIn = roomSpeakers[roomId].some((u) => u._id === user._id);
      if (!alreadyIn) roomSpeakers[roomId].push(user);

      io.to(roomId).emit("updateSpeakers", roomSpeakers[roomId]);
      makeUserSpeaker(roomId, user._id, io);
    });

    // 2.e escutando quando microphone for ativado
    socket.on("micStatusChanged", ({ roomId, userId, micOpen }) => {
      const room = liveRoomUsers[roomId];

      if (!room) return;

      const user = room.find((u) => u._id === userId);

      if (user) {
        user.micOpen = micOpen;
        console.log(`User ${user.username} mic status changed to ${micOpen}`);
        emitLiveRoomUsers(io, roomId); // Atualiza os membros na sala
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
          console.log("usuario saindo da sala")
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
      const { roomId } = data;
      if (!roomId) {
        emitError("Room ID is required to send a message.");
        return;
      }
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

    // 🔓 LOGOUT
    socket.on("disconnect", () => {
      const user = removeUser(socket.id); // Get the user before removing
      if (user && user._id) {
        // Remove the user from all rooms they were part of
        Object.keys(liveRoomUsers).forEach((roomId) => {
          removeUserFromRoom(roomId, user._id); // Remove the user from all rooms
          emitLiveRoomUsers(io, roomId); // Update room users
          io.in(roomId).emit("userLeft", { userId: user._id }); // Notify all users that this user has left
        });
      }
      emitOnlineUsers(io); // Emit global online users
    });
  });
};
