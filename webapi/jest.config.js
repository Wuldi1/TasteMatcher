module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@tastematcher/common$": "<rootDir>/../common/src/index.ts",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/*.d.ts"],
};
