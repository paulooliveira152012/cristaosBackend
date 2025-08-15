// models/Conversation.js
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    requester:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    waitingUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    status: {
      type: String,
      enum: ["pending", "active", "declined", "left"],
      default: "pending",
    },

    pairKey: { type: String, index: true }, // `${minId}:${maxId}`

    requestedAt: { type: Date },
    respondedAt: { type: Date },

    leavingUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "DirectMessage" },
  },
  { timestamps: true }
);

// índices
conversationSchema.index(
  { pairKey: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
conversationSchema.index({ participants: 1 });
conversationSchema.index({ waitingUser: 1, status: 1 });
conversationSchema.index({ requester: 1, status: 1 });
conversationSchema.index({ updatedAt: -1 });

// helper
conversationSchema.statics.makePairKey = (a, b) => {
  const [x, y] = [String(a), String(b)].sort();
  return `${x}:${y}`;
};

// normalização + pairKey + requestedAt
conversationSchema.pre("save", function(next) {
  if (Array.isArray(this.participants)) {
    const set = new Set(this.participants.map(String));
    this.participants = Array.from(set);
  }
  if (!this.pairKey) {
    const a = this.requester || this.participants?.[0];
    const b = this.waitingUser || this.participants?.find(p => String(p) !== String(a));
    if (a && b) {
      const [x, y] = [String(a), String(b)].sort();
      this.pairKey = `${x}:${y}`;
    }
  }
  if ((this.isModified("status") || this.isNew) && this.status === "pending" && !this.requestedAt) {
    this.requestedAt = new Date();
  }
  next();
});

module.exports = mongoose.model("Conversation", conversationSchema);
