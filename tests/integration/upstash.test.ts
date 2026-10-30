import { describe, expect, it } from "vitest";

import { UpstashKV } from "@/lib/kv/upstash";
import { startStub } from "../support/stub-http";

const TOKEN = "kv-test-token";

interface State {
  values: Map<string, string>;
  members: Map<string, Set<string>>;
}

function upstashStub(state: State) {
  return async (request: { body: Buffer }) => {
    const command = JSON.parse(request.body.toString("utf8")) as string[];
    const [name, key, ...args] = command;
    switch (name) {
      case "SET":
        state.values.set(key, args[0]);
        return { status: 200, body: JSON.stringify({ result: "OK" }) };
      case "GET":
        return {
          status: 200,
          body: JSON.stringify({ result: state.values.get(key) ?? null }),
        };
      case "DEL":
        state.values.delete(key);
        return { status: 200, body: JSON.stringify({ result: 1 }) };
      case "INCRBY":
        return { status: 200, body: JSON.stringify({ result: 3 }) };
      case "SADD": {
        const set = state.members.get(key) ?? new Set<string>();
        set.add(args[0]);
        state.members.set(key, set);
        return { status: 200, body: JSON.stringify({ result: 1 }) };
      }
      case "SREM": {
        state.members.get(key)?.delete(args[0]);
        return { status: 200, body: JSON.stringify({ result: 1 }) };
      }
      case "SMEMBERS":
        return {
          status: 200,
          body: JSON.stringify({ result: [...(state.members.get(key) ?? [])] }),
        };
      case "EXPIRE":
        return { status: 200, body: JSON.stringify({ result: 1 }) };
      case "EVAL": {
        // Conditional delete: only remove when the stored value still matches.
        const [, , , evalKey, expected] = command;
        if (state.values.get(evalKey) === expected) {
          state.values.delete(evalKey);
          return { status: 200, body: JSON.stringify({ result: 1 }) };
        }
        return { status: 200, body: JSON.stringify({ result: 0 }) };
      }
      default:
        return { status: 400, body: JSON.stringify({ error: `unknown ${name}` }) };
    }
  };
}

describe("Upstash driver", () => {
  it("G3-AC-10: sends TTL, increments, and handles atomic set operations", async () => {
    const state: State = { values: new Map(), members: new Map() };
    const stub = await startStub(upstashStub(state));
    try {
      const kv = new UpstashKV(stub.url, TOKEN);
      await kv.set("probe", "value", { exSeconds: 60 });
      expect(await kv.incr("counter", 60)).toBe(3);
      await kv.setAdd("members", "a");
      expect(await kv.setMembers("members")).toEqual(["a"]);
      await kv.setRemove("members", "a");

      const commands = stub.requests.map(
        (request) => JSON.parse(request.body.toString("utf8")) as string[],
      );
      expect(commands).toContainEqual(["SET", "probe", "value", "EX", "60"]);
      expect(commands).toContainEqual(["INCRBY", "counter", "1"]);
      expect(commands.some((command) => command[0] === "SADD")).toBe(true);
      expect(commands.some((command) => command[0] === "SMEMBERS")).toBe(true);
      expect(commands.some((command) => command[0] === "SREM")).toBe(true);
      expect(stub.requests[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    } finally {
      await stub.close();
    }
  });

  it("G3-AC-10: a losing conditional delete leaves the newer claim intact", async () => {
    const state: State = {
      values: new Map([["claim:job:witch", "newer-token"]]),
      members: new Map(),
    };
    const stub = await startStub(upstashStub(state));
    try {
      const kv = new UpstashKV(stub.url, TOKEN);
      await kv.deleteIfValue("claim:job:witch", "older-token");
      expect(state.values.get("claim:job:witch")).toBe("newer-token");
      expect(await kv.get("claim:job:witch")).toBe("newer-token");

      state.values.set("claim:job:witch", "same-token");
      await kv.deleteIfValue("claim:job:witch", "same-token");
      expect(state.values.has("claim:job:witch")).toBe(false);
      expect(await kv.get("claim:job:witch")).toBeNull();

      const evalCommands = stub.requests
        .map((request) => JSON.parse(request.body.toString("utf8")) as string[])
        .filter((command) => command[0] === "EVAL");
      expect(evalCommands).toHaveLength(2);
      expect(evalCommands[0][1]).toContain("GET");
      expect(evalCommands[0][1]).toContain("DEL");
      expect(evalCommands[0].slice(2)).toEqual([
        "1",
        "claim:job:witch",
        "older-token",
      ]);
    } finally {
      await stub.close();
    }
  });
});
