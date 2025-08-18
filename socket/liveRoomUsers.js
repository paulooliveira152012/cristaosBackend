const Room = require("../models/Room");
const User = require("../models/User");
const liveRoomUsers = new Map(); // roomId -> Map<userId, userData>

const getRoomUsers = (roomId) => {
  const rid = String(roomId);
  const room = liveRoomUsers.get(rid);
  if (!room) return [];
  return Array.from(room.values());
};


const sanitize = (u) => ({
  _id: String(u._id),
  username: u.username,
  profileImage: u.profileImage,
  micOpen: !!u.micOpen,
  minimized: !!u.minimized,
  isSpeaker: !!u.isSpeaker,
  socketId: u.socketId, // string
});

// Before accessing liveRoomUsers[roomId], check if it needs to be initialized
const initializeRoomIfNeeded = (roomId) => {
  if (!liveRoomUsers[roomId]) {
    liveRoomUsers[roomId] = []; // Initialize if the room doesn't exist
  }
};

async function ensureUserData(socket, userId) {
  // tenta do próprio socket (mais rápido)
  if (socket?.data?.username && typeof socket.data.profileImage !== "undefined") {
    return {
      username: socket.data.username,
      profileImage: socket.data.profileImage,
    };
  }
  // fallback no banco
  const u = await User.findById(userId).select("username profileImage").lean();
  return {
    username: u?.username || "Usuário",
    profileImage: u?.profileImage || "",
  };
}


// Add user to a specific room and emit updated room members
// Add user to a specific room and emit updated room members
// ✅ mantém FORMATO "const addUserToRoom = async (...) => {}"
const addUserToRoom = async ({ io, socket, roomId, userId }) => {
   const rid = String(roomId);
  const uid = String(userId);

  let room = liveRoomUsers.get(rid);
  if (!room) {
    room = new Map();
    liveRoomUsers.set(rid, room);
  }

  const existed = room.has(uid);
  const base = room.get(uid) || {};
  const { username, profileImage } = await ensureUserData(socket, uid);

  room.set(uid, {
    _id: uid,
    username,
    profileImage,
    micOpen: !!base.micOpen,
    minimized: !!base.minimized,
    isSpeaker: !!base.isSpeaker,
    socketId: socket.id,
  });

  return { changed: !existed };
};

// Remove user from a specific room
// ✅ ASSINATURA NOVA (bate com o index.js)
const removeUserFromRoom = async ({ io, roomId, userId }) => {
  const rid = String(roomId);
  const uid = String(userId);

  const room = liveRoomUsers.get(rid);
  if (!room) return { changed: false };

  const changed = room.delete(uid);
  if (room.size === 0) liveRoomUsers.delete(rid);
  return { changed };
};


// Emit the list of users in a room to all clients in that room
// 🔔 snapshot: se passar `targetSocket`, envia só pra ele; senão, broadcast pra sala
// 🔔 snapshot: se passar `targetSocket`, envia só pra ele; senão, broadcast pra sala
// 🔔 snapshot: se passar targetSocket, envia só pra ele; senão, broadcast pra sala
function emitLiveRoomUsers(io, roomId, targetSocket) {
  const rid = String(roomId);
  const users = getRoomUsers(rid).map(u => ({
    _id: String(u._id),
    username: u.username,
    profileImage: u.profileImage,
    micOpen: !!u.micOpen,
    minimized: !!u.minimized,
    isSpeaker: !!u.isSpeaker,
    socketId: u.socketId,
  }));
  const speakers = users.filter(u => u.isSpeaker);

  const payload = { roomId: rid, users, speakers };

  if (targetSocket) targetSocket.emit("liveRoomUsers", payload);
  else io.to(rid).emit("liveRoomUsers", payload);
}





// Toggle the microphone status of a user in the room
const toggleMicrophone = ({ io, roomId, userId, on }) => {
  console.log("toggling microphone");
    const rid = String(roomId);
  const uid = String(userId);
  const room = liveRoomUsers.get(rid);
  if (!room) return { changed: false };

  const u = room.get(uid);
  if (!u) return { changed: false };

  u.micOpen = !!on;
  room.set(uid, u);
  return { changed: true };
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

// socket/liveRoomUsers.js
const makeUserSpeaker = async ({ io, roomId, userId }) => {
    const rid = String(roomId);
  const uid = String(userId);
  const room = liveRoomUsers.get(rid);
  if (!room) return { changed: false };

  const u = room.get(uid);
  if (!u) return { changed: false };

  u.isSpeaker = true;
  if (typeof on === "boolean") u.micOpen = !!on;
  room.set(uid, u);
  return { changed: true };
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
