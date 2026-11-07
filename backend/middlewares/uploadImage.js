const multer = require("multer");

const receiveImage = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0
  },

  fileFilter(req, file, callback) {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error("Please upload a JPEG, PNG, or WebP image.")
      );
    }

    callback(null, true);
  }
}).single("image");

function uploadImage(req, res, next) {
  receiveImage(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Your image must be 5 MB or smaller."
            : error.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image."
      });
    }

    next();
  });
}

module.exports = uploadImage;