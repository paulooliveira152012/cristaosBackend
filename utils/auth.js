const jwt = require("jsonwebtoken");
const User = require("../models/Usuario");

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

const verifyLeader = (req, res, next) => {
  if (!req.user || req.user.leader !== true && req.user.leader !== "true") {
    return res.status(403).json({ message: "Acesso negado. Apenas líderes podem realizar essa ação." });
  }
  next();
};

module.exports = { verifyToken, verifyLeader };
