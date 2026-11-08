const session = require("express-session");
const connectMongo = require("connect-mongo");

// Supports the package's named and older CommonJS exports.
const MongoStore = connectMongo.MongoStore
  ?? connectMongo.default
  ?? connectMongo;

const SESSION_COOKIE_NAME = "culinary.sid";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
  sameSite: "lax",
  path: "/"
};

function createSessionMiddleware() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
  }

  const store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions"
  });

  store.on("error", (error) => {
    console.error("Session store error:", error.message);
  });

  return session({
    name: SESSION_COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000
    }
  });
}

module.exports = {
  createSessionMiddleware,
  SESSION_COOKIE_NAME,
  cookieOptions
};