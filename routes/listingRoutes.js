const express = require("express");
const Listing = require("../models/Listing");
const Reel = require("../models/Reels");
const Comment = require("../models/Comment");
const router = express.Router();
// const User = require("../models/User");
const User = require("../models/Usuario");
// const createNotification = require("../utils/notificationUtils");
// const createNotificationController = require("../controllers/notificationController");
const createNotificationUtil = require("../utils/notificationUtils");
// const createNotification = require("../controllers/notificationController")
const { uploadToS3 } = require("../utils/s3Uploader"); // sua função já existente

// Get All Listings
// Get All Listings
router.get("/alllistings", async (req, res) => {
  console.log("You've reached the backend to fetch all items!");
  try {
    const listings = await Listing.find()
      .populate("userId", "username profileImage") // criador da postagem
      .populate("poll.votes.userId", "username profileImage"); // quem votou

    res.status(200).json({ listings });
  } catch (error) {
    console.log("error:", error);
    res.status(500).json({ message: "Error fetching listings", error });
  }
});





// Create Listing
router.post("/create", async (req, res) => {
  const {
    userId,
    type,
    blogTitle,
    blogContent,
    imageUrl,
    link,
    poll,
    tags,
    linkDescription,
  } = req.body;
  console.log("create route reached!");
  try {
      const newListing = new Listing({
        userId,
        type,
        blogTitle,
        blogContent,
        imageUrl,
        link,
        poll,
        tags,
        linkDescription,
      });

      await newListing.save();
      return res
        .status(201)
        .json({
          message: "Listing created successfully!",
          listing: newListing,
        });
  } catch (error) {
    console.error("Error creating listing:", error);
    res.status(500).json({ message: "Error creating listing", error });
  }
});

// edit listing
// PUT /edit/:id
router.put("/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const listing = await Listing.findById(id);
    if (!listing) return res.status(404).json({ message: "Listagem não encontrada" });

    // Bloqueia campos sensíveis
    delete body.type;
    delete body.userId;
    delete body.votes;
    if (body.poll) delete body.poll.votes;

    const updates = {};

    switch (listing.type) {
      case "blog":
        if (typeof body.blogTitle === "string") updates.blogTitle = body.blogTitle.trim();
        if (typeof body.blogContent === "string") updates.blogContent = body.blogContent;
        if (typeof body.imageUrl === "string") updates.imageUrl = body.imageUrl.trim();
        break;

      case "image":
        if (typeof body.imageUrl === "string") updates.imageUrl = body.imageUrl.trim();
        if (typeof body.caption === "string") updates.caption = body.caption;
        break;

      case "poll":
        if (body.poll && typeof body.poll.question === "string") {
          updates["poll.question"] = body.poll.question.trim();
        }
        if (body.poll && Array.isArray(body.poll.options)) {
          const options = body.poll.options.map(o => String(o).trim()).filter(Boolean);
          if (options.length < 2) {
            return res.status(400).json({ message: "Enquete precisa de pelo menos 2 opções." });
          }
          updates["poll.options"] = options;
          if (body.resetVotes === true) updates["poll.votes"] = [];
        }
        break;

      default:
        return res.status(400).json({ message: `Tipo não suportado: ${listing.type}` });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nada para atualizar." });
    }

    updates.updatedAt = new Date();

    const updatedListing = await Listing.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    )
      .populate("userId", "username profileImage")
      .lean();

    res.json({ updatedListing });
  } catch (err) {
    console.error("PUT /edit/:id error:", err);
    res.status(500).json({ message: "Erro ao atualizar listagem" });
  }
});


// http://localhost:5001/api/listings/users/:userId
// http://localhost:5001/api/listings/users/66ea3b118be39848e1d002f4

// Get Listings by User
// Get Listings by User
router.get("/users/:userId", async (req, res) => {
  console.log("user's listings route hit!");
  const { userId } = req.params;

  try {
    const user = await User.findById(userId)
    .populate({ path: "church", select: "name denomination _id" })
    .lean()

    if (!user) return res.status(404).json({ message: "User not found" });

    const listings = await Listing.find({ userId })
      .populate("userId", "username profileImage")
      .populate("poll.votes.userId", "profileImage username")
      .lean();

    res.status(200).json({ user, listings });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user info and listings", error });
  }
});

// Get Listing by ID
router.get("/listings/:id", async (req, res) => {
  console.log("backend reached for fetch items [WITHOUT COMMENTS] ");

  const { id } = req.params;
  console.log("the listing id is", id);

  try {
    const listing = await Listing.findById(id);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    // fetch only commments with matching ID
    const comments = await Comment.find({ listingId: id });

    console.log("sending the data to frontEnd:", { listing, comments });
    res.status(200).json({ listing, comments });
  } catch (error) {
    console.error("Error fetching listing:", error); // Log full error details
    res.status(500).json({ message: "Error fetching listing", error });
  }
});

