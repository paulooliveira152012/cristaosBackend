const mongoose = require("mongoose");

// Define the user schema
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      unique: false,
      trim: true,
      default: "User",
    },

    lastName: {
      type: String,
      required: false,
      unique: false,
      trim: true,
    },

    city: {
      type: String,
      required: false,
      unique: false,
      trim: true,
    },

    state: {
      type: String,
      required: false,
      unique: false,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true, // Ensures username is unique
      trim: true, // Removes extra spaces
    },
    email: {
      type: String,
      required: true,
      unique: true, // Ensures email is unique
      lowercase: true, // Converts email to lowercase
      validate: {
        validator: function (v) {
          return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v); // Regular expression to validate email format
        },
        message: (props) => `${props.value} is not a valid email!`,
      },
    },
    password: {
      type: String,
      required: false,
      minlength: 6, // Password must be at least 6 characters long
    },
    phone: {
      type: Number,
      required: false,
    },
    profileImage: {
      type: String,
      default: "", // If no profile image is provided, use an empty string
    },
    sharedListings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Listing" }], // Reference to shared listings
    // verification at sign up
    verificationToken: {
      type: String,
      required: false,
    },

    // atualização de email
    emailUpdateToken: { type: String },
    newEmail: { type: String },

    // Add fields for verification process
    verificationCode: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false, // New users are not verified by default
    },

    // models/User.js
    hasAcceptedTerms: {
      type: Boolean,
      default: false,
    },

    termsVersion: {
      type: String,
      default: null,
    },

    hasAcceptedTermsAt: {
      type: Date,
      default: null,
    },

    // Add reset password token and expiration fields
    resetPasswordToken: {
      type: String,
      required: false,
    },
    resetPasswordExpires: {
      type: Date,
    },

    // leader
    leader: {
      type: Boolean,
      required: false,
      default: false,
    },

    role: {
      type: String,
      required: true,
      default: "member",
    },

    // friend requests
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // recebidos

    // sent friend requests
    sentFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // enviados

    // friends
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // chat requests
    chatRequestsSent: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // pending chat requests
    chatRequestsReceived: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // main chat read
    lastMainChatRead: {
      type: Date,
      default: null,
    },

    lastReadTimestamps: {
      type: Map,
      of: Date,
      default: {},
    },

    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
    },

    bio: {
      type: String,
      default: "",
    },

    profileCoverImage: {
      type: String,
      default: "",
    },

    notificationsByEmail: { type: Boolean, default: true },

    // Subdoc inline, sem schema separado e sem coleção própria
strikes: {
  type: [{
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },
    reason:    { type: String, default: "" },
    issuedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    issuedAt:  { type: Date, default: Date.now },
  }],
  default: [],                                  // nunca undefined
  set: (v) => (Array.isArray(v) ? v.filter(Boolean) : []), // converte "" -> []
},


    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    banReason: { type: String, default: "" },
  },
  { timestamps: true }
); // Automatically adds `createdAt` and `updatedAt` fields

// 🔒 Rede de segurança para garantir que strikes nunca seja string
userSchema.pre("validate", function(next) {
  if (!Array.isArray(this.strikes)) {
    this.strikes = [];
  }
  next();
});

// Create the user model
const User = mongoose.model("User", userSchema);

module.exports = User;
