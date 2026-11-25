import { APP_REPOSITORY_URL, IS_YOUHANHAN_CODE } from "./branding";

export const PRIVACY_POLICY_URL = IS_YOUHANHAN_CODE
  ? `${APP_REPOSITORY_URL}/blob/main/docs/user/telemetry.md`
  : "https://t3.codes/privacy-policy";
