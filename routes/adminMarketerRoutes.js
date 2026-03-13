const express = require("express");
const router = express.Router();

const {
  registerMarketer,
  approveMarketer,
  getAllMarketers,
  suspendMarketer,
  marketerLogin,
} = require("../controllers/marketerAuthController");

const { protect, restrictTo } = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────
// PUBLIC — Marketer signup (no auth needed)
// POST /api/v1/auth/marketer/register
// ─────────────────────────────────────────────
router.post("/marketer/register", registerMarketer);
router.post("/marketer/login", marketerLogin);

// ─────────────────────────────────────────────
// SUPERADMIN ONLY — Marketer management
// ─────────────────────────────────────────────
router.use(protect, restrictTo("superadmin"));

// GET  /api/v1/admin/marketers?status=pending
router.get("/", getAllMarketers);

// PATCH /api/v1/admin/marketers/:marketerId/approve
router.patch("/:marketerId/approve", approveMarketer);


// PATCH /api/v1/admin/marketers/:marketerId/suspend
router.patch("/:marketerId/suspend", suspendMarketer);



module.exports = router;