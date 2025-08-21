// middleware/auth.js (ou utils/auth.js)
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// helper: pega token do header Authorization (Bearer) ou do cookie
const getTokenFromReq = (req) => {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return req.cookies?.token || null;
};

//  protege rotas privadas (aceita Bearer e/ou cookie)
const protect = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);

    if (!token) {
      return res.status(401).json({ error: "Não autorizado." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      // limpa cookie somente se ele existir
      if (req.cookies?.token) {
        res.clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        });
      }
      return res
        .status(401)
        .json({ error: "Conta não encontrada. Faça login novamente." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (req.cookies?.token) {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      });
    }
    return res.status(401).json({ error: "Sessão expirada ou inválida." });
  }
};

//  verifica token (por exemplo, em links de verificação)
const verifyToken = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Não autenticado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
      return res.status(401).json({ error: "Conta não encontrada." });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido." });
  }
};

const verifyLeader = (req, res, next) => {
  if (!req.user || (req.user.leader !== true && req.user.leader !== "true")) {
    return res
      .status(403)
      .json({
        error: "Acesso negado. Apenas líderes podem realizar essa ação.",
      });
  }
  next();
};

module.exports = { protect, verifyToken, verifyLeader };
