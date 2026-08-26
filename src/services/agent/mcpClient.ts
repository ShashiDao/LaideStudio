import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpJsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: McpJsonSchema;
  serverId: string; // To trace which server this came from
}

export class McpService {
  private static clients = new Map<string, Client>();
  
  static async connect(id: string, url: string) {
    if (this.clients.has(id)) {
      try {
        const existing = this.clients.get(id)!;
        await existing.close();
      } catch (_e) {
        // ignore
      }
      this.clients.delete(id);
    }
    
    try {
      const transport = new StreamableHTTPClientTransport(new URL(url));
      const client = new Client(
        {
          name: "laide-studio-agent",
          version: "1.0.0"
        },
        {
          capabilities: {}
        }
      );
      
      await client.connect(transport);
      this.clients.set(id, client);
      return client;
    } catch (e) {
      console.error(`Failed to connect to MCP server ${url}`, e);
      throw e;
    }
  }

  static async listTools(id: string): Promise<McpTool[]> {
    const client = this.clients.get(id);
    if (!client) throw new Error(`MCP client ${id} not connected`);
    
    try {
      const result = await client.listTools();
      return result.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        serverId: id
      }));
    } catch (e) {
      console.error(`Failed to list tools for MCP server ${id}`, e);
      throw e;
    }
  }

  static async executeTool(id: string, name: string, args: Record<string, unknown>): Promise<Awaited<ReturnType<Client['callTool']>>> {
    const client = this.clients.get(id);
    if (!client) throw new Error(`MCP client ${id} not connected`);
    
    const result = await client.callTool({
      name,
      arguments: args
    });
    
    return result;
  }
}
