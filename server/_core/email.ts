import sgMail from "@sendgrid/mail";

let initialized = false;

export type EmailDeliveryMode = "disabled" | "sendgrid";

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const configuredMode = process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (!configuredMode || configuredMode === "disabled") return "disabled";
  if (configuredMode === "sendgrid") return "sendgrid";
  throw new Error("EMAIL_DELIVERY_MODE must be either disabled or sendgrid");
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initEmail() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured");
  sgMail.setApiKey(apiKey);
  initialized = true;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(options: EmailOptions) {
  if (getEmailDeliveryMode() !== "sendgrid") {
    throw new Error("Email delivery is disabled");
  }
  if (!initialized) initEmail();
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) throw new Error("SENDGRID_FROM_EMAIL is not configured");
  const [response] = await sgMail.send({ ...options, from });
  return { providerId: response.headers["x-message-id"] ?? null };
}

export function getInternalNotificationEmail(input: {
  organizationName: string;
  title: string;
  message: string;
}) {
  const organizationName = escapeHtml(input.organizationName);
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);
  return {
    subject: input.title,
    text: `${input.organizationName}\n\n${input.title}\n${input.message}`,
    html: `<div style="font-family:Arial,sans-serif;direction:rtl;text-align:right"><h2>${title}</h2><p>${message}</p><hr><small>${organizationName}</small></div>`,
  };
}
