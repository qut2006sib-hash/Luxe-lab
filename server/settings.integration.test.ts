import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const defaults = {
  currency: "USD" as const,
  language: "ar" as const,
  emailNotifications: true,
  latePaymentAlerts: true,
  maintenanceAlerts: true,
  paymentConfirmation: true,
};

const settingsByUser = new Map<number, typeof defaults>();

const dbMocks = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./notifications", () => ({
  getNotifications: vi.fn(),
  notifyNewMaintenance: vi.fn(),
}));

import { appRouter } from "./routers";

function context(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user-${userId}@example.com`,
      name: `User ${userId}`,
      loginMethod: "fixture",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("settings persistence flow", () => {
  beforeEach(() => {
    settingsByUser.clear();
    vi.clearAllMocks();

    dbMocks.getUserSettings.mockImplementation(async (userId: number) => {
      return settingsByUser.get(userId) ?? { ...defaults };
    });

    dbMocks.saveUserSettings.mockImplementation(
      async (userId: number, input: typeof defaults) => {
        settingsByUser.set(userId, { ...input });
        return input;
      }
    );
  });

  it("returns defaults, saves changes, and reads the persisted values", async () => {
    const caller = appRouter.createCaller(context(1));

    await expect(caller.settings.get()).resolves.toEqual(defaults);

    const updated = {
      currency: "AED" as const,
      language: "en" as const,
      emailNotifications: false,
      latePaymentAlerts: false,
      maintenanceAlerts: true,
      paymentConfirmation: false,
    };

    await expect(caller.settings.update(updated)).resolves.toEqual(updated);
    await expect(caller.settings.get()).resolves.toEqual(updated);

    expect(dbMocks.saveUserSettings).toHaveBeenCalledWith(1, updated);
  });

  it("keeps settings isolated between users", async () => {
    const firstUser = appRouter.createCaller(context(1));
    const secondUser = appRouter.createCaller(context(2));

    await firstUser.settings.update({
      ...defaults,
      currency: "SAR",
      language: "en",
    });

    await expect(firstUser.settings.get()).resolves.toMatchObject({
      currency: "SAR",
      language: "en",
    });
    await expect(secondUser.settings.get()).resolves.toEqual(defaults);
  });

  it("rejects unsupported currency and language values", async () => {
    const caller = appRouter.createCaller(context(1));

    await expect(
      caller.settings.update({
        ...defaults,
        currency: "EUR",
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.settings.update({
        ...defaults,
        language: "fr",
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
