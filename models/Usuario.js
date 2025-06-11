const mongoose = require("mongoose");

// Define the user schema
const userSchema = new mongoose.Schema(
  {
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
      required: true,
      minlength: 6, // Password must be at least 6 characters long
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
    // Add fields for verification process
    verificationCode: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false, // New users are not verified by default
    },
    
    // Add reset password token and expiration fields
    resetPasswordToken: {
      type: String,
      required: false,
    },
    resetPasswordExpires: {
      type: Date,
    },
  },
  { timestamps: true }
); // Automatically adds `createdAt` and `updatedAt` fields

// Create the user model
const User = mongoose.model("User", userSchema);

module.exports = User;
