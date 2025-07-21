let onlineUsers = {}; // Store users by their userId, not socketId

// Add user to the list of online users
const addUser = (socketId, user) => {
  if (!user || !user._id || !user.username) {
    console.warn("⚠️ Dados de usuário incompletos no addUser:", user);
    return;
  }

  console.log("🟢 Adicionando user online:", user.username, user._id);
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

// Retorna a lista de usuários online, sem os socketIds
const getOnlineUsers = () => {
  return Object.values(onlineUsers).map(({ socketIds, ...user }) => user);
};

// Remove user from the list
const removeUser = (socketId) => {
  for (let userId in onlineUsers) {
    // Find the user by their socketId
    onlineUsers[userId].socketIds = onlineUsers[userId].socketIds.filter(
      (id) => id !== socketId
    );

    // If no more sockets are connected, remove the user
    if (onlineUsers[userId].socketIds.length === 0) {
      console.log(`🔴 Usuário ${userId} desconectado completamente`);
      delete onlineUsers[userId];
    }
  }
};

// Emit the list of online users to all clients
const emitOnlineUsers = (io) => {
  console.log(
    "📡 Enviando lista de onlineUsers:",
    Object.values(onlineUsers).map((u) => u.username)
  );

  const list = Object.values(onlineUsers).map((user) => {
    const { socketIds, ...userWithoutSockets } = user;
    return userWithoutSockets;
  });

  console.log("📢 Enviando lista de onlineUsers:", list);

  io.emit("onlineUsers", list);
};

module.exports = {
  addUser,
  removeUser,
  emitOnlineUsers,
  getOnlineUsers,
};
