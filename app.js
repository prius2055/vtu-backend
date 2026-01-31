const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const vtuRoutes = require("./routes/vtuRoutes");
const walletRoutes = require("./routes/walletRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/v1", authRoutes);
app.use("/api/v1/vtu", vtuRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/admin/services/", transactionRoutes);
app.use("/api/v1/transactions", transactionRoutes);

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin", transactionRoutes);

// app.use("/api/v1/plans", servicePlanRoutes);

module.exports = app;
