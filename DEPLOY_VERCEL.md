# Deploy the Relay Publisher website

Vercel serves only `site/`. The Electron app, Playwright engine, browser profiles, and SQLite data are excluded. `/demo/` is an invented browser-only queue/history simulation and never contacts a platform.

```powershell
npm run website:verify
vercel --prod --yes
```

Real-platform checks remain owner-only because they require private sessions and create public posts. See `docs/LIVE_TEST.md`.
