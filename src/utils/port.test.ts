import { EventEmitter } from "node:events";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PORT, findAvailablePort, parsePort } from "./port";

const servers: net.Server[] = [];

const listenOnPort = async (port: number) => {
  const server = net.createServer();
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });

  return server;
};

const listenOnEphemeralPort = async () => {
  const server = await listenOnPort(0);
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server port.");
  }

  return { server, port: address.port };
};

const closeServer = async (server: net.Server) => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );
});

describe("port utilities", () => {
  it("parses valid ports and falls back for invalid values", () => {
    expect(parsePort("8787")).toBe(8787);
    expect(parsePort("8080.5")).toBe(DEFAULT_PORT);
    expect(parsePort("-1", 4321)).toBe(4321);
    expect(parsePort(undefined)).toBe(DEFAULT_PORT);
    expect(parsePort("0")).toBe(DEFAULT_PORT);
    expect(parsePort("abc")).toBe(DEFAULT_PORT);
    expect(parsePort("70000")).toBe(DEFAULT_PORT);
  });

  it("returns the preferred port when it is available", async () => {
    const { server, port } = await listenOnEphemeralPort();

    servers.pop();
    await closeServer(server);

    expect(await findAvailablePort(port)).toBe(port);
  });

  it("falls back to a later port when the preferred port is occupied", async () => {
    const { port } = await listenOnEphemeralPort();

    expect(await findAvailablePort(port)).toBeGreaterThan(port);
  });

  it("throws when no candidate port is available within the attempt limit", async () => {
    await expect(findAvailablePort(65536, 1)).rejects.toThrow(
      "Could not find an available port starting at 65536."
    );
  });

  it("treats EACCES errors as the port being unavailable and continues searching", async () => {
    let attemptIndex = 0;
    const createServerSpy = vi.spyOn(net, "createServer").mockImplementation(() => {
      const fake = new EventEmitter() as unknown as net.Server;
      (fake as unknown as { unref: () => void }).unref = () => {};
      (fake as unknown as { listen: (port: number) => void }).listen = (port: number) => {
        const currentAttempt = attemptIndex;
        attemptIndex += 1;
        queueMicrotask(() => {
          if (currentAttempt === 0) {
            const error = new Error("permission denied") as NodeJS.ErrnoException;
            error.code = "EACCES";
            (fake as unknown as EventEmitter).emit("error", error);
            return;
          }
          (fake as unknown as EventEmitter).emit("listening");
          void port;
        });
      };
      (fake as unknown as { close: (callback: (error?: Error) => void) => void }).close = (callback) => {
        callback();
      };
      return fake;
    });

    try {
      const result = await findAvailablePort(4000);
      expect(result).toBe(4001);
      expect(createServerSpy).toHaveBeenCalledTimes(2);
    } finally {
      createServerSpy.mockRestore();
    }
  });
});