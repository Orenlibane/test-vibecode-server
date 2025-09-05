require("dotenv").config();

function parseOrigins(val) {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  trustProxy: process.env.TRUST_PROXY === "1",
  baseUrl: process.env.BASE_URL || null
};
