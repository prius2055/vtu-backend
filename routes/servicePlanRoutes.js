const express = require("express");
const router = express.Router();

const {
  createServicePlan,
  getServicePlans,
  getServicePlan,
  updateServicePlan,
  disableServicePlan,
} = require("../controllers/servicePlanController");

const protect = require("../middlewares/auth");
const restrictTo = require("../middlewares/restrictTo");

// Public
router.get("/", getServicePlans);
router.get("/:id", getServicePlan);

// Admin
router.use(protect);
router.use(restrictTo("admin"));

router.post("/", createServicePlan);
router.patch("/:id", updateServicePlan);
router.delete("/:id", disableServicePlan);

module.exports = router;