// Like/Unlike a Listing
router.put("/listingLike/:listingId", async (req, res) => {
  console.log(
    "🟢 [1] Route found! Toggling like no banco de dados + chamada do notification controller"
  );

  const { listingId } = req.params;
  const { userId } = req.body;
  console.log("Listing ID:", listingId);
  console.log("User ID:", userId);

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      console.log("Listing não encontrada");
      return res.status(404).json({ message: "Listing não encontrada" });
    }

    // Verifique a lista de likes antes da alteração
    console.log("Lista de likes antes da alteração:", listing.likes);

    // Toggle o status de like
    const isLiked = listing.likes.includes(userId);
    listing.likes = isLiked
      ? listing.likes.filter((id) => id.toString() !== userId.toString()) // Remove o like
      : [...listing.likes, userId]; // Adiciona o like

    console.log(isLiked ? "Removendo like..." : "Adicionando like...");

    // verificar se ha auteracoes nos comments
    console.log("Comentários antes de salvar:", listing.comments);

    // Salvar as mudanças
    await listing.save({ validateBeforeSave: false });

    const user = await User.findById(userId);
    console.log("o usuario que curtiu foi:", user);

    // const io = req.app.get("io");

    // console.log("io:", io)

    // console.log("📡 io existe?", !!io); // true/false

    // ✅ Se for um novo like e o dono do post for diferente do usuário
    if (!isLiked && listing.userId.toString() !== userId.toString()) {
      await createNotificationUtil({
        io: req.app.get("io"),
        recipient: listing.userId,
        fromUser: userId,
        type: "like",
        content: `${user.username} curtiu seu post!`,
        listingId: listing._id,
      });
    }

    console.log("new notification created!");

    console.log("Lista de likes após a alteração:", listing.likes);
    res.status(200).json({ likes: listing.likes });
  } catch (error) {
    console.error("Erro ao atualizar o status de like:", error);
    res.status(500).json({ message: "Erro ao atualizar o status de like" });
  }
});

// Route to handle liking/unliking a comment
router.put("/comments/:commentId/like", async (req, res) => {
  console.log("rota nolistingRoutes.js");
  const { commentId } = req.params;
  const { userId } = req.body;

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Check if the user has already liked the comment
    const isLiked = comment.likes.includes(userId);
    comment.likes = isLiked
      ? comment.likes.filter((id) => id.toString() !== userId.toString()) // Unlike
      : [...comment.likes, userId]; // Like

    await comment.save();

    res.status(200).json({ likes: comment.likes });
  } catch (error) {
    console.error("Error updating like status for comment:", error);
    res.status(500).json({ message: "Error updating like status" });
  }
});

// Route to handle liking/unliking a reply to a comment
router.put(
  "/comments/:parentCommentId/replies/:replyId/like",
  async (req, res) => {
    const { parentCommentId, replyId } = req.params;
    const { userId } = req.body;

    try {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Find the reply within the parent comment
      const reply = parentComment.replies.id(replyId);
      if (!reply) {
        return res.status(404).json({ message: "Reply not found" });
      }

      // Check if the user has already liked the reply
      const isLiked = reply.likes.includes(userId);
      reply.likes = isLiked
        ? reply.likes.filter((id) => id.toString() !== userId.toString()) // Unlike
        : [...reply.likes, userId]; // Like

      await parentComment.save();

      res.status(200).json({ likes: reply.likes });
    } catch (error) {
      console.error("Error updating like status for reply:", error);
      res.status(500).json({ message: "Error updating like status" });
    }
  }
);

// Share (Repost) Listing
router.post("/share/:listingId", async (req, res) => {
  console.log("Voce acessou a rota de compartilhamento");

  const { listingId } = req.params;
  const { userId } = req.body;

  console.log("The listing ID is:", listingId);
  console.log("The user ID is:", userId);

  try {
    // Find the original listing by ID
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Convert the listing to a plain JS object and remove the _id field
    const listingData = listing.toObject();
    delete listingData._id; // Remove the original _id to avoid duplicate key error

    // Create a new listing with the current user's ID and current date
    const newListing = new Listing({
      ...listingData,
      userId, // The user reposting the listing
      createdAt: new Date(), // Set the repost date as the new creation date
    });

    // Save the reposted listing
    await newListing.save();

    // Return success response with the new listing data
    res
      .status(201)
      .json({ message: "Listing reposted successfully", newListing });
  } catch (error) {
    console.error("Error reposting listing:", error);
    res.status(500).json({ message: "Error reposting listing", error });
  }
});

// Delete Listing
router.delete("/delete/:listingId", async (req, res) => {
  console.log("delete lisitng route reached");
  const { listingId } = req.params;

  try {
    const deletedListing = await Listing.findByIdAndDelete(listingId);
    if (!deletedListing)
      return res.status(404).json({ message: "Listing not found" });

    res
      .status(200)
      .json({ message: "Listing deleted successfully", listingId });
  } catch (error) {
    res.status(500).json({ message: "Error deleting listing", error });
  }
});

// Add Reply to Comment
router.post(
  "/listings/:listingId/comment/:parentCommentId/reply",
  async (req, res) => {
    const { listingId, parentCommentId } = req.params;
    const { userId, commentText } = req.body;

    try {
      const listing = await Listing.findById(listingId);
      if (!listing)
        return res.status(404).json({ message: "Listing not found" });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const newReply = new Comment({
        text: commentText,
        user: userId,
        listingId,
        parentCommentId,
      });
      await newReply.save();

      await Comment.findByIdAndUpdate(parentCommentId, {
        $push: { replies: newReply._id },
      });

      res.status(200).json({ message: "Reply added", reply: newReply });
    } catch (error) {
      res.status(500).json({ message: "Error adding reply", error });
    }
  }
);

router.post("/:listingId/vote", async (req, res) => {
  const { listingId } = req.params;
  const { userId, optionIndex } = req.body;

  try {
    const listing = await Listing.findById(listingId);

    // Impedir múltiplos votos
    const alreadyVoted = listing.poll.votes.find(
      (v) => v.userId.toString() === userId
    );

    if (alreadyVoted) {
      return res.status(400).json({ message: "Você já votou." });
    }

    // Adiciona o voto
    listing.poll.votes.push({ userId, optionIndex });

    await listing.save();

    res.status(200).json({ updatedPoll: listing.poll });
  } catch (err) {
    console.error("Erro ao votar:", err);
    res.status(500).json({ message: "Erro interno ao votar." });
  }
});

module.exports = router;
