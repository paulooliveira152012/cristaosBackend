// utils/notificationUtils.js
const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendNotificationEmail } = require("../utils/emailService"); // ajuste o caminho se necessário

function buildEmailContent({ type, content, target, listingId, commentId, conversationId }) {
  // Customize por tipo se quiser
  switch (type) {
    case "comment":
      return {
        subject: "Novo comentário na sua publicação",
        text:
          `Olá ${target?.username || ""}, você recebeu um novo comentário.` +
          (content?.text ? `\n\n"${content.text}"` : ""),
      };
    case "message":
      return {
        subject: "Você recebeu uma nova mensagem",
        text:
          `Olá ${target?.username || ""}, você recebeu uma nova mensagem.` +
          (content?.text ? `\n\n"${content.text}"` : ""),
      };
    default:
      return {
        subject: "Você recebeu uma nova notificação",
        text:
          `Olá ${target?.username || ""}, você recebeu uma nova notificação.` +
          (content?.text ? `\n\n"${content.text}"` : ""),
      };
  }
}

const createNotificationUtil = async ({
  io,               // socket.io (opcional)
  recipient,        // ObjectId (string) do usuário alvo
  fromUser,         // ObjectId (string) do autor
  type,
  content,
  listingId,
  commentId,
  conversationId = null,
}) => {
  try {
    // 0) não notifica a si mesmo
    if (String(recipient) === String(fromUser)) return;

    console.log("Criando notificação:", {
      recipient, fromUser, type, content, listingId, commentId, conversationId,
    });

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

    // 3) payload “plano”
    const payload = {
      _id: String(populated._id),
      type: populated.type,
      content: populated.content,
      isRead: !!populated.isRead,
      recipient: String(populated.recipient),
      listingId: populated.listingId ? String(populated.listingId) : undefined,
      commentId: populated.commentId ? String(populated.commentId) : undefined,
      conversationId: populated.conversationId ? String(populated.conversationId) : undefined,
      fromUser: populated.fromUser
        ? {
            _id: String(populated.fromUser._id),
            username: populated.fromUser.username || "Usuário",
            profileImage: populated.fromUser.profileImage || "",
          }
        : undefined,
      createdAt: populated.createdAt,
    };

    // 4) emite via socket (se io disponível)
    if (io) {
      io.to(String(recipient)).emit("newNotification", payload);
      console.log("🔔 [socket] newNotification ->", String(recipient));
    } else {
      console.warn("⚠️ io indisponível; não foi possível emitir a notificação.");
    }

    // 5) envia e-mail em background (não bloqueia)
    (async () => {
      try {
        const target = await User.findById(recipient)
          .select("email notificationsByEmail username");
        if (!target) {
          console.warn("[notif-email] recipient não encontrado:", recipient);
          return;
        }
        if (!target.notificationsByEmail) {
          console.log("[notif-email] opt-out:", target.email);
          return;
        }

        const { subject, text } = buildEmailContent({
          type, content, target, listingId, commentId, conversationId,
        });

        await sendNotificationEmail(target.email, { subject, text });
        console.log(`[notif-email] enviado para ${target.email}`);
      } catch (e) {
        console.error("[notif-email] falha ao enviar:", e.message);
      }
    })();

    return populated;
  } catch (error) {
    console.error("❌ Erro ao criar/emitir notificação:", error);
  }
};

module.exports = createNotificationUtil;
