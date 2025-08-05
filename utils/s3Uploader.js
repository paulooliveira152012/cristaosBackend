// utils/s3Uploader.js

const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

// Configuração do S3 (use as env vars no .env)
const s3 = new AWS.S3({
  region: "us-east-2", // ajuste se necessário
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

/**
 * Upload de arquivo local para o S3.
 * @param {string} filePath - Caminho do arquivo local
 * @param {string} contentType - MIME type (ex: "video/mp4")
 * @returns {Promise<string>} - URL pública do S3
 */
const uploadToS3 = async (filePath, contentType) => {
  const fileContent = fs.readFileSync(filePath);
  const fileName = `${uuidv4()}${path.extname(filePath)}`;

  const params = {
    Bucket: "cristaos", // substitua com seu bucket
    Key: fileName,
    Body: fileContent,
    ContentType: contentType,
  };

  const data = await s3.upload(params).promise();

  return data.Location; // URL pública
};

module.exports = { uploadToS3 };
