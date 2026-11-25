// 兼容从旧版升级的缓存安装，已有队列不会被读取或发送。
export async function flushTelemetry(): Promise<void> {}
