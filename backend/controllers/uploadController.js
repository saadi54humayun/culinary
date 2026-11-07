const cloudinary = require("../config/cloudinary");

async function uploadRecipeImage(req, res) {
  return uploadImageToCloudinary(req, res, "recipes");
}

async function uploadProfileImage(req, res) {
  return uploadImageToCloudinary(req, res, "profiles");
}

async function uploadImageToCloudinary(req, res, folder) {
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
          folder: `culinary/${folder}/${req.user._id}`
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );

      uploadStream.on("error", reject);
      uploadStream.end(req.file.buffer);
    });

    return res.status(201).json({
      message: "Image uploaded successfully.",
      imageUrl: result.secure_url
    });
  } catch (error) {
    console.error("Image upload failed:", error.message);

    return res.status(502).json({
      message:
        "Unable to upload the image. Check that it is a valid JPEG, PNG, or WebP and try again."
    });
  }
}

module.exports = { uploadRecipeImage, uploadProfileImage };
