import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    console.log(process.env.MONGO_URI);
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not set in environment variables");

    mongoose.set("strictQuery", true);

    await mongoose.connect(uri);

    console.log(
      `[db] MongoDB connected -> ${mongoose.connection.host}/${mongoose.connection.name}`,
    );

    mongoose.connection.on("error", (err) => {
      console.error("[db] MongoDB connection error:", err.message);
    });
  } catch (err) {
    console.error("[db] Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
};
