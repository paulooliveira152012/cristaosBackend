const express = require('express');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');
const router = express.Router();
const uuidv4 = require('uuid').v4;

// Configure AWS S3 Client using environment variables
const s3 = new S3Client({
  region: 'us-east-2',
  credentials: {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer setup for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const fileName = `${uuidv4()}.jpg`;

    const params = {
      Bucket: "cristaos", // Your bucket name
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype, // Get the file's MIME type
    };

    // Upload file to S3
    const data = await s3.send(new PutObjectCommand(params));

    // Construct the URL for the uploaded file
    const s3Url = `https://cristaos.s3.us-east-2.amazonaws.com/${fileName}`;
    res.status(200).json({ url: s3Url });
  } catch (error) {
    console.error("Error uploading to S3:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

module.exports = router;
