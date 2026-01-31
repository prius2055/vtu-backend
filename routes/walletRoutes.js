const express = require("express");
const router = express.Router();
const {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding,
  upgradeToReseller,
} = require("../controllers/walletController");
const { protect } = require("../middleware/auth");

router.use(protect); // Protect all wallet routes

router.get("/get", protect, getWallet);
router.post("/fund", protect, initializeWalletFunding);
router.post("/verify", protect, verifyWalletFunding);
router.post("/upgrade", protect, upgradeToReseller);

// router.post("/admin/update-prices", protect, restrictTo("admin"), updatePrices);

module.exports = router;
