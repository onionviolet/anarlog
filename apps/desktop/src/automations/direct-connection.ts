import { commands as secrets } from "@anlg/plugin-store2";

import type { AutomationTargetRef } from "./types";

import { providerFetch } from "~/ai/provider-fetch";

export type DirectIntegration = "slack" | "linear" | "notion";
const SECRET_SCOPE = "automation-direct-connections";
const NOTION_VERSION = "2025-09-03";
type DirectApiResult = {
  ok?: boolean;
  data?: {
    team?: { id: string; name: string };
    issueCreate?: { success: boolean; issue?: { id: string } };
  };
  errors?: unknown[];
  channel?: { id: string; name: string; is_archived?: boolean };
  object?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<
    string,
    { type: string; title?: { plain_text?: string }[] }
  >;
};

async function request(
  integration: DirectIntegration,
  token: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<DirectApiResult> {
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (
    integration === "notion" &&
    serialized &&
    new TextEncoder().encode(serialized).byteLength > 500_000
  ) {
    throw new Error(
      "The recap exceeds Notion's request size limit. Export it as Markdown instead.",
    );
  }
  const base =
    integration === "slack"
      ? "https://slack.com/api/"
      : integration === "linear"
        ? "https://api.linear.app/"
        : "https://api.notion.com/v1/";
  let response: Response;
  try {
    response = await providerFetch(new URL(path, base), {
      method,
      headers: {
        Authorization: integration === "linear" ? token : `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(integration === "notion"
          ? { "Notion-Version": NOTION_VERSION }
          : {}),
      },
      body: serialized,
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      `${integration} could not be reached. Check the connection before retrying.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${integration} request failed (HTTP ${response.status}). Check token permissions and the destination.`,
    );
  }
  let result: DirectApiResult;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${integration} returned an invalid response.`);
  }
  if (
    !result ||
    typeof result !== "object" ||
    (integration === "slack" && result.ok !== true) ||
    (integration === "linear" && (result.errors?.length || !result.data))
  ) {
    throw new Error(
      `${integration} rejected the request. Check token permissions and the destination.`,
    );
  }
  return result;
}

export async function saveDirectConnection(
  integration: DirectIntegration,
  destinationId: string,
  token: string,
): Promise<AutomationTargetRef> {
  const id = destinationId.trim();
  const credential = token.trim();
  if (!id || !credential)
    throw new Error("Enter a token and a destination ID.");
  let name = id;
  if (integration === "slack") {
    if (!/^[CG][A-Z0-9]+$/.test(id))
      throw new Error("Enter a Slack channel ID.");
    const result = await request(
      integration,
      credential,
      `conversations.info?channel=${encodeURIComponent(id)}`,
      "GET",
    );
    if (result.channel?.id !== id || result.channel?.is_archived)
      throw new Error("Choose an active Slack channel.");
    name = result.channel.name || id;
  } else if (integration === "linear") {
    const result = await request(integration, credential, "graphql", "POST", {
      query: "query Team($id: String!) { team(id: $id) { id name } }",
      variables: { id },
    });
    if (!result.data?.team?.id)
      throw new Error("Choose a Linear team accessible to this token.");
    name = result.data.team.name;
    destinationId = result.data.team.id;
  } else {
    if (!/^[a-f0-9-]{32,36}$/i.test(id))
      throw new Error("Enter a Notion page ID.");
    const result = await request(
      integration,
      credential,
      `pages/${encodeURIComponent(id)}`,
      "GET",
    );
    if (result.object !== "page" || result.archived || result.in_trash)
      throw new Error(
        "Choose an active Notion page shared with your integration.",
      );
    const title = Object.values(result.properties ?? {}).find(
      (property) => property.type === "title",
    );
    name = title?.title?.map((part) => part.plain_text ?? "").join("") || id;
  }
  const directConnectionId = crypto.randomUUID();
  const saved = await secrets.setSecret(
    SECRET_SCOPE,
    directConnectionId,
    JSON.stringify({
      integration,
      destinationId: integration === "linear" ? destinationId : id,
      token: credential,
    }),
  );
  if (saved.status === "error")
    throw new Error("Could not save the connection in secure storage.");
  return {
    id: integration === "linear" ? destinationId : id,
    name,
    directConnectionId,
  };
}

export async function deleteDirectConnection(
  connectionId: string,
): Promise<void> {
  const result = await secrets.deleteSecret(SECRET_SCOPE, connectionId);
  if (result.status === "error")
    throw new Error("Could not remove the saved connection.");
}

async function readToken(
  integration: DirectIntegration,
  target: AutomationTargetRef,
): Promise<string> {
  if (!target.directConnectionId)
    throw new Error("Choose a direct connection first.");
  const result = await secrets.getSecret(
    SECRET_SCOPE,
    target.directConnectionId,
  );
  if (result.status === "error")
    throw new Error("Could not read the connection from secure storage.");
  if (!result.data)
    throw new Error("Reconnect this direct automation on this device.");
  let saved: { integration?: string; destinationId?: string; token?: string };
  try {
    saved = JSON.parse(result.data);
  } catch {
    throw new Error("Reconnect this direct automation.");
  }
  if (
    saved.integration !== integration ||
    saved.destinationId !== target.id ||
    typeof saved.token !== "string" ||
    !saved.token
  )
    throw new Error("Reconnect this direct automation.");
  return saved.token;
}

export async function sendDirectSlackRecap(
  target: AutomationTargetRef,
  text: string,
): Promise<void> {
  if (text.length > 40_000)
    throw new Error(
      "The recap exceeds Slack's message limit. Export it as Markdown instead.",
    );
  await request(
    "slack",
    await readToken("slack", target),
    "chat.postMessage",
    "POST",
    {
      channel: target.id,
      text,
      unfurl_links: false,
      unfurl_media: false,
    },
  );
}

export async function createDirectLinearIssues(
  target: AutomationTargetRef,
  items: string[],
  description: string,
  beforeCreate?: () => Promise<void>,
): Promise<void> {
  const token = await readToken("linear", target);
  await beforeCreate?.();
  for (const title of items) {
    const result = await request("linear", token, "graphql", "POST", {
      query:
        "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id } } }",
      variables: { input: { teamId: target.id, title, description } },
    });
    if (
      result.data?.issueCreate?.success !== true ||
      !result.data.issueCreate.issue?.id
    )
      throw new Error("Linear did not confirm issue creation.");
  }
}

export async function appendDirectNotionUpdate(
  target: AutomationTargetRef,
  heading: string,
  markdown: string,
): Promise<void> {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of markdown) {
    if (chunk.length + character.length > 2000) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > 99 || heading.length > 2000)
    throw new Error(
      "The recap exceeds Notion's append limit. Export it as Markdown instead.",
    );
  const block = (type: "heading_2" | "paragraph", content: string) => ({
    object: "block",
    type,
    [type]: { rich_text: [{ type: "text", text: { content } }] },
  });
  await request(
    "notion",
    await readToken("notion", target),
    `blocks/${encodeURIComponent(target.id)}/children`,
    "PATCH",
    {
      children: [
        block("heading_2", heading),
        ...chunks.map((text) => block("paragraph", text)),
      ],
    },
  );
}
