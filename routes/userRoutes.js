const express = require("express");
const bcrypt = require("bcrypt")
const crypto = require('crypto');
// Function to send emails
const { sendVerificationLink, sendResetLink } = require('../utils/emailService');
const mongoose = require("mongoose");
const User = require("../models/Usuario");
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
require('dotenv').config()

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// User Signup
// User Signup
router.post("/signup", async (req, res) => {
  const { username, email, password, profileImage } = req.body;

  console.log("Received fields:", { username, email, password, profileImage });

  try {
    // Check for missing fields
    if (!email || !password || !username) {
      console.log("Missing fields detected");
      return res.status(400).json({ message: "Todos os campos são necessários!" });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log("User already exists with email:", email);
      return res.status(400).json({ message: "Usuário já existente" });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    console.log("Generated verification token:", verificationToken);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully");

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      profileImage: profileImage || '', // Optional profile image
      verificationToken, // Store the generated verification token
      isVerified: false  // User is not verified until they confirm the email
    });

    await user.save();
    console.log("User saved successfully");

    console.log("Sending verification link to email:", email);
    // const verificationUrl = `http://localhost:3000/verifyAccount?token=${verificationToken}`;
    const verificationUrl = `https://cristaosbackend.onrender.com/verifyAccount?token=${verificationToken}`;

    // Send the email with the verification link
    await sendVerificationLink(email, verificationUrl);

    res.status(201).json({
      message: "Usuário criado com sucesso! Verifique seu email para confirmar sua conta.",
    });
  } catch (error) {
    console.log("Error during signup:", error.message);
    res.status(500).json({
      message: "Um erro ocorreu ao criar novo usuário",
      error: error.message,
    });
  }
});


// Verify Account
// Verify Account Route
router.get("/verifyAccount", async (req, res) => {
  const { token } = req.query;

  console.log("Received verification request with token:", token);

  try {
    // Find user by verification token (use verificationCode)
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: "Token de verificação inválido ou expirado." });
    }

    // Verify the user and clear the token
    user.isVerified = true;
    user.verificationCode = undefined; // Clear the token once verified
    await user.save();

    console.log("User verified successfully:", user.email);

    // Send a success response
    res.status(200).json({ message: "Conta verificada com sucesso!" });
  } catch (error) {
    console.error("Erro ao verificar a conta:", error);
    res.status(500).json({ message: "Erro ao verificar a conta.", error: error.message });
  }
});



// User Login
router.post("/login", async (req, res) => {
  console.log("na rota de login")
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Todos os campos são necessários" });
    }

    // Find user by username
    const user = await User.findOne({ email });
    console.log("user is:", user);
    
    if (!user) {
      return res.status(400).json({ message: "Credenciais inválidas" });
    }

    if (user.password !== password) {
      console.log("Senha invalida")
    }

    // Check if the user is verified
    if (!user.isVerified) {
      return res.status(403).json({ message: "Verifique sua conta antes de fazer login." });
    }

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Credenciais inválidas" });
    }

    // Remove the password from the user object before sending it back
    const userObject = user.toObject();
    delete userObject.password;

    // Send response back excluding password
    res.status(200).json(userObject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// User Signout
router.post("/signout", (req, res) => {
  res.json({ msg: "Sessão encerrada!" });
});

// Delete User Account
router.delete("/delete-account/:id", async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });

    const result = await User.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Forgot Password Route
router.post("/forgotPassword", async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a new reset token (similar to verification code but for password reset)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Set the reset token and expiration time on the user model
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration

    // Save the updated user with the reset token
    await user.save();

    console.log(`Sending password reset link to email: ${email}`);

    // create the reset link with the token as a query parameter
    // const resetLink = `http://localhost:3000/passwordReset?token=${resetToken}`
    const resetLink = `https://cristaosbackend.onrender.com/passwordReset?token=${resetToken}`
    
    // Send reset token to the user's email
    await sendResetLink(email, resetLink);

    res.status(200).json({
      message: "Password reset link has been sent to your email.",
    });

  } catch (error) {
    console.error("Error in /forgotPassword:", error);
    res.status(500).json({ message: "An error occurred while sending the reset link." });
  }
});


// Route to update password
router.put("/resetPassword", async (req, res) => {
  const { newPassword, confirmNewPassword, token } = req.body;

  console.log("received token:", token);
  console.log("newPassword is:", newPassword);
  console.log("confirmNewPassword is:", confirmNewPassword);

  // Validate passwords
  if (!newPassword || !confirmNewPassword) {
    console.log("Both fields required");
    return res.status(400).json({ message: "Por favor preencher todos os campos" });
  }

  if (newPassword !== confirmNewPassword) {
    console.log("Passwords do not match");
    return res.status(400).json({ message: "As senhas nao correspondem, por favor preencher novamente" });
  }

  try {
    // Find the user by reset token and ensure it's not expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Ensure the token has not expired
    });

    if (!user) {
      console.log("Token is invalid or has expired");
      return res.status(400).json({ message: "Token inválido ou expirado" });
    }

    console.log("User found with valid token");

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the user's password and remove the reset token and expiration
    user.password = hashedPassword;
    user.resetPasswordToken = undefined; // Clear the reset token
    user.resetPasswordExpires = undefined; // Clear the token expiration time

    await user.save();
    console.log("Password successfully updated");

    res.status(200).json({ message: "Senha atualizada com sucesso" });
    
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server error, please try again later" });
  }
});


module.exports = router;
