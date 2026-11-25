# Product usage data

This build keeps its diagnostic logs and traces on the machine that generated them. It has no
upload path for product usage events, T3 Connect client connection traces, Agent feedback,
mobile crash and startup reports, background agent activity, or mobile push registration.
The Clerk providers disable the SDK's usage telemetry. Previously saved OpenTelemetry
endpoints do not activate an exporter.

Use **Settings > Maintenance > Diagnostics** to inspect a server's local logs, traces, and resource
data. On mobile, **Settings > About T3 Code > Diagnostics** can display and copy the device's
local crash log. Existing Agent feedback reports can be inspected locally with `t3 feedback list`.

## Connected features

- Sending a message to a cloud model sends the prompt and relevant context to that provider.
  [Text generation features](./text-generation.md) can send additional task context to the
  model selected for that task.
- [Adding an attachment](./composer.md#attach-files) transfers the selected file to the
  environment running the thread as soon as you add it. For a remote thread, that environment
  is another machine.
- [Git and pull request actions](./source-control.md#create-a-pull-request) send commits or
  pull request data to the configured remote when you push or publish.
- [Cloud dictation](./voice-input.md#choose-where-audio-goes) sends audio for transcription
  when you select a cloud voice service.
- [T3 Connect](./remote-access.md) exchanges environment metadata, identifiers, and
  credentials as part of a link you set up. A paired client can read data from that
  environment within its granted permissions.
