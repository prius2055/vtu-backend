// const express = require("express");
// const router = express.Router();

// const { protect, restrictTo } = require("../middleware/authMiddleware");
// const {
//   syncDataPlans,
//   updateDataPlanPrice,
// } = require("../controllers/marketerController");

// // /* ------------------------------------
// //  * 🔒 ADMIN ONLY ROUTES
// //  * ----------------------------------- */

// router.get("/data", protect, restrictTo("admin"), syncDataPlans);

// router.patch("/data/:id", protect, restrictTo("admin"), updateDataPlanPrice);

// module.exports = router;

const express = require("express");
const router = express.Router();

const {
  updateDataPlanPrice,
  getDashboard,
  getUsers,
  getUser,
  updateUserStatus,
  updateSettings,
  updateProfile,
  getWallet,
  fundWallet,
  verifyMarketerFunding,
  // requestWithdrawal,
} = require("../controllers/marketerController");

const { protectMarketer } = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────
// PUBLIC — Paystack callback (no auth)
// Paystack redirects here after payment, no JWT available
// GET /api/v1/marketer/fund/verify?reference=xxx
// ─────────────────────────────────────────────
router.get("/fund/verify", verifyMarketerFunding);

// All routes below require a valid marketer JWT
router.use(protectMarketer);

// ─────────────────────────────────────────────
// DASHBOARD
// GET /api/marketer/dashboard
// ─────────────────────────────────────────────
router.get("/dashboard", getDashboard);

// ─────────────────────────────────────────────
// WALLET
// GET /api/marketer/wallet
// ─────────────────────────────────────────────
router.get("/wallet", getWallet);
router.post("/fund", fundWallet);
// router.post("/withdraw", requestWithdrawal);

// ─────────────────────────────────────────────
// USER MANAGEMENT
// GET    /api/marketer/users
// GET    /api/marketer/users/:userId
// PATCH  /api/marketer/users/:userId/status
// ─────────────────────────────────────────────
router.get("/users", getUsers);
router.get("/users/:userId", getUser);
router.patch("/users/:userId/status", updateUserStatus);

// ─────────────────────────────────────────────
// PRICING (in use)
// GET /api/marketer/pricing
// PUT /api/marketer/pricing
// ─────────────────────────────────────────────
router.patch("/plans/:id/price", updateDataPlanPrice);

// ─────────────────────────────────────────────
// SETTINGS
// PUT /api/marketer/settings
// ─────────────────────────────────────────────
router.put("/settings", updateSettings);

// ─────────────────────────────────────────────
// PROFILE / BRANDING
// PUT /api/marketer/profile
// ─────────────────────────────────────────────
router.put("/profile", updateProfile);

module.exports = router;
