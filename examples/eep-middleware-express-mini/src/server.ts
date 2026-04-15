/**
 * Minimal Express + @eep-dev/middleware wiring.
 * Run from repo: npm install && npm start
 */
import express, { type Request, type Response } from "express";
import { createEEPRouter } from "@eep-dev/middleware";

const port = Number(process.env.PORT ?? "3333");
const baseUrl = process.env.EEP_BASE_URL ?? `http://127.0.0.1:${port}`;
const did = process.env.EEP_DID ?? "did:web:example.com";

const app = express();
app.use(express.json());

const { routes } = createEEPRouter({
  baseUrl,
  did
});

for (const route of routes) {
  app[route.method](route.path, async (req: Request, res: Response) => {
    const out = await route.execute({
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      query: req.query as Record<string, string>,
      params: req.params as Record<string, string>,
      body: req.body
    });
    res.status(out.status);
    for (const [k, v] of Object.entries(out.headers ?? {})) {
      res.setHeader(k, v as string);
    }
    if (out.body === undefined || out.body === null) {
      res.end();
    } else if (typeof out.body === "string" || Buffer.isBuffer(out.body)) {
      res.send(out.body);
    } else {
      res.json(out.body);
    }
  });
}

app.listen(port, () => {
  process.stderr.write(`eep-middleware-express-mini listening on ${port} (baseUrl=${baseUrl})\n`);
});
