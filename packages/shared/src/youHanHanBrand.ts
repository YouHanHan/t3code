export const YOUHANHAN_CODE_NAME = "码舟";
export const YOUHANHAN_CODE_APP_ID = "io.github.youhanhan.code";
export const YOUHANHAN_CODE_REPOSITORY_URL = "https://github.com/YouHanHan/t3code";
export const YOUHANHAN_CODE_PUBLISHER = "YouHanHan";
export const YOUHANHAN_CODE_ARTIFACT_PREFIX = "CodeSkiff";
export const YOUHANHAN_CODE_DESCRIPTION = "An unofficial fork of T3 Code for local coding agents.";

export function isYouHanHanCodeVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-codeskiff\.\d+$/.test(version);
}
