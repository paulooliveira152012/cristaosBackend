// utils/emitParticipantChanged.js
function emitParticipantChanged(req, conversationId = {}) {
  const io = req.app.get("io");
  if (!io) return;
  // emite para QUEM está na conversa
  io.to(conversationId).emit("dm:participantChanged", {
    conversationId,
  });
}

module.exports = { emitParticipantChanged };
