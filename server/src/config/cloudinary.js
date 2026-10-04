import { v2 as cloudinary } from "cloudinary";

// Only configured when USE_CLOUDINARY=true. Otherwise the app falls back
// to local disk storage under server/src/uploads (see middleware/upload.js).
if (process.env.USE_CLOUDINARY === "true") {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;
