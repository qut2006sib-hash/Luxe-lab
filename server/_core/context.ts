import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId } from "../db";
import { ENV } from "./env";
import { authenticateRequest } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEPLOYMENT_ENV === "local" &&
      process.env.AUTH_MODE === "disabled" &&
      ENV.devAuthOpenId
    ) {
      user = (await getUserByOpenId(ENV.devAuthOpenId)) ?? null;
    } else {
      user = await authenticateRequest(opts.req, process.env.JWT_SECRET ?? "");
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
