const express = require("express");
const multer = require("multer");
const { uploadToS3 } = require("../utils/s3Uploader");
const Add = require("../models/Add");
const fs = require("fs");

const router = express.Router();
const upload = multer({ dest: "uploads/" });



// Adicionar anúncio
router.post("/add", upload.single("image"), async (req, res) => {
  console.log("Add Route REACHED");
  try {
    let imageUrl = null;
    if (req.file) {
      console.log("Imagem recebida para upload:", req.file.path);
      try {
        imageUrl = await uploadToS3(req.file.path, req.file.mimetype);
        console.log("Upload para S3 concluído:", imageUrl);
      } catch (err) {
        console.error("Erro ao fazer upload para S3:", err);
      }
      try {
        fs.unlinkSync(req.file.path);
        console.log("Arquivo temporário removido:", req.file.path);
      } catch (err) {
        console.error("Erro ao remover arquivo temporário:", err);
      }
    } else {
      console.log("Nenhuma imagem recebida.");
    }
    const { title, description, price, link, createdBy } = req.body;
    console.log("Dados recebidos:", { title, description, price, link, createdBy });
    const newAd = new Add({
      title,
      description,
      price,
      imageUrl,
      link,
      createdBy: createdBy || req.user._id // assume que o usuário autenticado é o criador
    });
    await newAd.save();
    // Emitir evento para notificar sobre o novo anúncio

    const io = req.app.get("io");

    if (!io) {
      console.error("Socket.io não está configurado.");
      return res.status(500).json({ message: "Erro ao configurar Socket.io." });
    }
    console.log("Socket.io está configurado, emitindo evento 'newAdCreated'.");
    // Envia o anúncio inteiro para todos os clientes conectados
    // Isso pode ser útil para atualizar a lista de anúncios em tempo real
    io.emit("newAdCreated", newAd); // envia o ad inteiro para todos os clientes

    console.log("Anúncio salvo no banco:", newAd);
    res.status(201).json({ message: "Anúncio criado com sucesso!", ad: newAd });
  } catch (error) {
    console.error("Erro ao criar anúncio:", error);
    res.status(500).json({ message: "Erro ao criar anúncio", error });
  }
});

// Editar anúncio
router.put("/edit/:adId", upload.single("image"), async (req, res) => {
  console.log("Edit Route REACHED");
  try {
    const { adId } = req.params;
    console.log("ID do anúncio para editar:", adId);
    let imageUrl = null;
    if (req.file) {
      console.log("Nova imagem recebida para upload:", req.file.path);
      try {
        imageUrl = await uploadToS3(req.file.path, req.file.mimetype);
        console.log("Upload para S3 concluído:", imageUrl);
      } catch (err) {
        console.error("Erro ao fazer upload para S3:", err);
      }
      try {
        fs.unlinkSync(req.file.path);
        console.log("Arquivo temporário removido:", req.file.path);
      } catch (err) {
        console.error("Erro ao remover arquivo temporário:", err);
      }
    } else {
      console.log("Nenhuma nova imagem recebida.");
    }
    const updateData = { ...req.body };
    if (imageUrl) updateData.imageUrl = imageUrl;
    console.log("Dados para atualização:", updateData);
    const updatedAd = await Add.findByIdAndUpdate(adId, updateData, { new: true });
    if (!updatedAd) {
      console.log("Anúncio não encontrado para editar.");
      return res.status(404).json({ message: "Anúncio não encontrado." });
    }
    console.log("Anúncio editado com sucesso:", updatedAd);
    res.status(200).json({ message: "Anúncio editado com sucesso!", ad: updatedAd });

    const io = req.app.get("io")

    if (!io) {
      console.log("Io nao estabelecido")
      return res.status(500).json({ message: "Erro ao configurar Socket.io." });
    }

    io.emit("updatedAd", updatedAd)

  } catch (error) {
    console.error("Erro ao editar anúncio:", error);
    res.status(500).json({ message: "Erro ao editar anúncio", error });
  }
});

// Excluir anúncio
router.delete("/delete/:adId", async (req, res) => {
  console.log("Delete Route REACHED");
  try {
    const { adId } = req.params;
    console.log("ID do anúncio para excluir:", adId);
    const deletedAd = await Add.findByIdAndDelete(adId);
    if (!deletedAd) {
      console.log("Anúncio não encontrado para exclusão.");
      return res.status(404).json({ message: "Anúncio não encontrado." });
    }
    console.log("Anúncio excluído com sucesso:", deletedAd);
    const io = req.app.get("io");

    if (!io) {
      console.error("Socket.io não está configurado.");
      return res.status(500).json({ message: "Erro ao configurar Socket.io." });
    }
    console.log("Socket.io está configurado, emitindo evento 'newAdCreated'.");

    console.log("Emitindo evento 'adDeleted'");
    io.emit("adDeleted", { _id: deletedAd._id }); // envia só o essencial
    res.status(200).json({ message: "Anúncio excluído com sucesso!" });

  } catch (error) {
    console.error("Erro ao excluir anúncio:", error);
    res.status(500).json({ message: "Erro ao excluir anúncio", error });
  }
});

// Listar anúncios
router.get("/view", async (req, res) => {
  console.log("View Route REACHED");
  try {
    const ads = await Add.find().populate("createdBy", "username");
    console.log("Anúncios encontrados:", ads.length);
    res.status(200).json(ads);
  } catch (error) {
    console.error("Erro ao listar anúncios:", error);
    res.status(500).json({ message: "Erro ao listar anúncios", error });
  }
});

module.exports = router;