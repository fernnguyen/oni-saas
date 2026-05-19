import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: "https://c567210b733f3fc20ee9a5366bf0fbe7@o4511392076660736.ingest.us.sentry.io/4511392078954496",
  enableLogs: true,
});
Sentry.captureException(new Error("Test Error from Antigravity"));
console.log("Sent test error");
