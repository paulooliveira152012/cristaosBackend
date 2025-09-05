// socketAuthMiddleware.js (exemplo)
const jwt = require("jsonwebtoken");
const User = require("../../models/User");

function parseCookie(header = "") {
  return Object.fromEntries(
    header.split(/; */).map(kv => {
      const idx = kv.indexOf("="); 
      if (idx < 0) return [kv, ""];
      const k = decodeURIComponent(kv.slice(0, idx).trim());
      const v = decodeURIComponent(kv.slice(idx + 1).trim());
      return [k, v];
    })
  );
}

module.exports = function authMiddleware(io) {
  io.use(async (socket, next) => {
    try {
      // token pode vir em handshake.auth.token (recomendado) ou no cookie
      const fromAuth = socket.handshake.auth?.token;
      const cookies = parseCookie(socket.handshake.headers?.cookie || "");
      const fromCookie = cookies.token;
      const token = fromAuth || fromCookie;
      if (!token) return next(new Error("unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // sv
      const currentSv = Number(process.env.SESSIONS_VERSION || 1);
      if (Number(decoded.sv || 1) !== currentSv) return next(new Error("unauthorized"));

      // carrega user
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("unauthorized"));

      // tv
      const tokenTv = Number(decoded.tv || 0);
      const userTv = Number(user.tokenVersion || 0);
      if (tokenTv !== userTv) return next(new Error("unauthorized"));

      // ban
      if (user.isBanned) return next(new Error("banned"));

      // ok: anexa e entra na sala do user
      socket.data.userId = String(user._id);
      socket.join(`user:${user._id}`);

      return next();
    } catch (err) {
      return next(new Error("unauthorized"));
    }
  });
};
