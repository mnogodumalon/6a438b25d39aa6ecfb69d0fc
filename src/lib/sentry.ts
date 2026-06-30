import * as Sentry from '@sentry/react';

const DSN = "";
const ENVIRONMENT = "dashboard-6a438b25d39aa6ecfb69d0fc";
const RELEASE = "0.0.191";
const APPGROUP_ID = "6a438b25d39aa6ecfb69d0fc";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT || undefined,
    release: RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  if (APPGROUP_ID) {
    Sentry.setTag('appgroup_id', APPGROUP_ID);
  }
}

export { Sentry };
