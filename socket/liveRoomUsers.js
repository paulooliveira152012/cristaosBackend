let liveRoomUsers = {}; // Object to store users by roomId
const Room = require('../models/Room')

// Before accessing liveRoomUsers[roomId], check if it needs to be initialized
const initializeRoomIfNeeded = (roomId) => {
  if (!liveRoomUsers[roomId]) {
    liveRoomUsers[roomId] = []; // Initialize if the room doesn't exist
  }
};


// Add user to a specific room and emit updated room members
const addUserToRoom = (roomId, socketId, user, io) => {
  if (!roomId || !user || !user._id) {
    console.error("Invalid roomId or user data for adding to room");
    return;
  }

  // Initialize the room array if it doesn't exist
  liveRoomUsers[roomId] = liveRoomUsers[roomId] || [];

  const existingUserIndex = liveRoomUsers[roomId].findIndex(u => u._id === user._id);

  if (existingUserIndex !== -1) {
    const existingUser = liveRoomUsers[roomId][existingUserIndex];
    if (existingUser.socketId !== socketId) {
      console.log(`Updating socketId for ${user.username} in room ${roomId}`);
      liveRoomUsers[roomId][existingUserIndex].socketId = socketId;
    }
  } else {
    liveRoomUsers[roomId].push({ socketId, ...user, microphoneOn: false, minimized: false });
    console.log(`User ${user.username} added to room ${roomId}`);
  }

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
  liveRoomUsers[roomId] = liveRoomUsers[roomId].filter(user => user._id !== userId);

    // Remove do banco de dados também
  try {
    await Room.findByIdAndUpdate(roomId, {
      $pull: { roomMembers: { _id: userId } }
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
  if (!io || !roomId) {
    console.error("Socket.io instance or roomId is not defined.");
    return;
  }

  if (liveRoomUsers[roomId]) {
    io.to(roomId).emit("roomData", { roomMembers: liveRoomUsers[roomId] });
  } else {
    io.to(roomId).emit("roomData", { roomMembers: [] });
  }
};



// Toggle the microphone status of a user in the room
const toggleMicrophone = (roomId, socketId, microphoneOn, io) => {
  const user = liveRoomUsers[roomId]?.find(user => user.socketId === socketId);

  if (user) {
    user.microphoneOn = microphoneOn;
    console.log(`User ${user.username} in room ${roomId} updated microphone status: ${microphoneOn}`);
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
  const user = liveRoomUsers[roomId].find(user => user._id === userId);

  if (user) {
    // Update the user's minimized state
    user.minimized = isMinimized;
    user.microphoneOn = microphoneOn;
    console.log(`User ${user.username} in room ${roomId} updated minimized state: ${isMinimized} and microphoneOn: ${microphoneOn}`);

    // Emit the updated list of users in the room
    emitLiveRoomUsers(io, roomId);
  } else {
    console.log(`User with userId ${userId} not found in room ${roomId}`);
  }
};


module.exports = {
  addUserToRoom,
  removeUserFromRoom,
  emitLiveRoomUsers,
  toggleMicrophone,
  minimizeUser,
  initializeRoomIfNeeded
};
