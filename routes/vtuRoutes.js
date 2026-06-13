const express = require("express");
const router = express.Router();
const {
  getProviderRawResult,
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
// const verifyTransactionPin = require("../middleware/verifyTransactionPin");

router.get("/result", getProviderRawResult);
router.get("/data-plans", getAllDataPlans);
router.post("/set-pin", protect, setPin);
router.post("/buy-data", protect, buyData);
router.post("/buy-airtime", protect, buyAirtime);
router.post("/validate-meter", protect, validateMeter);
router.post("/recharge-meter", protect, rechargeMeter);
router.post("/validate-cable", protect, validateCable);
router.post("/recharge-cable", protect, rechargeCable);

module.exports = router;
