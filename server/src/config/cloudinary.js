import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary when enabled
if (process.env.USE_CLOUDINARY === "true") {
  console.log("Cloudinary config check:", {
    enabled: process.env.USE_CLOUDINARY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key_last4: process.env.CLOUDINARY_API_KEY?.slice(-4),
    secret_exists: Boolean(process.env.CLOUDINARY_API_SECRET),
  });

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;