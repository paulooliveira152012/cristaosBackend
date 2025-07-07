const jwt = require("jsonwebtoken");
const User = require("../models/Usuario");


// ✅ Middleware para proteger rotas privadas
const protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Não autorizado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
};

// ✅ Middleware para verificar token de email (ex: link de verificação de conta)
const verifyToken = async (req, res, next) => {
  const token = req.cookies.token; // ou header, dependendo do seu login
  console.log("Cookies recebidos:", req.cookies);

  console.log("TOKEN:", token)

  if (!token) return res.status(401).json({ message: "Não autenticado." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    res.status(401).json({ message: "Token inválido." });
  }
};

// (opcional) para proteger ações só de líderes
const verifyLeader = (req, res, next) => {
  if (!req.user || req.user.leader !== true && req.user.leader !== "true") {
    return res.status(403).json({ message: "Acesso negado. Apenas líderes podem realizar essa ação." });
  }
  next();
};

module.exports = { verifyToken, verifyLeader, protect };
