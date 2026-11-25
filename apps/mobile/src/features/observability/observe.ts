// 以下为旧版实现的注释。遥测上传已移除。

// Importing expo-observe installs its global JS error handler; reports leave only through the relay.
// React Native tracks unhandled rejections only in development, for LogBox; Observe has no hook.

// While sending is off, a dispatch pass drops what it finds, so one runs before turning it back on.
// Best effort: Observe skips the pass while it is backing off from a failed send.

// Observe keeps its last configuration across launches; configuring it off while the setting
// loads would drop the last session's native crash. Imported lazily so the persistence graph
// never runs ahead of the imports `index.ts` orders first.

// Observe keeps the last choice it was given, which stands in for the unreadable one.
