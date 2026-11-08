import { hasRole, type SessionUser } from "../../auth/session";

export interface Section {
  to: string;
  label: string;
  group: "Account" | "Developer settings" | "Administration";
  description: string;
}

/** What Settings offers this user. */
export function sectionsFor(user: SessionUser | null): Section[] {
  const sections: Section[] = [
    { to: "/settings/devices", label: "Devices", group: "Account", description: "Your reMarkable tablets, and connecting a new one" },
    { to: "/settings/profile", label: "Profile", group: "Account", description: "Your account and password" },
    { to: "/settings/integrations", label: "Integrations", group: "Account", description: "Cloud storage and other services" },
  ];
  if (hasRole(user, "Dev")) {
    sections.push(
      { to: "/settings/developer/logs", label: "Logs", group: "Developer settings", description: "Server logs" },
      { to: "/settings/developer/explorer", label: "Explorer", group: "Developer settings", description: "Browse the raw document tree" },
    );
  }
  if (hasRole(user, "Admin")) {
    sections.push({ to: "/settings/admin", label: "Users", group: "Administration", description: "Manage the people who use this server" });
  }
  return sections;
}
