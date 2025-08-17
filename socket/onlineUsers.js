// utils/onlineUsers.js
const onlineByUser = new Map();   // userId -> { userId, username, profileImage, socketIds:Set }
const userBySocket = new Map();   // socketId -> userId

// throttle simples para reduzir spam de broadcasts
let lastEmit = 0;
const EMIT_MIN_INTERVAL_MS = 800; // ajuste se quiser

function addUser({ socketId, userId, username, profileImage }) {
  if (!socketId || !userId) {
    console.warn("⚠️ addUser: socketId/userId ausentes", { socketId, userId });
    return;
  }
  let entry = onlineByUser.get(userId);
  if (!entry) {
    entry = { userId, username, profileImage, socketIds: new Set() };
    onlineByUser.set(userId, entry);
  } else {
    // atualiza dados visuais se vierem
    if (username) entry.username = username;
    if (profileImage) entry.profileImage = profileImage;
  }
  entry.socketIds.add(socketId);
  userBySocket.set(socketId, userId);
}

function updateUserProfile(userId, { username, profileImage }) {
  const entry = onlineByUser.get(userId);
  if (!entry) return;
  if (username != null) entry.username = username;
  if (profileImage != null) entry.profileImage = profileImage;
}

function removeSocket(socketId) {
  const userId = userBySocket.get(socketId);
  if (!userId) return null;

  const entry = onlineByUser.get(userId);
  userBySocket.delete(socketId);
  if (!entry) return null;

  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    onlineByUser.delete(userId);
    return userId; // desconectou completamente
  }
  return null;
}

function isOnline(userId) {
  return onlineByUser.has(String(userId));
}

function getUserSockets(userId) {
  const entry = onlineByUser.get(String(userId));
  return entry ? Array.from(entry.socketIds) : [];
}

function getOnlineUsers() {
  return Array.from(onlineByUser.values()).map(({ socketIds, userId, ...rest }) => ({
    _id: userId,           // ✅ alias que o frontend espera
    userId,                // (opcional) mantém também userId
    ...rest,               // username, profileImage
  }));
}


function emitOnlineUsers(io) {
  console.log("emitindo onlineUsers:", getOnlineUsers().length)
  
  const now = Date.now();
  if (now - lastEmit < EMIT_MIN_INTERVAL_MS) return; // throttle
  lastEmit = now;
  
  io.emit("onlineUsers", getOnlineUsers());

}

module.exports = {
  addUser,
  updateUserProfile,
  removeSocket,
  isOnline,
  getUserSockets,
  getOnlineUsers,
  emitOnlineUsers,
};
