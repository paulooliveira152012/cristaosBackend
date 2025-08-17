const Message = require('../models/Message');
const Usuario = require("../models/User")
const Conversation = require('../models/Conversation')



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
      const u = await Usuario.findById(userId)
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
const handleDeleteMessage = async (socket, messageId, userId, roomId) => {
  try {
    const message = await Message.findById(messageId);

    if (!message) {
      console.error(`Message with ID ${messageId} not found`);
      socket.emit('errorMessage', 'Message not found');
      return;
    }

    // Ensure the user is authorized to delete the message
    if (message.userId.toString() !== userId.toString()) {
      console.error(`User ${userId} is not authorized to delete message ${messageId}`);
      socket.emit('errorMessage', 'You are not authorized to delete this message');
      return;
    }

    // Delete the message if authorized
    await Message.deleteOne({ _id: messageId });
    console.log(`Message ${messageId} deleted by user ${userId}`);

    // Notify all clients in the room, including the one who deleted the message
    socket.to(roomId).emit('messageDeleted', messageId); // Notify others in the room
    socket.emit('messageDeleted', messageId); // Confirm deletion to the user who deleted the message
  } catch (error) {
    console.error(`Error deleting message in room ${roomId}:`, error.message);
    socket.emit('errorMessage', 'Failed to delete message');
  }
};

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
const handleSendPrivateMessage = async (io, socket, data) => {
  const { conversationId, sender, message } = data;

  try {
    const user = await Usuario.findById(sender).select("username profileImage");
    if (!user) throw new Error("Usuário não encontrado");

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Conversa não encontrada");

    // pega o outro participante (o receiver)
    const receiver = conversation.participants.find(
      (participantId) => participantId.toString() !== sender
    );

    const newMsg = new Message({
      conversationId,
      userId: sender,
      receiver, // 👈 novo campo adicionado
      username: user.username,
      profileImage: user.profileImage || "",
      message,
      timestamp: new Date(),
    });

    await newMsg.save();

    io.to(conversationId).emit("newPrivateMessage", {
      _id: newMsg._id,
      conversationId,
      sender,
      receiver, // <- opcional, mas pode ajudar no front
      message,
      username: user.username,
      profileImage: user.profileImage,
      timestamp: newMsg.timestamp,
    });
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem privada:", err);
    socket.emit("error", { message: "Erro ao enviar mensagem privada." });
  }
};


module.exports = {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
  emitChatHistoryWhenMinimized, // Add this function for minimized room chat history
  handleSendPrivateMessage
};
