import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAccountingDocument,
  createAccountingParty,
  initializeAccounting,
  listAccountingAccounts,
  listAccountingDocuments,
  listAccountingJournalEntries,
  listAccountingParties,
  listAccountingPayments,
  postAccountingDocument,
  recordAccountingPayment,
} from "./accounting/service";
import {
  changeInvoiceStatus,
  generateCurrentInvoices,
  listInvoices,
} from "./billing/service";
import { getDashboardSummary } from "./dashboard/service";
import {
  changeLeaseStatus,
  createLease,
  listLeases,
  reconcileLegacyLease,
} from "./leasing/service";
import {
  approveLabOrder,
  createLabOrder,
  createLabPatient,
  createLabTest,
  getLabOrder,
  getLabSummary,
  listLabOrders,
  listLabPatients,
  listLabTests,
  retryLabOrderBilling,
  saveLabResults,
} from "./lab/service";
import {
  createMaintenanceRequest,
  listMaintenance,
  maintenanceSummary,
  updateMaintenanceStatus,
} from "./maintenance/service";
import {
  getCurrentMembership,
  updateOrganizationSettings,
} from "./organizations/service";
import {
  createPropertyWithUnit,
  getUnit,
  listUnits,
  updatePropertyLocation,
} from "./portfolio/service";

const id = z.number().int().positive();
const version = z.number().int().positive();
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine(value => Number(value) >= 0);
const positiveMoney = money.refine(value => Number(value) > 0);

function handleDomainError(error: unknown): never {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "ACCOUNTING_SETUP_REQUIRED") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
  if (
    message.includes("CONFLICT") ||
    message.includes("OVERLAP") ||
    message.includes("LOCKED") ||
    message.includes("ALREADY") ||
    message.includes("TRANSITION")
  ) {
    throw new TRPCError({ code: "CONFLICT", message });
  }
  if (message.includes("NOT_FOUND"))
    throw new TRPCError({ code: "NOT_FOUND", message });
  if (
    message.includes("FORBIDDEN") ||
    message.includes("ROLE") ||
    message === "ORGANIZATION_MEMBERSHIP_REQUIRED"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
  if (message.includes("INVALID")) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  if (message.startsWith("ACCOUNTING_")) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  if (message.startsWith("LAB_")) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  if (message === "DATABASE_UNAVAILABLE") {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message });
  }
  throw error;
}

