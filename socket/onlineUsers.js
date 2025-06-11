let onlineUsers = {}; // Store users by their userId, not socketId

// Add user to the list of online users
const addUser = (socketId, user) => {
  if (!onlineUsers[user._id]) {
    // If the user is not in the list, add them and initialize socketIds
    onlineUsers[user._id] = {
      ...user,
      socketIds: [socketId], // Store all connected sockets (tabs) for this user
    };
  } else {
    // If the user already exists, add the new socketId
    onlineUsers[user._id].socketIds.push(socketId);
  }
};

// Remove user from the list
const removeUser = (socketId) => {
  for (let userId in onlineUsers) {
    // Find the user by their socketId
    onlineUsers[userId].socketIds = onlineUsers[userId].socketIds.filter(id => id !== socketId);

    // If no more sockets are connected, remove the user
    if (onlineUsers[userId].socketIds.length === 0) {
      delete onlineUsers[userId];
    }
  }
};

// Emit the list of online users to all clients
const emitOnlineUsers = (io) => {
  io.emit('onlineUsers', Object.values(onlineUsers).map(user => {
    // Return user info without socketIds to the client
    const { socketIds, ...userWithoutSockets } = user;
    return userWithoutSockets;
  }));
};

module.exports = {
  addUser,
  removeUser,
  emitOnlineUsers,
};
