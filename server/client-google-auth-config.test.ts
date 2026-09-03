import { describe, expect, it } from "vitest";
import { getLoginUrl, GOOGLE_LOGIN_PATH } from "../client/src/const";

describe("Google login route", () => {
  it("uses the server-side Google authorization start endpoint", () => {
    expect(GOOGLE_LOGIN_PATH).toBe("/api/auth/google/start");
    expect(getLoginUrl()).toBe(GOOGLE_LOGIN_PATH);
  });
});
