/**
 * Resolves the marketer's frontend base URL for dev and production.
 * Falls back to a platform default if no domain is configured.
 */
const resolveBaseUrl = (marketer) => {
  if (process.env.NODE_ENV === "development") {
    const domain = marketer?.domains?.[0];
    return domain ? `http://${domain}:3000` : `http://localhost:3000`;
  }
  const wwwDomain = marketer?.domains?.find((d) => d.startsWith("www."));
  const anyDomain = marketer?.domains?.[0];
  const domain = wwwDomain || anyDomain || process.env.DEFAULT_FRONTEND_DOMAIN;
  return `https://${domain}`;
};

/**
 * Resolves the "from" address for outbound emails.
 * Uses the marketer's verified sending domain when available,
 * falling back to the platform default.
 */
const resolveFromAddress = (marketer) => {
  const brandName =
    marketer?.brandName || process.env.DEFAULT_BRAND_NAME || "Platform";
  const sendingDomain = marketer?.domains?.[0];
  return `${brandName} <no-reply@${sendingDomain}>`;
};

module.exports = { resolveBaseUrl, resolveFromAddress };
