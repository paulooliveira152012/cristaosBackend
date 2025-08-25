const Conversation = require('../models/Conversation')
const Message = require('../models/Message');
const User = require("../models/User")



// Emit chat history for a specific room
const emitChatHistory = async (socket, roomId) => {
  console.log("emitChatHistory...")
  if (!socket || !roomId) {
    console.log("invalid socket:", socket, "or invalid roomId:", roomId)
    return
  }

  try {
    // Fetch messages for the specific room, sorted by timestamp
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100).exec();
    console.log(`Sending chat history to client for room ${roomId}`);
    socket.emit('chatHistory', messages); // Emit chat history for the specific room
  } catch (error) {
    console.error(`Error fetching chat history for room ${roomId}:`, error.message);
    socket.emit('errorMessage', `Error fetching chat history: ${error.message}`);
  }
};

// Handle incoming messages for a specific room
// Agora a assinatura bate com o index.js
const handleSendMessage = async ({ io, socket, userId, payload }) => {
  console.log("handleSendMessage...");

  const roomId = String(payload?.roomId || "mainChatRoom");
  const text = (payload?.text ?? payload?.message ?? "").trim();

  if (!roomId || !text) {
    return socket.emit("errorMessage", "Invalid message data");
  }
  if (!userId) {
    return socket.emit("errorMessage", "Usuário não autenticado");
  }

  // busca dados do usuário para preencher o documento
  let username = payload?.username;
  let profileImage = payload?.profileImage;

  try {
    if (!username || !profileImage) {
      const u = await User.findById(userId)
        .select("username profileImage")
        .lean();
      if (!u) {
        return socket.emit("errorMessage", "Usuário inválido");
      }
      username = username || u.username || "Usuário";
      profileImage = profileImage || u.profileImage || "";
    }

    // persiste
    const doc = await Message.create({
      roomId,
      userId,
      username,         // 👈 obrigatório no seu schema
      profileImage,
      message: text,    // campo do schema
      timestamp: new Date(),
    });

    // payload normalizado para o front
    const out = {
      _id: doc._id,
      userId: String(doc.userId),
      username: doc.username,
      profileImage: doc.profileImage || "",
      message: doc.message,
      timestamp: doc.timestamp || doc.createdAt,
      roomId,
    };

    // emite para a sala (inclui quem enviou, pois está na sala)
    io.to(roomId).emit("newMessage", out);
  } catch (error) {
    console.error("Error saving message:", error);
    socket.emit("errorMessage", `Error saving message: ${error.message}`);
  }
};



// Handle message deletion for a specific room
const handleDeleteMessage = async ({ io, socket, userId, messageId }) => {
  try {
    if (!socket?.emit) return;
    if (!messageId) return socket.emit("errorMessage", "Missing messageId");
    if (!userId)   return socket.emit("errorMessage", "Not authenticated");

    // Só apaga se a mensagem pertence ao usuário
    const doc = await Message.findOneAndDelete({
      _id: String(messageId),
      userId: String(userId),
    });

    if (!doc) {
      return socket.emit(
        "errorMessage",
        "Message not found or not owned by you"
      );
    }

    const roomId = doc.roomId ? String(doc.roomId) : null;
    const convId = doc.conversationId ? String(doc.conversationId) : null;

    if (roomId) {
      io.to(roomId).emit("messageDeleted", { messageId: String(messageId) });
    } else if (convId) {
      io.to(convId).emit("messageDeleted", { messageId: String(messageId) });
    } else {
      // fallback: confirma só para quem deletou
      socket.emit("messageDeleted", { messageId: String(messageId) });
    }
  } catch (err) {
    console.error("❌ erro em handleDeleteMessage:", err);
    socket?.emit?.("errorMessage", "Failed to delete message");
  }
}


// Emit chat history for users when they minimize the room
const emitChatHistoryWhenMinimized = async (socket, roomId) => {
  try {
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100).exec();
    console.log(`Sending chat history to minimized client for room ${roomId}`);
    socket.emit('minimizedChatHistory', messages); // Emit minimized chat history for the specific room
  } catch (error) {
    console.error(`Error fetching minimized chat history for room ${roomId}:`, error.message);
    socket.emit('errorMessage', `Error fetching chat history while minimized: ${error.message}`);
  }
};

// dm messaging
// dm messaging
// Enviar DM (payload vem do front como { conversationId, sender, message })
const handleSendPrivateMessage = async ({ io, socket, conversationId, sender, message }) => {
  try {
    // valida DM e participação
    const conv = await Conversation.findById(conversationId).select("participants").lean();
    const isParticipant = !!conv && (conv.participants || []).map(String).includes(String(sender));
    if (!isParticipant) {
      socket.emit("errorMessage", "Você não participa desta conversa.");
      return;
    }

    const user = await User.findById(sender).select("username profileImage").lean();
    if (!user) {
      socket.emit("errorMessage", "Usuário inválido.");
      return;
    }

    // monta receiver (o outro participante)
    const receiver = (conv.participants || [])
      .map(String)
      .find((id) => id !== String(sender));

    // persiste
    const newMsg = await Message.create({
      conversationId,
      userId: sender,
      receiver,
      username: user.username,
      profileImage: user.profileImage || "",
      message,
      timestamp: new Date(),
    });

    const payload = {
      _id: newMsg._id,
      conversationId,
      sender,
      receiver,
      message,
      username: user.username,
      profileImage: user.profileImage || "",
      timestamp: newMsg.timestamp,
    };

    // emite para sala…
    io.to(conversationId).emit("newPrivateMessage", payload);
    // …e garante eco para o remetente (caso ele ainda não tenha entrado na sala)
    socket.emit("newPrivateMessage", payload);
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem privada:", err);
    socket.emit("errorMessage", "Erro ao enviar mensagem privada.");
  }
};


module.exports = {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
  emitChatHistoryWhenMinimized, // Add this function for minimized room chat history
  handleSendPrivateMessage
};
