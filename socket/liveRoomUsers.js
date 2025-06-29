let liveRoomUsers = {}; // Object to store users by roomId
const Room = require("../models/Room");

// Before accessing liveRoomUsers[roomId], check if it needs to be initialized
const initializeRoomIfNeeded = (roomId) => {
  if (!liveRoomUsers[roomId]) {
    liveRoomUsers[roomId] = []; // Initialize if the room doesn't exist
  }
};

// Add user to a specific room and emit updated room members
const addUserToRoom = (roomId, socketId, user, io) => {
  console.log("🐶 backend socket liveRoomUsers")

  if (!roomId || !user || !user._id) {
    console.error("Invalid roomId or user data for adding to room");
    return;
  }

  // Inicializa array da sala se necessário
  liveRoomUsers[roomId] = liveRoomUsers[roomId] || [];

  const existingUserIndex = liveRoomUsers[roomId].findIndex(
    (u) => u._id === user._id
  );

if (existingUserIndex !== -1) {
  const existingUser = liveRoomUsers[roomId][existingUserIndex];

  existingUser.socketId = socketId;

  // 🔁 Remova esses resets aqui
  // existingUser.micOpen = false;
  // existingUser.isSpeaker = false;

  existingUser.minimized = false;

  console.log(`🔁 User ${user.username} reentrou na sala ${roomId}`);
}
 else {
    // Usuário novo na sala
    liveRoomUsers[roomId].push({
      socketId,
      ...user,
      micOpen: false,
      minimized: false,
      isSpeaker: false,
    });

    console.log(`✅ User ${user.username} added to room ${roomId}`);
  }

  // Emite membros atualizados
  emitLiveRoomUsers(io, roomId);
};

// Remove user from a specific room
const removeUserFromRoom = async (roomId, userId, io) => {
  if (!roomId || !io) {
    console.error("Room ID or Socket.io instance is not provided.");
    return;
  }

  if (!liveRoomUsers[roomId]) {
    console.log(`Room with ID ${roomId} does not exist`);
    return;
  }

  const initialLength = liveRoomUsers[roomId].length;
  liveRoomUsers[roomId] = liveRoomUsers[roomId].filter(
    (user) => user._id !== userId
  );

  // Remove do banco de dados também
  try {
    await Room.findByIdAndUpdate(roomId, {
      $pull: { roomMembers: { _id: userId } },
    });
    console.log(`Usuário ${userId} removido do banco da sala ${roomId}`);
  } catch (err) {
    console.error("Erro ao remover usuário do banco:", err);
  }

  if (liveRoomUsers[roomId].length === 0) {
    console.log(`No users left in room ${roomId}, deleting room`);
    delete liveRoomUsers[roomId];
  } else if (liveRoomUsers[roomId].length < initialLength) {
    console.log(`User with userId ${userId} removed from room ${roomId}`);
  }

  // Emit updated room data after removing a user
  emitLiveRoomUsers(io, roomId);
};

// Emit the list of users in a room to all clients in that room
const emitLiveRoomUsers = (io, roomId) => {
  console.log("🐶 emitLiveRoomUsers");

  if (!io || !roomId) {
    console.error("Socket.io instance or roomId is not defined.");
    return;
  }

  const usersInRoom = liveRoomUsers[roomId] || [];

  io.to(roomId).emit("liveRoomUsers", usersInRoom); // <-- nome certo

  console.log(`📤 Enviando usuários da sala ${roomId}:`, usersInRoom);
};

// Toggle the microphone status of a user in the room
const toggleMicrophone = (roomId, socketId, microphoneOn, io) => {
  console.log("🐶 emitLiveRoomUsers")
  const user = liveRoomUsers[roomId]?.find(
    (user) => user.socketId === socketId
  );

  if (user) {
    user.micOpen = microphoneOn;
    console.log(
      `User ${user.username} in room ${roomId} updated microphone status: ${microphoneOn}`
    );

    // ✅ Atualiza também no banco de dados
    const Room = require("../models/Room");
    Room.updateOne(
      { _id: roomId, "roomMembers._id": user._id },
      { $set: { "roomMembers.$.micOpen": microphoneOn } }
    ).catch(console.error);

    emitLiveRoomUsers(io, roomId);
  } else {
    console.log(`User with socketId ${socketId} not found in room ${roomId}`);
  }
};

// Mark a user as minimized or restored in the room
const minimizeUser = (roomId, userId, isMinimized, microphoneOn, io) => {
  // Check if the room and the list of users for the room exist
  if (!liveRoomUsers[roomId]) {
    console.log(`Room ${roomId} not found`);
    return;
  }

  // Find the user by socketId
  const user = liveRoomUsers[roomId].find((user) => user._id === userId);

  if (user) {
    // Update the user's minimized state
    user.minimized = isMinimized;
    user.micOpen = microphoneOn;

    console.log(
      `User ${user.username} in room ${roomId} updated minimized state: ${isMinimized} and microphoneOn: ${microphoneOn}`
    );

    // Emit the updated list of users in the room
    emitLiveRoomUsers(io, roomId);
  } else {
    console.log(`User with userId ${userId} not found in room ${roomId}`);
  }
};

const makeUserSpeaker = (roomId, userId, io) => {
  const userList = liveRoomUsers[roomId];
  if (!userList) return;

  const user = userList.find((u) => u._id === userId);
  if (user) {
    user.isSpeaker = true;
    user.micOpen = false;
    console.log(`✅ ${user.username} agora é speaker na sala ${roomId}`);

    // ✅ Atualiza também no banco
    const Room = require("../models/Room");
    Room.updateOne(
      { _id: roomId, "roomMembers._id": userId },
      {
        $set: {
          "roomMembers.$.isSpeaker": true,
          "roomMembers.$.micOpen": false,
        },
      }
    )
      .then(() => {
        console.log(`✅ MongoDB: ${user.username} agora é speaker`);
      })
      .catch((err) => {
        console.error("Erro ao atualizar MongoDB:", err);
      });

    if (user._id && user.username && user.profileImage !== undefined) {
      io.to(roomId).emit("userJoinsStage", {
        user: {
          _id: user._id,
          username: user.username,
          profileImage: user.profileImage,
          isSpeaker: true,
          micOpen: false,
        },
      });
    } else {
      console.warn("⚠️ Usuário incompleto ao tentar subir ao palco:", user);
    }

    emitLiveRoomUsers(io, roomId);
  }
};

module.exports = {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  minimizeUser,
  initializeRoomIfNeeded,
  makeUserSpeaker,
};
