// controllers/notificationController.js
const Notification = require("../models/Notification");
const createNotificationUtil = require("../utils/notificationUtils");

// Buscar todas as notificações de um usuário
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .populate("fromUser", "username profileImage");

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Erro ao buscar notificações:", error);
    res.status(500).json({ message: "Erro ao buscar notificações." });
  }
};

// Criar uma nova notificação
exports.createNotificationController = async (req, res) => {
  try {
    const io = req.app.get("io"); // ✅ pegue uma vez só
    if (!io) {
      return res.status(500).json({ message: "Socket.io indisponível" });
    }

    const {
      type,
      recipient,
      content,
      listingId,
      commentId,
      conversationId, // opcional
    } = req.body;

    const fromUser = req.user._id; // do middleware `protect`

    // cria + emite via socket; util já popula `fromUser` e emite o payload correto
    const saved = await createNotificationUtil({
      io,
      recipient,
      fromUser,
      type,
      content,
      listingId,
      commentId,
      conversationId: conversationId ?? null,
    });

    // opcional: retornar a notificação criada/populada
    res.status(201).json({
      message: "Notificação criada e emitida com sucesso.",
      notification: saved || null,
    });
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    res.status(500).json({ message: "Erro ao criar notificação." });
  }
};

// Marcar UMA como lida
exports.markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    await Notification.findByIdAndUpdate(notificationId, { isRead: true });
    res.status(200).json({ message: "Notificação marcada como lida." });
  } catch (error) {
    res.status(500).json({ message: "Erro ao marcar notificação como lida." });
  }
};

// Marcar TODAS como lidas
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );
    res
      .status(200)
      .json({ message: "Todas as notificações foram marcadas como lidas." });
  } catch (error) {
    console.error("Erro ao marcar todas como lidas:", error);
    res
      .status(500)
      .json({ message: "Erro ao marcar notificações como lidas." });
  }
};

// Deletar notificação
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;
    await Notification.findByIdAndDelete(notificationId);
    res.status(200).json({ message: "Notificação deletada com sucesso." });
  } catch (error) {
    res.status(500).json({ message: "Erro ao deletar notificação." });
  }
};
