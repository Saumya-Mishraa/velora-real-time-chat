import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MONGO_URI is not set. Add it to your .env file.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};
