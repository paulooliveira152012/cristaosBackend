// utils/smsUtils.js
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID; // ou use um número direto

const client = twilio(accountSid, authToken);

const sendVerificationSMS = async (to, message) => {
  console.log("sending verification code by SMS...");

  console.log("accountSid:", accountSid);
  console.log("authToken:", authToken);
  console.log("messagingServiceSid:", messagingServiceSid);
  try {
    const res = await client.messages.create({
      body: message,
      to, // número do usuário (ex: '+5511999999999')
      messagingServiceSid, // ou: from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log(" SMS enviado:", res.sid);
    return true;
  } catch (error) {
    console.error("❌ Erro ao enviar SMS:", error);
    throw new Error("Erro ao enviar SMS");
  }
};

module.exports = { sendVerificationSMS };
