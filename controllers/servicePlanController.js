const ServicePlan = require("../models/dataPlanModel");
const { updateServicePlanPrice } = require("./adminController");

// const getServicePlans = async (req, res) => {
//   try {
//     const { serviceType, network } = req.query;

//     const filter = {
//       isActive: true,
//       ...(serviceType && { serviceType }),
//       ...(network && { network }),
//     };

//     const plans = await ServicePlan.find(filter);

//     res.status(200).json({
//       status: "success",
//       results: plans.length,
//       data: plans,
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

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
