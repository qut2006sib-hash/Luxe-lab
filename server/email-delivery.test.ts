import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendgridMocks = vi.hoisted(() => ({
  send: vi.fn(),
  setApiKey: vi.fn(),
}));

vi.mock("@sendgrid/mail", () => ({
  default: {
    send: sendgridMocks.send,
    setApiKey: sendgridMocks.setApiKey,
  },
}));

import { getEmailDeliveryMode, sendEmail } from "./_core/email";

const message = {
  to: "member@example.test",
  subject: "Portfolio update",
  html: "<p>Update</p>",
  text: "Update",
};

describe("email delivery mode", () => {
  beforeEach(() => {
    sendgridMocks.send.mockReset();
    sendgridMocks.setApiKey.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed to disabled when the mode is absent", () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "");

    expect(getEmailDeliveryMode()).toBe("disabled");
  });

  it("does not initialize or call SendGrid when delivery is disabled", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "disabled");

    await expect(sendEmail(message)).rejects.toThrow(
      "Email delivery is disabled"
    );
    expect(sendgridMocks.setApiKey).not.toHaveBeenCalled();
    expect(sendgridMocks.send).not.toHaveBeenCalled();
  });

  it("sends through SendGrid and returns its tracked provider ID", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "sendgrid");
    vi.stubEnv("SENDGRID_API_KEY", "test-api-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "staging@example.test");
    sendgridMocks.send.mockResolvedValue([
      { headers: { "x-message-id": "provider-message-id" } },
    ]);

    await expect(sendEmail(message)).resolves.toEqual({
      providerId: "provider-message-id",
    });
    expect(sendgridMocks.setApiKey).toHaveBeenCalledWith("test-api-key");
    expect(sendgridMocks.send).toHaveBeenCalledWith({
      ...message,
      from: "staging@example.test",
    });
  });

  it("rejects unsupported delivery modes without calling SendGrid", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "smtp");

    await expect(sendEmail(message)).rejects.toThrow(
      "EMAIL_DELIVERY_MODE must be either disabled or sendgrid"
    );
    expect(sendgridMocks.setApiKey).not.toHaveBeenCalled();
    expect(sendgridMocks.send).not.toHaveBeenCalled();
  });
});
