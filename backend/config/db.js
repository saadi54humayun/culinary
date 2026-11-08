const mongoose = require("mongoose");

// A Vercel function instance can handle more than one request. Reuse the
// connection in that instance and coalesce concurrent connection attempts.
let connecting = null;

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the environment");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connecting) {
    connecting = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    }).then(() => {
      console.log("MongoDB connected");
      return mongoose.connection;
    }).finally(() => {
      // A failed connection can be retried; a later disconnect can reconnect.
      connecting = null;
    });
  }

  return connecting;
}

module.exports = connectDB;
