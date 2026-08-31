import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GRAPH_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 4200;
const LOOPBACK_HOST = "127.0.0.1";
const MECHANISMS_PATH = resolve(GRAPH_ROOT, "../MECHANISMS.md");

interface FixedRoute {
  path: string;
  contentType: string;
}

const ROUTES: ReadonlyMap<string, FixedRoute> = new Map([
  ["/", { path: resolve(GRAPH_ROOT, "web/index.html"), contentType: "text/html; charset=utf-8" }],
  ["/index.html", { path: resolve(GRAPH_ROOT, "web/index.html"), contentType: "text/html; charset=utf-8" }],
  ["/styles.css", { path: resolve(GRAPH_ROOT, "web/styles.css"), contentType: "text/css; charset=utf-8" }],
  ["/app.js", { path: resolve(GRAPH_ROOT, "web/app.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/api/graph", { path: resolve(GRAPH_ROOT, "data/capability-graph.json"), contentType: "application/json; charset=utf-8" }],
  ["/api/orphans", { path: resolve(GRAPH_ROOT, "data/orphan-analysis.json"), contentType: "application/json; charset=utf-8" }],
  ["/MECHANISMS.md", { path: MECHANISMS_PATH, contentType: "text/markdown; charset=utf-8" }],
]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function lineNumberedSource(source: string): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows = lines.map((line, index) => {
    const number = index + 1;
    return `<span class="line" id="L${number}"><a href="#L${number}" aria-label="Line ${number}">${number}</a><code>${escapeHtml(line)}</code></span>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MECHANISMS.md source</title>
<style>
:root{color-scheme:dark;font-family:"SFMono-Regular",Consolas,monospace;background:#071110;color:#d9e2df}
body{margin:0;padding:18px 0 60vh}.line{display:grid;grid-template-columns:5.5rem minmax(0,1fr);min-height:1.45rem;padding:0 1rem}.line:target{background:#263c37;box-shadow:inset 3px 0 #63d6cd}.line>a{padding-right:1rem;color:#899895;text-align:right;text-decoration:none}.line>a:hover{color:#63d6cd}.line>code{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
</head>
<body>${rows}</body>
</html>`;
}

function hasTraversalSegment(requestTarget: string): boolean {
  const rawPath = requestTarget.split(/[?#]/, 1)[0];
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return true;
  }
  return (
    decodedPath.includes("\\") ||
    decodedPath.split("/").some((segment) => segment === "." || segment === "..")
  );
}

function respond(
  response: ServerResponse,
  method: string | undefined,
  status: number,
  body: string | Buffer,
  contentType: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  const byteLength = Buffer.byteLength(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(byteLength),
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  });
  response.end(method === "HEAD" ? undefined : body);
}

export interface CapabilityGraphServerHandle {
  server: Server;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createCapabilityGraphServer(): CapabilityGraphServerHandle {
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        respond(
          response,
          request.method,
          405,
          "Capability graph server is read-only.\n",
          "text/plain; charset=utf-8",
          { allow: "GET, HEAD" },
        );
        return;
      }

      if (hasTraversalSegment(request.url ?? "/")) {
        respond(response, request.method, 404, "Not found.\n", "text/plain; charset=utf-8");
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;
      } catch {
        respond(response, request.method, 400, "Malformed request URL.\n", "text/plain; charset=utf-8");
        return;
      }

      const route = ROUTES.get(pathname);
      if (!route && pathname !== "/MECHANISMS.html") {
        respond(response, request.method, 404, "Not found.\n", "text/plain; charset=utf-8");
        return;
      }

      try {
        if (pathname === "/MECHANISMS.html") {
          const source = await readFile(MECHANISMS_PATH, "utf8");
          respond(
            response,
            request.method,
            200,
            lineNumberedSource(source),
            "text/html; charset=utf-8",
            { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
          );
          return;
        }
        if (!route) return;
        const bytes = await readFile(route.path);
        respond(response, request.method, 200, bytes, route.contentType);
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        const status = code === "ENOENT" ? 404 : 500;
        const message = status === 404 ? "Not found.\n" : "Unable to read the fixed resource.\n";
        respond(response, request.method, status, message, "text/plain; charset=utf-8");
      }
    })();
  });

  return {
    server,
    listen(port = DEFAULT_PORT) {
      return new Promise((resolvePort, reject) => {
        const onError = (error: Error): void => reject(error);
        server.once("error", onError);
        server.listen(port, LOOPBACK_HOST, () => {
          server.off("error", onError);
          const address = server.address();
          resolvePort(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    close() {
      return new Promise((done, reject) => {
        server.close((error) => error ? reject(error) : done());
      });
    },
  };
}

export function parsePort(arguments_: readonly string[]): number {
  const usage = "Usage: serve.ts [port] | serve.ts --port <port>";
  if (arguments_.length === 0) return DEFAULT_PORT;
  const text = arguments_.length === 1 && !arguments_[0].startsWith("-")
    ? arguments_[0]
    : arguments_.length === 2 && arguments_[0] === "--port"
      ? arguments_[1]
      : undefined;
  if (text === undefined) throw new Error(usage);
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port: ${text}\n${usage}`);
  }
  return port;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    const port = parsePort(process.argv.slice(2));
    const handle = createCapabilityGraphServer();
    handle.listen(port)
      .then((boundPort) => {
        process.stdout.write(`Palette Product Capability Map: http://${LOOPBACK_HOST}:${boundPort}/\n`);
      })
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
