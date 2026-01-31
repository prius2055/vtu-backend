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
} = require("../controllers/vtuController");
const { protect } = require("../middleware/auth");

router.get("/data-plans", getAllDataPlans);
router.post("/buy-data", protect, buyData);
router.post("/buy-airtime", protect, buyAirtime);
router.post("/validate-meter", protect, validateMeter);
router.post("/recharge-meter", protect, rechargeMeter);
router.post("/validate-cable", protect, validateCable);
router.post("/recharge-cable", protect, rechargeCable);

module.exports = router;
