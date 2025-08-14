// utils/emitters.js
function resolveIo(reqOrIo) {
  if (reqOrIo && reqOrIo.app && typeof reqOrIo.app.get === "function") {
    return reqOrIo.app.get("io");
  }
  return reqOrIo;
}
const convIdOf = (convOrId) => String(convOrId?._id || convOrId || "");

// utils/emitters.js
function emitParticipantChanged(req, conv) {
  const io = req.app.get("io");
  if (!io || !conv) return;
  io.to(String(conv._id)).emit("dm:participantChanged", {
    conversationId: String(conv._id),
    participants: (conv.participants || []).map((id) => String(id)),
    waitingUser: conv.waitingUser ? String(conv.waitingUser) : null,
    requester:   conv.requester   ? String(conv.requester)   : null,
    leavingUser: conv.leavingUser ? String(conv.leavingUser) : null,
  });
}

function emitInvited(reqOrIo, toUserId, convOrId) {
  const io = resolveIo(reqOrIo);
  const id = convIdOf(convOrId);
  if (!io || !toUserId || !id) return;
  io.to(String(toUserId)).emit("dm:invited", { conversationId: id });
}

function emitAccepted(reqOrIo, convOrId, byUserId) {
  const io = resolveIo(reqOrIo);
  const id = convIdOf(convOrId);
  if (!io || !id) return;
  io.to(id).emit("dm:accepted", { conversationId: id, by: String(byUserId) });
}

function emitRejected(reqOrIo, convOrId, byUserId) {
  const io = resolveIo(reqOrIo);
  const id = convIdOf(convOrId);
  if (!io || !id) return;
  io.to(id).emit("dm:rejected", { conversationId: id, by: String(byUserId) });
}

module.exports = { emitParticipantChanged, emitInvited, emitAccepted, emitRejected };
