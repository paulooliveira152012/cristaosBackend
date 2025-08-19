// utils/notificationUtils.js
const Notification = require("../models/Notification");

const createNotificationUtil = async ({
  io, // precisa receber o io do server (req.app.get('io'))
  recipient,
  fromUser,
  type,
  content,
  listingId,
  commentId,
  conversationId = null,
}) => {
  try {
    // não notifica a si mesmo
    if (String(recipient) === String(fromUser)) return;

    // 1) cria e salva
    const doc = await Notification.create({
      type,
      recipient,
      fromUser,
      content,
      listingId,
      commentId,
      conversationId,
    });

    // 2) popula o mínimo que o front usa
    const populated = await doc.populate("fromUser", "username profileImage");

    // 3) payload “plano” (sem aninhar em { notification: ... })
    const payload = {
      _id: String(populated._id),
      type: populated.type,
      content: populated.content,
      isRead: !!populated.isRead,
      recipient: String(populated.recipient),
      listingId: populated.listingId ? String(populated.listingId) : undefined,
      commentId: populated.commentId ? String(populated.commentId) : undefined,
      conversationId: populated.conversationId
        ? String(populated.conversationId)
        : undefined,
      fromUser: populated.fromUser
        ? {
            _id: String(populated.fromUser._id),
            username: populated.fromUser.username || "Usuário",
            profileImage: populated.fromUser.profileImage || "",
          }
        : undefined,
      createdAt: populated.createdAt,
    };

    // 4) emite para a sala pessoal do destinatário
    if (io) {
      io.to(String(recipient)).emit("newNotification", payload);
      console.log("🔔 [socket] newNotification ->", String(recipient));
    } else {
      console.warn("⚠️ io indisponível; não foi possível emitir a notificação.");
    }

    return populated;
  } catch (error) {
    console.error("❌ Erro ao criar/emitir notificação:", error);
  }
};

module.exports = createNotificationUtil;
