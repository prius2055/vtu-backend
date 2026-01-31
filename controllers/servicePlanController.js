const ServicePlan = require("../models/dataPlanModel");

const getServicePlan = async (req, res) => {
  const plan = await ServicePlan.findById(req.params.id);

  if (!plan) {
    return res.status(404).json({
      status: "fail",
      message: "Plan not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: plan,
  });
};

module.exports = {
  // getServicePlans,
  getServicePlan,
};
