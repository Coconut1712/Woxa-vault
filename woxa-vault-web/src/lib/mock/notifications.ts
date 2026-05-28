import type { ColorKey } from "@/lib/types";

export type NotificationType =
  | "share.received" // someone shared a vault/item with you
  | "send.viewed" // recipient opened your one-time send
  | "send.expired" // your send expired without view
  | "rotation.due" // password expiry reminder
  | "auth.new_device" // new login from unknown device
  | "permission.requested" // someone asked for access to your item
  | "permission.approved" // your permission request was approved
  | "group.synced" // SSO group sync added/removed members
  | "audit.anomaly" // suspicious activity detected
  | "system.welcome"; // onboarding tip

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actor?: { name: string; color: ColorKey };
  link?: string;
  actions?: Array<{
    label: string;
    variant?: "primary" | "outline" | "ghost";
  }>;
}

export const notifications: Notification[] = [
  {
    id: "n_1",
    type: "share.received",
    title: "Production vault shared with you",
    message: "Ching gave you Editor access to the Production vault.",
    timestamp: "2026-05-13T14:30:00Z",
    read: false,
    actor: { name: "Ching Suriya", color: "violet" },
    link: "/app/vault/v_production",
    actions: [{ label: "Open vault", variant: "primary" }],
  },
  {
    id: "n_2",
    type: "send.viewed",
    title: "Your one-time send was opened",
    message:
      "vendor@partner.com just viewed “Stripe Webhook Secret”. The link is now burned.",
    timestamp: "2026-05-13T13:55:00Z",
    read: false,
    actor: { name: "@partner.com", color: "rose" },
    link: "/app/sends",
  },
  {
    id: "n_3",
    type: "permission.requested",
    title: "Mali wants access to “Mailchimp Production”",
    message:
      "Reason: Need to update the customer welcome email this afternoon.",
    timestamp: "2026-05-13T12:10:00Z",
    read: false,
    actor: { name: "Mali Marketing", color: "fuchsia" },
    link: "/app/audit",
    actions: [
      { label: "Approve", variant: "primary" },
      { label: "Deny", variant: "ghost" },
    ],
  },
  {
    id: "n_4",
    type: "auth.new_device",
    title: "New sign-in from Chiang Mai",
    message:
      "Chrome on Windows 11 · 49.228.x.x · Did you sign in just now? If not, lock the vault immediately.",
    timestamp: "2026-05-13T09:30:00Z",
    read: true,
    actions: [
      { label: "That's me", variant: "outline" },
      { label: "Lock now", variant: "ghost" },
    ],
  },
  {
    id: "n_5",
    type: "rotation.due",
    title: "3 passwords are due for rotation",
    message:
      "Items in Production haven't been changed in 90+ days: AWS Root, Stripe Live, GitHub Deploy Token.",
    timestamp: "2026-05-12T08:00:00Z",
    read: true,
    link: "/app/vault/v_production",
  },
  {
    id: "n_6",
    type: "group.synced",
    title: "Google Groups synced",
    message:
      "2 members added to DevOps · 1 member removed from Marketing · auto-sync.",
    timestamp: "2026-05-13T13:55:00Z",
    read: true,
  },
  {
    id: "n_7",
    type: "audit.anomaly",
    title: "Unusual access pattern detected",
    message:
      "12 items viewed in 30 seconds from ching@iux24.com — may indicate bulk export attempt.",
    timestamp: "2026-05-12T20:00:00Z",
    read: true,
    link: "/app/audit",
    actions: [{ label: "Review activity", variant: "outline" }],
  },
  {
    id: "n_8",
    type: "system.welcome",
    title: "Tip: install the browser extension",
    message:
      "Autofill passwords directly in Chrome, Firefox, or Edge. Saves seconds, every login.",
    timestamp: "2026-05-10T09:00:00Z",
    read: true,
    link: "/app/account",
    actions: [{ label: "Install", variant: "outline" }],
  },
];
