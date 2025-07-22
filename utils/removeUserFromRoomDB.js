// utils/removeUserFromRoomDB.js
const Room = require("../models/Room");

const removeUserFromRoomDB = async (roomId, userId) => {
  try {
    const updatedRoom = await Room.findOneAndUpdate(
      { _id: roomId },
      {
        $pull: {
          currentUsersInRoom: { _id: userId },
          currentUsersSpeaking: { _id: userId }, // <-- novo aqui!
        },
      },
      { new: true }
    );
    console.log(`🧹 MongoDB: usuário ${userId} removido da sala ${roomId}`);
    return updatedRoom;
  } catch (err) {
    console.error("❌ Erro ao remover usuário do banco:", err);
    return null;
  }
};

module.exports = removeUserFromRoomDB;
