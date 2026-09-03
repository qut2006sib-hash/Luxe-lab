import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  deliveryAttempts,
  notifications,
  organizationMembers,
  organizations,
  outboxEvents,
  scheduledJobs,
  userSettings,
  users,
} from "../../../drizzle/schema";
import {
  getEmailDeliveryMode,
  getInternalNotificationEmail,
  sendEmail,
} from "../../_core/email";
import { requireDb } from "../../db";
import {
  generateDueInvoices,
  markOverdueInvoices,
} from "../../modules/billing/service";

type JobRow = typeof scheduledJobs.$inferSelect;
type OutboxRow = typeof outboxEvents.$inferSelect;

function localDateKey(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function retryAt(attempts: number) {
  const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts));
  return new Date(Date.now() + seconds * 1000);
}

export async function seedDailyJobs(now = new Date()) {
  const db = await requireDb();
  const rows = await db.select().from(organizations);
  for (const organization of rows) {
    const date = localDateKey(now, organization.timezone);
    await db
      .insert(scheduledJobs)
      .values({
        organizationId: organization.id,
        jobType: "DAILY_BILLING",
        idempotencyKey: `daily-billing:${organization.id}:${date}`,
        payload: { date },
        runAt: now,
      })
      .onDuplicateKeyUpdate({
        set: { idempotencyKey: `daily-billing:${organization.id}:${date}` },
      });
  }
}

async function claimJob(now = new Date()): Promise<JobRow | null> {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(scheduledJobs)
      .where(
        and(
          lte(scheduledJobs.runAt, now),
          or(
            and(
              eq(scheduledJobs.status, "PENDING"),
              or(
                isNull(scheduledJobs.lockedUntil),
                lte(scheduledJobs.lockedUntil, now)
              )
            ),
            and(
              eq(scheduledJobs.status, "PROCESSING"),
              lte(scheduledJobs.lockedUntil, now)
            )
          )
        )
      )
      .orderBy(asc(scheduledJobs.runAt))
      .limit(1)
      .for("update", { skipLocked: true });
    const job = rows[0];
    if (!job) return null;
    const lockedUntil = new Date(Date.now() + 5 * 60_000);
    lockedUntil.setMilliseconds(0);
    await tx
      .update(scheduledJobs)
      .set({
        status: "PROCESSING",
        lockedUntil,
      })
      .where(eq(scheduledJobs.id, job.id));
    return { ...job, status: "PROCESSING" as const, lockedUntil };
  });
}

async function finishJob(job: JobRow, error?: unknown) {
  const db = await requireDb();
  if (!error) {
    await db
      .update(scheduledJobs)
      .set({ status: "COMPLETED", completedAt: new Date(), lockedUntil: null })
      .where(
        and(
          eq(scheduledJobs.id, job.id),
          eq(scheduledJobs.status, "PROCESSING"),
          eq(scheduledJobs.lockedUntil, job.lockedUntil!)
        )
      );
    return;
  }
  const attempts = job.attempts + 1;
  await db
    .update(scheduledJobs)
    .set({
      status: attempts >= 8 ? "DEAD" : "PENDING",
      attempts,
      runAt: retryAt(attempts),
      lockedUntil: null,
      lastError: error instanceof Error ? error.message : String(error),
    })
    .where(
      and(
        eq(scheduledJobs.id, job.id),
        eq(scheduledJobs.status, "PROCESSING"),
        eq(scheduledJobs.lockedUntil, job.lockedUntil!)
      )
    );
}

