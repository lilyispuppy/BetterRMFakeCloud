const Role = {
  Admin: "Admin",
  User: "User",
  Dev: "Dev",
};

// hasRole checks every role in the token (Roles[0] is only the primary one)
export function hasRole(user, role) {
  return !!(user && user.Roles && user.Roles.indexOf(role) !== -1);
}

export default Role;
