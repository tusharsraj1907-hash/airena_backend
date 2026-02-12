import { defineConfig } from "@prisma/driver-adapter-utils";

export default defineConfig({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
