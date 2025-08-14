// utils/conversationKey.js
const mongoose = require("mongoose");
const { Types } = mongoose;

const normalizeId = (id) => {
  if (!id) return "";
  if (id instanceof Types.ObjectId) return id.toString();
  const s = String(id);
  if (mongoose.isValidObjectId(s)) return new Types.ObjectId(s).toString(); // <-- usa `new`
  return s;
};

const makeConversationKey = (a, b) => {
  const [x, y] = [normalizeId(a), normalizeId(b)].sort();
  return `${x}_${y}`;
};

module.exports = { makeConversationKey, normalizeId };
