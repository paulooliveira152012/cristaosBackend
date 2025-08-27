const nodemailer = require('nodemailer');
// emailService.js (TOPO DO ARQUIVO)
const path = require('path');
try {
  require('dotenv-flow').config({ path: path.resolve(__dirname, '..') });
} catch {}

const API_URL =
  process.env.FRONTEND_URL || // ideal: usar um único nome por ambiente
  (process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL_PROD
    : process.env.FRONTEND_URL_DEV) ||
  process.env.FRONTEND_URL_DEV_NET || // sua LAN, se tiver
  "http://localhost:3000";

console.log("[emailService] FRONTEND_URL efetiva:", API_URL);

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'cristaosapp@gmail.com', // Use environment variable
    pass: 'orus odkw dkym ikip', // Use environment variable
  },
});

// Function to send reset password link
const sendResetLink = async (email, resetLink) => {
  const mailOptions = {
    from: '"Cristaos App" <cristaosapp@gmail.com>', // Sender address
    to: email, // Recipient's email address
    subject: 'Redefinição de senha', // Subject
    text: `Clique no link para redefinir sua senha: ${resetLink}`, // Plain text body
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Reset link email sent successfully to ${email}`);
  } catch (error) {
    console.error(`Error sending reset link email to ${email}:`, error.message);
    throw new Error('Failed to send reset link email.');
  }
};

// Function to send account verification link
const sendVerificationLink = async (email, verificationLink) => {
  const mailOptions = {
    from: '"Cristaos App" <cristaosapp@gmail.com>', // Sender address
    to: email, // Recipient's email address
    subject: 'Verificação de conta', // Subject
    text: `Clique no link para verificar sua conta: ${verificationLink}`, // Plain text body
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification link email sent successfully to ${email}`);
  } catch (error) {
    console.error(`Error sending verification link email to ${email}:`, error.message);
    throw new Error('Failed to send verification link email.');
  }
};

// Function to verify update email
const sendEmailUpdateVerification = async (email, verificationLink) => {
  const mailOptions = {
    from: '"Cristaos App" <cristaosapp@gmail.com>',
    to: email,
    subject: 'Confirme a atualização do seu e-mail',
    text: `Clique para confirmar a atualização do seu e-mail: ${verificationLink}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de atualização enviado para ${email}`);
  } catch (error) {
    console.error(`Erro ao enviar email de atualização:`, error.message);
    throw new Error('Erro ao enviar o e-mail de confirmação.');
  }
};

function buildNotificationEmail({ username, path = "/notifications" } = {}) {
  const url = `${API_URL}${path}`;
  console.log("url:", url)
  const subject = "Você tem uma nova notificação";
    // Fallback em texto puro
  const text = [
    `Olá ${username || ""}, você recebeu uma nova notificação.`,
    `Acesse: ${url}`,
    "",
    "Dica: você pode gerenciar suas notificações por e-mail na página de Notificações."
  ].join("\n");

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#f6f7f9;color:#111">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;border:1px solid #eee">
      <h2 style="margin:0 0 12px 0;">Você tem uma nova notificação</h2>
      <p style="margin:0 0 20px 0;">Olá ${username || ""}, clique no botão abaixo para ver:</p>

      <p style="text-align:center;margin:24px 0;">
        <a href="${url}"
           style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">
          Ver notificações
        </a>
      </p>

      <p style="font-size:12px;color:#555;margin-top:24px">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        <a href="${url}" style="color:#111">${url}</a>
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />

      <p style="font-size:12px;color:#555;margin:0">
        <strong>Preferências de e-mail:</strong> você pode gerenciar suas notificações por e-mail diretamente na
        <a href="${url}" style="color:#111;text-decoration:underline;">página de Notificações</a>.
      </p>
    </div>
  </body>
</html>`.trim();

  return { subject, text, html, url };
}

// services/emailService.js
// services/emailService.js
const sendNotificationEmail = async (email, opts = {}) => {
  const { subject, text, html } = buildNotificationEmail(opts);
  const mailOptions = {
    from: '"Cristãos App" <cristaosapp@gmail.com>',
    to: email,
    subject,
    text, // fallback
    html, // versão rica
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de notificação enviado para ${email}`);
  } catch (error) {
    console.error("Erro ao enviar email de notificação:", error.message);
  }
};



module.exports = {
  sendResetLink,
  sendVerificationLink, // Export the new function
  sendEmailUpdateVerification,
  sendNotificationEmail
};
