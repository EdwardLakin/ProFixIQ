import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

const config = {
  resolve: {
    alias: [
      {
        find: "next/server",
        replacement: fileURLToPath(
          new URL("./tests/support/p1-012-next-server.ts", import.meta.url),
        ),
      },
      { find: "@", replacement: repositoryRoot },
    ],
  },
  test: {
    environment: "node",
    include: [
      "tests/p0-006-stripe-identity.test.ts",
      "tests/p1-012-stripe-*.test.ts",
    ],
    setupFiles: [],
  },
};

export default config;
