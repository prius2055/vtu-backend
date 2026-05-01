const express = require("express");
const router = express.Router();
const {
  getBalance,
  buyAirtime,
  buyData,
  getAllDataPlans,
  rechargeMeter,
  validateMeter,
  validateCable,
  rechargeCable,
  setPin,
} = require("../controllers/vtuController");
const { protect } = require("../middleware/authMiddleware");
const verifyTransactionPin = require("../middleware/verifyTransactionPin");

router.get("/data-plans", getAllDataPlans);
router.post("/set-pin", protect, setPin);
router.post("/buy-data", protect, verifyTransactionPin, buyData);
router.post("/buy-airtime", protect, verifyTransactionPin, buyAirtime);
router.post("/validate-meter", protect, verifyTransactionPin, validateMeter);
router.post("/recharge-meter", protect, verifyTransactionPin, rechargeMeter);
router.post("/validate-cable", protect, verifyTransactionPin, validateCable);
router.post("/recharge-cable", protect, verifyTransactionPin, rechargeCable);

module.exports = router;
