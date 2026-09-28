import express from "express";
import { accessSync } from "node:fs";
import { dirname, join, extname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "dist");
export function createStaticApp() {
  accessSync(join(dist, "index.html"));
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) =>
    res.set("Cache-Control", "no-store").json({ ready: true }),
  );
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, file) {
        const hashed = /-[a-zA-Z0-9_-]{8,}\.[a-z0-9]+$/.test(basename(file));
        res.setHeader(
          "Cache-Control",
          hashed ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      extname(req.path) ||
      req.path.startsWith("/assets/")
    )
      return next();
    res.set("Cache-Control", "no-cache").sendFile(join(dist, "index.html"));
  });
  app.use((_req, res) => res.status(404).send("Not found"));
  return app;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const port = Number(process.env.PORT ?? 7777);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createStaticApp().listen(port, host, () =>
    console.log(`Web app listening on ${host}:${port}`),
  );
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
}
