import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/modules/learning/__tests__/**/*.test.ts"],
    env: {
      AVAILITY_BASE_URL: "https://tst.api.availity.com",
      AVAILITY_TOKEN_URL: "https://tst.api.availity.com/v1/token",
      AVAILITY_CLIENT_ID: "test_client_id",
      AVAILITY_CLIENT_SECRET: "test_client_secret",
      AVAILITY_SCOPE: "scope_one scope_two",
      AVAILITY_ELIGIBILITY_PATH: "/v1/coverages/eligibility",
      AVAILITY_PRIOR_AUTH_PATH: "/v1/authorizations",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      NODE_ENV: "test",
    },
  },
});
