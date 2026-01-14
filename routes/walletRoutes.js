const express = require("express");
const router = express.Router();
const {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding,
} = require("../controllers/walletController");
const { protect } = require("../middleware/auth");

router.use(protect); // Protect all wallet routes

router.route("/").get(getWallet);

router.post("/fund", protect, initializeWalletFunding);
router.post("/verify", protect, verifyWalletFunding);

// router.post("/admin/update-prices", protect, restrictTo("admin"), updatePrices);

module.exports = router;