export async function processNextJob() {
  const job = await claimJob();
  if (!job) return false;
  try {
    if (job.jobType !== "DAILY_BILLING" || !job.organizationId) {
      throw new Error(`Unsupported scheduled job: ${job.jobType}`);
    }
    const date = (job.payload as { date?: unknown }).date;
    const organizationNow =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T12:00:00.000Z`)
        : new Date();
    await generateDueInvoices(job.organizationId, organizationNow);
    await markOverdueInvoices(job.organizationId, organizationNow);
    await finishJob(job);
  } catch (error) {
    await finishJob(job, error);
  }
  return true;
}

async function claimOutbox(now = new Date()): Promise<OutboxRow | null> {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          lte(outboxEvents.availableAt, now),
          or(
            and(
              eq(outboxEvents.status, "PENDING"),
              or(
                isNull(outboxEvents.lockedUntil),
                lte(outboxEvents.lockedUntil, now)
              )
            ),
            and(
              eq(outboxEvents.status, "PROCESSING"),
              lte(outboxEvents.lockedUntil, now)
            )
          )
        )
      )
      .orderBy(asc(outboxEvents.availableAt))
      .limit(1)
      .for("update", { skipLocked: true });
    const event = rows[0];
    if (!event) return null;
    const lockedUntil = new Date(Date.now() + 5 * 60_000);
    lockedUntil.setMilliseconds(0);
    await tx
      .update(outboxEvents)
      .set({
        status: "PROCESSING",
        lockedUntil,
      })
      .where(eq(outboxEvents.id, event.id));
    return { ...event, status: "PROCESSING" as const, lockedUntil };
  });
}

function describeEvent(event: OutboxRow) {
  switch (event.eventType) {
    case "INVOICE_OVERDUE":
      return {
        type: "invoice_overdue" as const,
        title: "Rent invoice overdue",
        message: "A rent invoice is overdue and needs review.",
      };
    case "INVOICE_CREATED":
      return {
        type: "invoice_created" as const,
        title: "Rent invoice created",
        message: "A monthly rent invoice is ready.",
      };
    case "MAINTENANCE_CREATED":
      return {
        type: "new_maintenance" as const,
        title: "Maintenance request created",
        message: "A new maintenance request was recorded.",
      };
    default:
      return {
        type: "maintenance_update" as const,
        title: "Portfolio update",
        message: "A portfolio record changed.",
      };
  }
}

async function deliverOutbox(event: OutboxRow) {
  const db = await requireDb();
  const organizationRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, event.organizationId))
    .limit(1);
  const organization = organizationRows[0];
  if (!organization || !organization.legacyContractorId) {
    throw new Error("Organization notification target is unavailable");
  }
  const description = describeEvent(event);
  await db
    .insert(notifications)
    .values({
      contractorId: organization.legacyContractorId,
      organizationId: organization.id,
      type: description.type,
      title: description.title,
      message: description.message,
      idempotencyKey: `outbox:${event.id}:in-app`,
    })
    .onDuplicateKeyUpdate({
      set: { idempotencyKey: `outbox:${event.id}:in-app` },
    });
  await db
    .insert(deliveryAttempts)
    .values({
      organizationId: organization.id,
      outboxEventId: event.id,
      channel: "IN_APP",
      recipient: `organization:${organization.id}`,
      status: "SENT",
    })
    .onDuplicateKeyUpdate({ set: { status: "SENT", error: null } });

  if (getEmailDeliveryMode() === "disabled") return;

  const recipients = await db
    .select({ email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(
        eq(organizationMembers.organizationId, organization.id),
        sql`${users.email} is not null`,
        or(
          isNull(userSettings.emailNotifications),
          eq(userSettings.emailNotifications, true)
        )
      )
    );
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    const prior = await db
      .select()
      .from(deliveryAttempts)
      .where(
        and(
          eq(deliveryAttempts.outboxEventId, event.id),
          eq(deliveryAttempts.channel, "EMAIL"),
          eq(deliveryAttempts.recipient, recipient.email),
          eq(deliveryAttempts.status, "SENT")
        )
      )
      .limit(1);
    if (prior[0]) continue;
    try {
      const content = getInternalNotificationEmail({
        organizationName: organization.name,
        title: description.title,
        message: description.message,
      });
      const sent = await sendEmail({ to: recipient.email, ...content });
      await db
        .insert(deliveryAttempts)
        .values({
          organizationId: organization.id,
          outboxEventId: event.id,
          channel: "EMAIL",
          recipient: recipient.email,
          status: "SENT",
          providerId: sent.providerId,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "SENT",
            providerId: sent.providerId,
            error: null,
            attemptedAt: new Date(),
          },
        });
    } catch (error) {
      await db
        .insert(deliveryAttempts)
        .values({
          organizationId: organization.id,
          outboxEventId: event.id,
          channel: "EMAIL",
          recipient: recipient.email,
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
            attemptedAt: new Date(),
          },
        });
      throw error;
    }
  }
}

async function finishOutbox(event: OutboxRow, error?: unknown) {
  const db = await requireDb();
  if (!error) {
    await db
      .update(outboxEvents)
      .set({ status: "COMPLETED", completedAt: new Date(), lockedUntil: null })
      .where(
        and(
          eq(outboxEvents.id, event.id),
          eq(outboxEvents.status, "PROCESSING"),
          eq(outboxEvents.lockedUntil, event.lockedUntil!)
        )
      );
    return;
  }
  const attempts = event.attempts + 1;
  await db
    .update(outboxEvents)
    .set({
      status: attempts >= 8 ? "DEAD" : "PENDING",
      attempts,
      availableAt: retryAt(attempts),
      lockedUntil: null,
      lastError: error instanceof Error ? error.message : String(error),
    })
    .where(
      and(
        eq(outboxEvents.id, event.id),
        eq(outboxEvents.status, "PROCESSING"),
        eq(outboxEvents.lockedUntil, event.lockedUntil!)
      )
    );
}

export async function processNextOutboxEvent() {
  const event = await claimOutbox();
  if (!event) return false;
  try {
    await deliverOutbox(event);
    await finishOutbox(event);
  } catch (error) {
    await finishOutbox(event, error);
  }
  return true;
}
