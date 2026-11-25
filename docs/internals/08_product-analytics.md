# Product analytics

Application runtimes in this checkout do not ship a product analytics or diagnostic exporter.
Legacy settings and wire fields remain readable so existing settings files and older clients can
connect. A disabled export is reported to clients even when a legacy receiver is configured. The
browser trace receiver accepts authenticated traces from older clients for local diagnostics only.
