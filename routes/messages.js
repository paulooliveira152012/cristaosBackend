// chatRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/Usuario");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const createNotification = require("../utils/notificationUtils");
const { protect } = require("../utils/auth");

// get dm chats from user
// GET /api/dm/userConversations/:userId
router.get("/userConversations/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId); // precisamos do usuário para pegar os timestamps

    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const conversations = await Conversation.find({
      participants: userId,
    }).populate("participants", "username profileImage");

    const enhancedConversations = await Promise.all(
      conversations.map(async (chat) => {
        const lastRead = user.lastReadTimestamps?.[chat._id] || new Date(0);

        const unreadCount = await Message.countDocuments({
          conversationId: chat._id,
          timestamp: { $gt: lastRead },
          userId: { $ne: userId }, // só conta mensagens de outros usuários
        });

        return {
          ...chat.toObject(),
          unreadCount,
        };
      })
    );

    res.status(200).json(enhancedConversations);
  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
    res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});

// 1. Send chat request
// 1. Send chat request
router.post("/sendChatRequest", async (req, res) => {
  const { requester, requested } = req.body;
  if (!requester || !requested)
    return res.status(400).json({ error: "Missing requester or requested ID" });

  try {
    await User.findByIdAndUpdate(requester, {
      $addToSet: { chatRequestsSent: requested },
    });
    await User.findByIdAndUpdate(requested, {
      $addToSet: { chatRequestsReceived: requester },
    });

    const requesterObject = await User.findById(requester);
    console.log("requester:", requesterObject.username);

    const requesterUsername = requesterObject.username;
    console.log("requesterUsername:", requesterUsername);

    // 🔔 Cria notificação para o usuário solicitado
    await createNotification({
      recipient: requested,
      fromUser: requester,
      type: "chat_request", // ou "chat_request" se quiser criar uma nova categoria
      content: `${requesterObject.username} te convidou para uma conversa privada.`,
    });

    res
      .status(200)
      .json({ message: "Chat request sent and notification created" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Reject chat request
router.post("/rejectChatRequest", async (req, res) => {
  const { requester, requested } = req.body;
  if (!requester || !requested)
    return res.status(400).json({ error: "Missing requester or requested ID" });

  try {
    // remover pedido da lista de chatRequestsSent do usuario que enviou o convite
    await User.findByIdAndUpdate(requester, {
      $pull: { chatRequestsSent: requested },
    });
    // remover pedido da lista de chatRequestsSent do usuario que recebeu o convite
    await User.findByIdAndUpdate(requested, {
      $pull: { chatRequestsReceived: requester },
    });
    res.status(200).json({ message: "Chat request rejected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Accept chat request and start conversation
router.post("/startNewConversation", async (req, res) => {
  console.log("starting new conversation...");
  const { requester, requested, notificationId } = req.body;
  console.log(`requester: ${requester}, requested: ${requested}`);
  if (!requester || !requested)
    return res.status(400).json({ error: "Missing requester or requested ID" });
  console.log(`requester: ${requester}, requested: ${requested}`);

  try {
    const userRequested = await User.findById(requested);
    if (!userRequested.chatRequestsReceived.includes(requester)) {
      console.log("Chat request not found");
      return res.status(403).json({ error: "Chat request not accepted yet" });
    }

    const existingConversation = await Conversation.findOne({
      participants: { $all: [requester, requested], $size: 2 },
    });
    if (existingConversation) {
      console.log("Conversation already exists");
      return res.status(200).json({
        message: "Conversation already exists",
        conversation: existingConversation,
      });
    }

    const newConversation = await Conversation.create({
      participants: [requester, requested],
    });

    console.log("removing request from requester...");
    await User.findByIdAndUpdate(requester, {
      $pull: { chatRequestsSent: requested },
    });
    console.log("removing request from requested");
    await User.findByIdAndUpdate(requested, {
      $pull: { chatRequestsReceived: requester },
    });
    console.log("removing notification...");
    await Notification.findByIdAndDelete(notificationId);

    console.log("conversation started!");
    res
      .status(201)
      .json({ message: "Conversation started", conversation: newConversation });
  } catch (error) {
    console.error("Error starting conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Get received chat requests
router.get("/chatRequests/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate(
      "chatRequestsReceived",
      "username profileImage"
    );
    res.status(200).json({ chatRequests: user.chatRequestsReceived });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Marcar como lida uma conversa privada
router.post("/markAsRead/:conversationId", protect, async (req, res) => {
  const userId = req.user._id;
  const { conversationId } = req.params;
  console.log("🔐 Headers recebidos:", req.headers);

  try {
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // Atualiza o timestamp de leitura para a conversa específica
    user.lastReadTimestamps.set(conversationId, new Date());

    await user.save();

    res.status(200).json({ message: "Conversa marcada como lida." });
  } catch (err) {
    console.error("Erro ao marcar como lida:", err);
    res.status(500).json({ error: "Erro ao marcar como lida." });
  }
});

// Buscar mensagens de uma conversa
router.get("/messages/:conversationId", protect, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const messages = await Message.find({ conversationId }).sort({ timestamp: 1 });
    res.status(200).json(messages);
  } catch (err) {
    console.error("Erro ao buscar mensagens:", err);
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});


module.exports = router;
