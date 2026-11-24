// A bare JSON-RPC client over the SDK's in-memory transport, for tool tests
// that drive a real server: initialize, then requests.
import {
  InMemoryTransport,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  type McpServer,
} from "@modelcontextprotocol/server";

export interface Session {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ListedTool {
  name: string;
  description: string;
  annotations: Record<string, unknown>;
}

export interface CallResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

export async function open(server: McpServer): Promise<Session> {
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  client.onmessage = (message: JSONRPCMessage) => {
    const reply = message as Record<string, unknown>;
    if (typeof reply.id === "number") waiting.get(reply.id)?.(reply);
  };
  await server.connect(transport);
  await client.start();
  let next = 0;
  const request = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, (reply) => {
        if (reply.error !== undefined) reject(new Error(JSON.stringify(reply.error)));
        else resolve(reply.result as Record<string, unknown>);
      });
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "tool-test", version: "0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { request };
}

export async function listTools(session: Session): Promise<ListedTool[]> {
  const { tools } = await session.request("tools/list");
  return tools as ListedTool[];
}

export async function callTool(session: Session, name: string, args: unknown): Promise<CallResult> {
  return (await session.request("tools/call", { name, arguments: args })) as unknown as CallResult;
}
