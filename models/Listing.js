// models/Listing.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const commentSchema = new Schema({
  text: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: String,
  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  replies: [{
    text: String,
    user: { type: Schema.Types.ObjectId, ref: "User" },
    username: String,
    profileImage: String,
    createdAt: { type: Date, default: Date.now },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
  }],
  likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
});

const listingSchema = new Schema({
  type: { type: String, required: true },           // "blog" | "image" | "poll" | "link"
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

  blogTitle: String,
  blogContent: String,
  imageUrl: String,
  link: String,
  linkDescription: String,

  poll: {
    question: String,
    options: [String],
    votes: [{
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      optionIndex: Number,
    }],
  },

  likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
  comments: [commentSchema],

  // Quem compartilhou este listing
  shares: [{ type: Schema.Types.ObjectId, ref: "User" }],

  // Contador para consultas rápidas
  sharesCount: { type: Number, default: 0 },

  hidden: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

// índices úteis
listingSchema.index({ userId: 1, createdAt: -1 });
listingSchema.index({ shares: 1 });

module.exports = mongoose.model("Listing", listingSchema);