export const accountingRouter = router({
  setup: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await initializeAccounting(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listAccountingAccounts(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
  }),
  parties: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listAccountingParties(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    create: protectedProcedure
      .input(
        z
          .object({
            kind: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
            name: z.string().trim().min(1).max(255),
            phone: z.string().trim().min(7).max(20).optional(),
            externalType: z.string().trim().min(1).max(50).optional(),
            externalId: z.string().trim().min(1).max(191).optional(),
          })
          .refine(
            input => Boolean(input.externalType) === Boolean(input.externalId),
            {
              path: ["externalId"],
              message: "externalType and externalId must be supplied together",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createAccountingParty({
            userId: ctx.user.id,
            ...input,
          });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
  documents: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listAccountingDocuments(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    create: protectedProcedure
      .input(
        z
          .object({
            kind: z.enum(["RECEIVABLE", "PAYABLE"]),
            partyId: id,
            sourceModule: z.string().trim().min(1).max(50).optional(),
            sourceEntityType: z.string().trim().min(1).max(50).optional(),
            sourceEntityId: z.string().trim().min(1).max(191).optional(),
            issueDate: z.coerce.date(),
            dueDate: z.coerce.date().optional(),
            currency: z.enum(["USD", "SAR", "AED", "SYP"]),
            notes: z.string().trim().max(2000).optional(),
            idempotencyKey: z.string().trim().min(8).max(191),
            lines: z
              .array(
                z.object({
                  accountId: id,
                  description: z.string().trim().min(1).max(255),
                  amount: positiveMoney,
                })
              )
              .min(1)
              .max(100),
          })
          .refine(input => !input.dueDate || input.dueDate >= input.issueDate, {
            path: ["dueDate"],
            message: "Due date cannot precede issue date",
          })
          .refine(
            input =>
              Boolean(input.sourceEntityType) === Boolean(input.sourceEntityId),
            {
              path: ["sourceEntityId"],
              message:
                "sourceEntityType and sourceEntityId must be supplied together",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createAccountingDocument({
            userId: ctx.user.id,
            ...input,
          });
        } catch (error) {
          handleDomainError(error);
        }
      }),
    post: protectedProcedure
      .input(z.object({ documentId: id, version }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await postAccountingDocument({
            userId: ctx.user.id,
            ...input,
          });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
  payments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listAccountingPayments(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    record: protectedProcedure
      .input(
        z.object({
          documentId: id,
          documentVersion: version,
          cashAccountId: id,
          amount: positiveMoney,
          method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
          idempotencyKey: z.string().trim().min(8).max(191),
          reference: z.string().trim().max(191).optional(),
          paidAt: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await recordAccountingPayment({
            userId: ctx.user.id,
            ...input,
          });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
  journal: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listAccountingJournalEntries(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
  }),
});

export const labRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getLabSummary(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  patients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listLabPatients(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    create: protectedProcedure
      .input(
        z.object({
          fullName: z.string().trim().min(2).max(255),
          phone: z.string().trim().min(7).max(20).optional(),
          birthDate: z.coerce.date().optional(),
          sex: z
            .enum(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"])
            .default("UNSPECIFIED"),
          notes: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createLabPatient({ userId: ctx.user.id, ...input });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
  tests: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listLabTests(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    create: protectedProcedure
      .input(
        z.object({
          code: z
            .string()
            .trim()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z0-9._-]+$/),
          name: z.string().trim().min(2).max(255),
          category: z.string().trim().max(100).optional(),
          sampleType: z.string().trim().max(100).optional(),
          price: positiveMoney,
          parameters: z
            .array(
              z.object({
                code: z
                  .string()
                  .trim()
                  .min(1)
                  .max(64)
                  .regex(/^[A-Za-z0-9._-]+$/),
                name: z.string().trim().min(1).max(255),
                resultType: z.enum(["NUMBER", "TEXT", "CHOICE"]),
                unit: z.string().trim().max(64).optional(),
                referenceRange: z.string().trim().max(255).optional(),
                choices: z
                  .array(z.string().trim().min(1).max(100))
                  .max(30)
                  .optional(),
              })
            )
            .min(1)
            .max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createLabTest({ userId: ctx.user.id, ...input });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
  orders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await listLabOrders(ctx.user.id);
      } catch (error) {
        handleDomainError(error);
      }
    }),
    get: protectedProcedure
      .input(z.object({ orderId: id }))
      .query(async ({ ctx, input }) => {
        try {
          return await getLabOrder(ctx.user.id, input.orderId);
        } catch (error) {
          handleDomainError(error);
        }
      }),
    create: protectedProcedure
      .input(
        z.object({
          patientId: id,
          testIds: z.array(id).min(1).max(100),
          notes: z.string().trim().max(2000).optional(),
          orderedAt: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createLabOrder({ userId: ctx.user.id, ...input });
        } catch (error) {
          handleDomainError(error);
        }
      }),
    retryBilling: protectedProcedure
      .input(z.object({ orderId: id }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await retryLabOrderBilling({
            userId: ctx.user.id,
            orderId: input.orderId,
          });
        } catch (error) {
          handleDomainError(error);
        }
      }),
    saveResults: protectedProcedure
      .input(
        z.object({
          orderId: id,
          orderVersion: version,
          results: z
            .array(
              z.object({
                resultId: id,
                version,
                value: z.string().trim().min(1).max(4000),
                flag: z.enum(["UNKNOWN", "NORMAL", "HIGH", "LOW", "ABNORMAL"]),
                notes: z.string().trim().max(2000).optional(),
              })
            )
            .min(1)
            .max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveLabResults({ userId: ctx.user.id, ...input });
        } catch (error) {
          handleDomainError(error);
        }
      }),
    approve: protectedProcedure
      .input(
        z.object({
          orderId: id,
          orderVersion: version,
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await approveLabOrder({ userId: ctx.user.id, ...input });
        } catch (error) {
          handleDomainError(error);
        }
      }),
  }),
});

export const organizationRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getCurrentMembership(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).optional(),
        currency: z.enum(["USD", "SAR", "AED", "SYP"]).optional(),
        timezone: z.string().trim().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateOrganizationSettings({
          userId: ctx.user.id,
          ...input,
        });
      } catch (error) {
        handleDomainError(error);
      }
    }),
});

export const portfolioRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listUnits(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  get: protectedProcedure
    .input(z.object({ unitId: id }))
    .query(async ({ ctx, input }) => {
      try {
        const result = await getUnit(ctx.user.id, input.unitId);
        if (!result) throw new Error("UNIT_NOT_FOUND");
        return result;
      } catch (error) {
        handleDomainError(error);
      }
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        address: z.string().trim().min(1).max(255),
        unitNumber: z.string().trim().min(1).max(50),
        intent: z.enum(["rent", "sale"]),
        latitude: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .optional(),
        longitude: z
          .string()
          .regex(/^-?\d+(\.\d+)?$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createPropertyWithUnit({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
  updateLocation: protectedProcedure
    .input(
      z.object({
        propertyId: id,
        address: z.string().trim().min(1).max(255),
        latitude: z.string().regex(/^-?\d+(\.\d+)?$/),
        longitude: z.string().regex(/^-?\d+(\.\d+)?$/),
        version,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updatePropertyLocation({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
});

export const maintenanceDomainRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listMaintenance(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  summary: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await maintenanceSummary(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  create: protectedProcedure
    .input(
      z.object({
        unitId: id,
        description: z.string().trim().min(1),
        cost: money.optional(),
        startDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createMaintenanceRequest({
          userId: ctx.user.id,
          ...input,
        });
      } catch (error) {
        handleDomainError(error);
      }
    }),
  updateStatus: protectedProcedure
    .input(
      z.object({
        requestId: id,
        status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
        version,
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateMaintenanceStatus({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
});

export const leasingRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listLeases(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  create: protectedProcedure
    .input(
      z
        .object({
          unitId: id,
          tenantName: z.string().trim().min(1).max(255),
          tenantPhone: z.string().trim().max(20).optional(),
          monthlyRent: money.refine(value => Number(value) > 0),
          startDate: z.coerce.date(),
          endDate: z.coerce.date().optional(),
          dueDay: z.number().int().min(1).max(31).optional(),
          status: z.enum(["DRAFT", "ACTIVE"]).optional(),
        })
        .refine(value => !value.endDate || value.endDate >= value.startDate, {
          path: ["endDate"],
          message: "Lease end date cannot precede its start date",
        })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createLease({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
  updateStatus: protectedProcedure
    .input(
      z.object({
        leaseId: id,
        version,
        status: z.enum(["ACTIVE", "ENDED", "CANCELLED"]),
        endDate: z.coerce.date().optional(),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeLeaseStatus({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
  reconcileLegacy: protectedProcedure
    .input(
      z
        .object({
          leaseId: id,
          cutoverDate: z.coerce.date(),
          openingState: z.enum(["SETTLED", "AMOUNT_DUE"]),
          openingAmount: money,
        })
        .refine(
          value =>
            value.openingState === "SETTLED" || Number(value.openingAmount) > 0,
          {
            path: ["openingAmount"],
            message: "An amount due must be greater than zero",
          }
        )
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await reconcileLegacyLease({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
});

export const billingRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listInvoices(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  generateCurrent: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await generateCurrentInvoices(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
  changeStatus: protectedProcedure
    .input(
      z.object({
        invoiceId: id,
        version,
        action: z.enum(["MARK_PAID", "REOPEN", "VOID"]),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeInvoiceStatus({ userId: ctx.user.id, ...input });
      } catch (error) {
        handleDomainError(error);
      }
    }),
});

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getDashboardSummary(ctx.user.id);
    } catch (error) {
      handleDomainError(error);
    }
  }),
});
