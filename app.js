// const express = require("express");
// const cors = require("cors");
// const authRoutes = require("./routes/authRoutes");
// const vtuRoutes = require("./routes/vtuRoutes");
// const walletRoutes = require("./routes/walletRoutes");
// const transactionRoutes = require("./routes/transactionRoutes");
// const epinsRoutes = require("./routes/epinsRoutes");
// const marketerRoutes = require("./routes/marketerRoutes");
// const { resolveMarketer } = require("./middleware/marketerMiddleware");

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.use(resolveMarketer);

// app.use("/api/v1", authRoutes);
// app.use("/api/v1/vtu", vtuRoutes);
// app.use("/api/v1/wallet", walletRoutes);
// app.use("/api/v1/admin/services/", transactionRoutes);
// app.use("/api/v1/transactions", transactionRoutes);

// app.use("/api/v1/epins", epinsRoutes);

// app.use("/api/v1/marketer", marketerRoutes);

// module.exports = app;

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const vtuRoutes = require("./routes/vtuRoutes");
const walletRoutes = require("./routes/walletRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const epinsRoutes = require("./routes/epinsRoutes");
const marketerRoutes = require("./routes/marketerRoutes");
const adminMarketerRoutes = require("./routes/adminMarketerRoutes");

const { resolveMarketer } = require("./middleware/marketerMiddleware");
const { paystackWebhook } = require("./controllers/walletController");

const app = express();

/* ─────────────────────────────────────────────────────────────
 * 1. CORS
 * Allow all origins — required since marketer custom domains
 * are unknown at build time.
 * ───────────────────────────────────────────────────────────── */
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all localhost subdomains in dev
      // Allow all real domains in prod (tighten later)
      if (!origin || origin.includes("localhost")) {
        return callback(null, true);
      }
      callback(null, true);
    },
    credentials: true,
  }),
);

/* ─────────────────────────────────────────────────────────────
 * 2. PAYSTACK WEBHOOK
 *
 * ⚠️ MUST be registered BEFORE express.json().
 * Paystack signature verification requires the raw request body.
 * If express.json() runs first, JSON.stringify(req.body) produces
 * a different string and the HMAC check always fails.
 * ───────────────────────────────────────────────────────────── */
app.post(
  "/api/v1/wallet/webhook",
  express.raw({ type: "application/json" }),
  paystackWebhook,
);

/* ─────────────────────────────────────────────────────────────
 * 3. BODY PARSERS
 * After webhook — all other routes use parsed JSON
 * ───────────────────────────────────────────────────────────── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─────────────────────────────────────────────────────────────
 * 4. RESOLVE MARKETER (global)
 * Identifies which marketer platform every request belongs to
 * based on the incoming domain. Sets req.marketer on all routes.
 * ───────────────────────────────────────────────────────────── */
app.use(resolveMarketer);

/* ─────────────────────────────────────────────────────────────
 * 5. HEALTH CHECK
 * ───────────────────────────────────────────────────────────── */
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    platform: req.marketer?.brandName || "Main Platform",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

/* ─────────────────────────────────────────────────────────────
 * 6. ROUTES
 * ───────────────────────────────────────────────────────────── */
app.use("/api/v1", authRoutes);
app.use("/api/v1/vtu", vtuRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/transactions", transactionRoutes); 
app.use("/api/v1/epins", epinsRoutes);
app.use("/api/v1/marketer", marketerRoutes);

/* ─────────────────────────────────────────────────────────────
 * 7. 404 HANDLER
 * Catches any request that didn't match a route above
 * ───────────────────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

/* ─────────────────────────────────────────────────────────────
 * 8. GLOBAL ERROR HANDLER
 *
 * Catches any error passed via next(err) from any route
 * or middleware. Prevents unhandled crashes from leaking
 * stack traces to clients in production.
 * ───────────────────────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error("🔥 UNHANDLED ERROR:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      status: "fail",
      message: "Validation error",
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({
      status: "fail",
      message: `Duplicate value for ${field}. Please use a different value.`,
    });
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({
      status: "fail",
      message: `Invalid value for ${err.path}: ${err.value}`,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      status: "fail",
      message: "Invalid token. Please log in again.",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "fail",
      message: "Token expired. Please log in again.",
    });
  }

  // Default — hide internal details in production
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: "error",
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong. Please try again."
        : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

app.use("/api/v1/auth/marketer", marketerRoutes); // public signup
app.use("/api/v1/admin/marketers", adminMarketerRoutes); // superadmin management

module.exports = app;
