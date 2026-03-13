const express = require("express");
const router = express.Router();
const {
  buyEpins,
  getEPins,
  markPrinted,
} = require("../controllers/epinsController");
const { protect } = require("../middleware/authMiddleware");

router.post("/buy", protect, buyEpins);
router.get("/", protect, getEPins);
router.post("/printed", protect, markPrinted);

module.exports = router;
