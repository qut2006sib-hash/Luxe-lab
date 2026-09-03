import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  accountingRouter,
  labRouter,
  organizationRouter,
} from "./modules/router";

const settingsInput = z.object({
  currency: z.enum(["USD", "SAR", "AED", "SYP"]),
  language: z.enum(["ar", "en"]),
  emailNotifications: z.boolean(),
  latePaymentAlerts: z.boolean(),
  maintenanceAlerts: z.boolean(),
  paymentConfirmation: z.boolean(),
});

/**
 * Public API boundary for the standalone LUXE Lab application.
 *
 * Real-estate routers are deliberately not mounted here. The laboratory owns
 * only its organization, accounting, patient, catalog, order, and result
 * workflows even though the first extracted codebase still shares low-level
 * platform utilities with the original LUXE application.
 */
export const appRouter = router({
  system: systemRouter,
  organization: organizationRouter,
  accounting: accountingRouter,
  lab: labRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(ctx.req));
      return { success: true } as const;
    }),
  }),
  settings: router({
    get: protectedProcedure.query(({ ctx }) => db.getUserSettings(ctx.user.id)),
    update: protectedProcedure
      .input(settingsInput)
      .mutation(({ ctx, input }) => db.saveUserSettings(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;
