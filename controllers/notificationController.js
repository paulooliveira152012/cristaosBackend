const Notification = require("../models/Notification");
const createNotificationUtil = require("../utils/notificationUtils");

// Buscar todas as notificações de um usuário
exports.getNotifications = async (req, res) => {
  // console.log("fetching notifications...");
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .populate("fromUser", "username profileImage");

    res.status(200).json(notifications);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Erro ao buscar notificações." });
  }
};

// Criar uma nova notificação
exports.createNotificationController = async (req, res) => {
  console.log(
    "🟢 [2] notificationController: route for creating a new notification socket instance + chamar notificationUtils reached"
  );

  const io = req.app.get("io");
  console.log("📡 io existe?", !!io);

  try {
    const { type, recipient, content, listingId, commentId } = req.body;

    // `fromUser` vem do middleware `protect`
    const fromUser = req.user._id;

    console.log(
      `type: ${type}, recipient: ${recipient}, fromUser: ${fromUser}`
    );

    const io = req.app.get("io");
    console.log("📡 io disponível?", !!io); // vai imprimir true ou false

    await createNotificationUtil({
      io: req.app.get("io"), // 🔥 passa o socket aqui
      recipient,
      fromUser,
      type,
      content,
      listingId,
      commentId,
    });

    res
      .status(201)
      .json({ message: "Notificação criada e emitida com sucesso." });
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    res.status(500).json({ message: "Erro ao criar notificação." });
  }
};

// Marcar como lida
// ✅ Marcar como lida
exports.markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id; // corrigido
    await Notification.findByIdAndUpdate(notificationId, { isRead: true });
    res.status(200).json({ message: "Notificação marcada como lida." });
  } catch (error) {
    res.status(500).json({ message: "Erro ao marcar notificação como lida." });
  }
};

// Marcar todas as notificações do usuário como lidas
// ✅ Marcar todas como lidas
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

// ✅ Deletar notificação
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id; // corrigido
    await Notification.findByIdAndDelete(notificationId);
    res.status(200).json({ message: "Notificação deletada com sucesso." });
  } catch (error) {
    res.status(500).json({ message: "Erro ao deletar notificação." });
  }
};
