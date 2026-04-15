export type DetectedLanguage = "typescript" | "javascript" | "python" | "go" | "java" | "rust" | "other";
export type DetectedFramework =
  | "express"
  | "fastify"
  | "hono"
  | "koa"
  | "nestjs"
  | "next"
  | "fastapi"
  | "flask"
  | "django"
  | "starlette"
  | "gin"
  | "echo"
  | "spring-boot"
  | "actix-web"
  | "axum"
  | null;

export type ProjectProfile = {
  language: DetectedLanguage;
  framework: DetectedFramework;
  packageManager: "npm" | "yarn" | "pnpm" | "pip" | "poetry" | "go-mod" | "cargo" | "maven" | "gradle" | null;
  entryPoint: string | null;
  existingAuth: "jwt" | "oauth" | "api-key" | null;
  existingDB: "postgres" | "mysql" | "mongodb" | "sqlite" | null;
  existingEventBus: "redis" | "kafka" | "rabbitmq" | null;
  existingPorts: number[];
};
