import {
  Home,
  Compass,
  Upload,
  LayoutGrid,
  Users,
  Sparkles,
  ShoppingCart,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationLink {
  id: string;
  name: string;
  href: string;
  ariaLabel: string;
  icon: LucideIcon;
  roles: string[]; // Roles that can access this link
  bubbleText: string; // Text to display in the tour bubble
}

export const NAVIGATION_LINKS: NavigationLink[] = [
  {
    id: "home",
    name: "Home",
    href: "/home",
    icon: Home,
    roles: ["customer", "dealer", "domain_owner", "global_admin"],
    ariaLabel: "Navigate to home page",
    bubbleText: "Overview of your stats, activity, and next steps.",
  },
  {
    id: "catalog",
    name: "Catalog",
    href: "/catalog",
    icon: LayoutGrid,
    roles: ["dealer", "domain_owner", "global_admin"],
    ariaLabel: "Navigate to catalog",
    bubbleText: "Browse artworks, open details, and manage selections.",
  },
  {
    id: "upload",
    name: "Upload",
    href: "/upload",
    icon: Upload,
    roles: ["dealer", "domain_owner", "global_admin"],
    ariaLabel: "Navigate to upload page",
    bubbleText: "Upload new artworks with images and metadata.",
  },
  {
    id: "taster",
    name: "Taster",
    href: "/taster",
    icon: Compass,
    roles: ["customer"],
    ariaLabel: "Navigate to taster page",
    bubbleText: "Swipe to train your taste profile and unlock AI picks.",
  },
  {
    id: "ai-suggestions",
    name: "AI Suggestions",
    href: "/ai-suggestions",
    icon: Sparkles,
    roles: ["customer"],
    ariaLabel: "Navigate to AI Suggestions page",
    bubbleText: "Review personalized recommendations from your swipes.",
  },
  {
    id: "sales",
    name: "Sales",
    href: "/sales",
    icon: ShoppingCart,
    roles: ["dealer", "domain_owner", "global_admin"],
    ariaLabel: "Navigate to sales page",
    bubbleText: "Create and manage proposals for customers.",
  },
  {
    id: "management",
    name: "Management",
    href: "/management",
    icon: Users,
    roles: ["dealer", "domain_owner", "global_admin"],
    ariaLabel: "Navigate to management page",
    bubbleText: "Invite users, assign roles, and manage domains.",
  },
  {
    id: "buying-proposal",
    name: "Proposal",
    href: "/buying-proposal",
    icon: FileText, // Updated icon
    roles: ["customer"],
    ariaLabel: "Navigate to Proposal page",
    bubbleText: "Review your proposal and accept or reject items.",
  },
];
