// const jwt = require("jsonwebtoken");
// const User = require("../models/userModel");

// const protect = async (req, res, next) => {
//   try {
//     let token;

//     if (
//       req.headers.authorization &&
//       req.headers.authorization.startsWith("Bearer")
//     ) {
//       token = req.headers.authorization.split(" ")[1];
//     }

//     if (!token) {
//       return res.status(401).json({
//         status: "fail",
//         message: "You are not logged in!",
//       });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const currentUser = await User.findById(decoded.id).select(
//       "_id fullName username email role"
//     );

//     if (!currentUser) {
//       console.error("❌ User no longer exists");
//       return res.status(401).json({
//         status: "fail",
//         message: "The user belonging to this token does no longer exist.",
//       });
//     }

//     req.user = {
//       id: currentUser._id,
//       fullName: currentUser.fullName,
//       email: currentUser.email,
//       username: currentUser.username,
//       role: currentUser.role,
//     };

//     console.log("✅ Authenticated user:", req.user);
//     next();
//   } catch (error) {
//     console.error("🔥 Auth error:", error.message);

//     return res.status(401).json({
//       status: "fail",
//       message: "Invalid or expired token",
//     });
//   }
// };

// // const restrictTo = (...allowedRoles) => {
// //   return (req, res, next) => {
// //     console.log("🛂 Role check:", req.user.role);

// //     if (!allowedRoles.includes(req.user.role)) {
// //       console.error("❌ Access denied for role:", req.user.role);

// //       return res.status(403).json({
// //         status: "fail",
// //         message: "You do not have permission to perform this action",
// //       });
// //     }

// //     next();
// //   };
// // };

// const restrictTo = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({
//         status: "fail",
//         message: "You do not have permission to perform this action",
//       });
//     }
//     next();
//   };
// };

// module.exports = { protect, restrictTo };

const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in!",
      });
    }

    // 1️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2️⃣ Fetch FULL user (exclude sensitive fields)
    const currentUser = await User.findById(decoded.id).select(
      "-password -__v -passwordResetToken -passwordResetExpires"
    );

    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "The user belonging to this token no longer exists.",
      });
    }

    // 3️⃣ Attach full user document
    req.user = currentUser;

    console.log("✅ Authenticated user:", req.user);
    next();
  } catch (error) {
    console.error("🔥 Auth error:", error.message);

    return res.status(401).json({
      status: "fail",
      message: "Invalid or expired token",
    });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

module.exports = { protect, restrictTo };
