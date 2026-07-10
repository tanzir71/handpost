# Relay architecture

The Electron renderer is an unprivileged React/Vite/Tailwind application. It communicates only through the context-isolated preload API. Every mutating IPC payload is parsed with zod; filesystem, SQLite, notifications, and Playwright remain in the main process.

SQLite migrations run transactionally and idempotently at startup. Posts fan out into independent `post_targets`, so partial multi-platform outcomes are represented without losing the base draft. Media is copied under the app data directory and inspected with ffprobe. Export/import uses a versioned ZIP containing JSON, managed media, and History evidence, never browser profiles or cookies. A local pino log records lifecycle events with credential-shaped fields redacted.

The scheduler ticks every 30 seconds and uses a global concurrency-one queue. Scheduled times are jittered ±90 seconds. It enforces per-platform cooldowns and daily caps, handles startup overdue posts, and records each attempt. Content is rendered and validated before a browser is opened. Publish contexts are headed and off-screen by default, reuse a named persistent profile for the queued batch, and close when the queue becomes idle. Submission is not success: adapters must verify the newest post, capture a permalink and screenshot, or return `unverified` with a diagnostic screenshot.

Each platform adapter has capability, selector, publish, verify, fixture, and contract artifacts. Critical selectors live in the platform directory with platform-specific primaries and generic fallbacks. UI drift saves a sanitized DOM snapshot under `tests/fixtures/_drift`. Captcha/checkpoint detection opens a 24-hour circuit breaker; a second event in seven days requires manual re-enable without erasing the seven-day event history.
