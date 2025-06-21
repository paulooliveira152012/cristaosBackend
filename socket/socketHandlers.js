// socketHandlers.js
const { addUserToRoom, emitLiveRoomUsers, } = require('./liveRoomUsers');
const { addUser, removeUser, emitOnlineUsers } = require('./onlineUsers')

module.exports = function (io) {

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

     socket.on("userLoggedIn", (user) => {
    if (!user || !user._id) return;
    addUser(socket.id, user);
    emitOnlineUsers(io);
  });

  socket.on("userLoggedOut", (user) => {
     console.log(`User requested logout: ${user?.username}`);
  removeUser(socket.id); // remove só este socket
  emitOnlineUsers(io);
});


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
    removeUser(socket.id);
    emitOnlineUsers(io);
    
  });
  });
};
