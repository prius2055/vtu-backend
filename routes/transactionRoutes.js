// const express = require("express");
// const router = express.Router();
// const {
//   getAllTransactions,
//   getTransaction,
//   getUserTransactions,
// } = require("../controllers/transactionController");
// const { protect, restrictTo } = require("../middleware/authMiddleware");

// router.use(protect);

// router.get("/transactions", protect, restrictTo("admin"), getAllTransactions);

// router.get("/", protect, getUserTransactions);

// module.exports = router;

const express = require("express");
const router = express.Router();

const {
  getAllTransactions,
  getTransaction,
  getUserTransactions,
  getMarketerEarnings,
  getPlatformTransactions,
} = require("../controllers/transactionController");

const { protect, protectMarketer, restrictTo } = require("../middleware/authMiddleware");
const { scopeUserToMarketer } = require("../middleware/marketerMiddleware");

// ─────────────────────────────────────────────────────────────
// USER ROUTES
// Any logged-in user — scoped to their own transactions
// ─────────────────────────────────────────────────────────────

// GET /api/transactions/           → user's own transaction history
// GET /api/transactions/:id        → single transaction detail
router.get("/", protect, scopeUserToMarketer, getUserTransactions);
router.get("/:id", protect, scopeUserToMarketer, getTransaction);

// ─────────────────────────────────────────────────────────────
// MARKETER ROUTES
// Marketer JWT required — sees all transactions on their platform
// ─────────────────────────────────────────────────────────────

// GET /api/transactions/marketer/all       → all platform transactions
// GET /api/transactions/marketer/earnings  → earnings + commission breakdown
router.get("/marketer/all", protectMarketer, getAllTransactions);
router.get("/marketer/earnings", protectMarketer, getMarketerEarnings);

// ─────────────────────────────────────────────────────────────
// SUPERADMIN ROUTES
// Platform-wide view across ALL marketers
// ─────────────────────────────────────────────────────────────

// GET /api/transactions/admin/platform  → all transactions across all marketers
router.get(
  "/admin/platform",
  protect,
  restrictTo("superadmin"),
  getPlatformTransactions
);

module.exports = router;
