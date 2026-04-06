import net from "node:net";

export const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

export const parsePort = (value: string | undefined, fallback = DEFAULT_PORT) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PORT) {
    return fallback;
  }

  return parsed;
};

const isPortAvailable = (port: number) => {
  return new Promise<boolean>((resolve, reject) => {
    const server = net.createServer();

    server.unref();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(true);
      });
    });

    server.listen(port);
  });
};

export const findAvailablePort = async (preferredPort: number, maxAttempts = 20) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidatePort = preferredPort + attempt;

    if (candidatePort > MAX_PORT) {
      break;
    }

    if (await isPortAvailable(candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(`Could not find an available port starting at ${preferredPort}.`);
};