import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./cookies";

function request(protocol: string, forwardedProto?: string): Request {
  return {
    protocol,
    headers: forwardedProto ? { "x-forwarded-proto": forwardedProto } : {},
  } as Request;
}

describe("getSessionCookieOptions", () => {
  it("uses a localhost-compatible cookie over plain HTTP", () => {
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("uses a secure SameSite=Lax cookie over HTTPS", () => {
    expect(getSessionCookieOptions(request("https"))).toMatchObject({
      sameSite: "lax",
      secure: true,
    });
  });

  it("trusts a secure forwarded protocol from a reverse proxy", () => {
    expect(
      getSessionCookieOptions(request("http", "http, https"))
    ).toMatchObject({
      sameSite: "lax",
      secure: true,
    });
  });
});
