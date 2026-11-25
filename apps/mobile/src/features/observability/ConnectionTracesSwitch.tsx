// 以下为旧版实现的注释。遥测上传已移除。
/** False in builds without relay tracing configured, where there is nothing to turn off. */
// Shared by every switch, so a save that finishes after a newer change cannot turn sending back on.
/** Sending stops before the save and starts only after it, unless a newer change came since. */
/** The phone's T3 Connect connection traces, separate from crash reports. */
// One change at a time, so a slow save never turns sending back on after a later opt-out.
