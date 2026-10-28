export default function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(Object.assign(new Error("Authentication required."), { status: 401 }));
    if (!roles.includes(req.user.role)) {
      return next(Object.assign(new Error("You do not have permission to perform this action."), { status: 403 }));
    }
    return next();
  };
}
