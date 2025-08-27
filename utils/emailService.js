const nodemailer = require('nodemailer');

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

// services/emailService.js
const sendNotificationEmail = async (email, opts = {}) => {
  const {
    subject = "Notificação",
    text = "Você recebeu uma nova notificação",
    html, // opcional
  } = opts;

  const mailOptions = {
    from: '"Cristãos App" <cristaosapp@gmail.com>',
    to: email,
    subject,
    text,
    ...(html ? { html } : {}),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de notificação enviado para ${email}`);
  } catch (error) {
    console.error("Erro ao enviar email de notificação:", error.message);
    // não lance erro aqui se não quiser quebrar o fluxo
    // throw new Error('Erro ao enviar email de notificação.');
  }
};



module.exports = {
  sendResetLink,
  sendVerificationLink, // Export the new function
  sendEmailUpdateVerification,
  sendNotificationEmail
};
