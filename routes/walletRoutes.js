const express = require("express");
const router = express.Router();
const {
  getWallet,
  createVirtualAccount,
  upgradeToReseller,
} = require("../controllers/walletController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // Protect all wallet routes

router.get("/get", protect, getWallet);
router.post("/fund", protect, createVirtualAccount);
router.post("/upgrade", protect, upgradeToReseller);

// router.post("/admin/update-prices", protect, restrictTo("admin"), updatePrices);

module.exports = router;
