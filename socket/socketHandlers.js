// socketHandlers.js
const { addUserToRoom, emitLiveRoomUsers } = require('./liveRoomUsers');

module.exports = function (io) {
  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Handle joining a chat room
    socket.on("joinRoom", ({ roomId, user }) => {
      if (!roomId || !user) {
        console.error('Invalid roomId or user');
        return;
      }

      // Join the Socket.IO room
      socket.join(roomId);

      // Add the user to the live room's participants
      addUserToRoom(roomId, socket.id, user, io);
      
      // Emit the updated room data to all clients in the room
      emitLiveRoomUsers(io, roomId);
    });

    // Handle disconnecting users
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Implement user removal logic here, e.g., remove from room, notify others
      // For this, you could implement a function in liveRoomUsers.js to remove users by socketId
    });
  });
};
