export { COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@shared/const";

export const GOOGLE_LOGIN_PATH = "/api/auth/google/start";

export function getLoginUrl() {
  return GOOGLE_LOGIN_PATH;
}
