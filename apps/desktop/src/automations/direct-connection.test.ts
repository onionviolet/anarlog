import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));
vi.mock("~/ai/provider-fetch", () => ({ providerFetch: mocks.fetch }));
vi.mock("@anlg/plugin-store2", () => ({ commands: mocks }));

import {
  appendDirectNotionUpdate,
  createDirectLinearIssues,
  saveDirectConnection,
  sendDirectSlackRecap,
} from "./direct-connection";
import { parseAutomationTargetRef } from "./types";
import {
  parseAutomationWorkflows,
  serializeAutomationWorkflows,
  createEmptyWorkflow,
} from "./workflows";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.setSecret.mockResolvedValue({ status: "ok", data: null });
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
});

it("keeps direct routing through saved targets and workflows and rejects corrupt routing", () => {
  const target = {
    id: "C123",
    name: "channel",
    directConnectionId: "connection",
  };
  expect(parseAutomationTargetRef(JSON.stringify(target))).toEqual(target);
  const workflow = createEmptyWorkflow({
    steps: [{ id: "step", type: "slack_recap", target }],
  });
  expect(
    parseAutomationWorkflows(serializeAutomationWorkflows([workflow]))[0]
      .steps[0],
  ).toEqual(workflow.steps[0]);
  expect(
    parseAutomationTargetRef(
      JSON.stringify({ ...target, directConnectionId: 7 }),
    ),
  ).toBeNull();
});

it("validates the Slack destination read-only before securely saving its token and sends directly", async () => {
  mocks.fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ ok: true, channel: { id: "C123", name: "notes" } }),
    ),
  );
  const target = await saveDirectConnection("slack", "C123", "test-token");
  expect(target).not.toHaveProperty("token");
  const [url, init] = mocks.fetch.mock.calls[0];
  expect(url.toString()).toBe(
    "https://slack.com/api/conversations.info?channel=C123",
  );
  expect(init.method).toBe("GET");
  mocks.getSecret.mockResolvedValue({
    status: "ok",
    data: mocks.setSecret.mock.calls[0][2],
  });
  await sendDirectSlackRecap(target, "recap");
  const [sendUrl, sendInit] = mocks.fetch.mock.calls[1];
  expect(sendUrl.toString()).toBe("https://slack.com/api/chat.postMessage");
  expect(JSON.parse(sendInit.body)).toMatchObject({
    channel: "C123",
    text: "recap",
    unfurl_links: false,
  });
});

it("refuses a missing or destination-mismatched credential without sending data", async () => {
  const target = {
    id: "C123",
    name: "notes",
    directConnectionId: "connection",
  };
  for (const data of [
    null,
    JSON.stringify({
      integration: "slack",
      destinationId: "C456",
      token: "token",
    }),
  ]) {
    mocks.getSecret.mockResolvedValue({ status: "ok", data });
    await expect(sendDirectSlackRecap(target, "private recap")).rejects.toThrow(
      "Reconnect",
    );
  }
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("checks Linear GraphQL errors even on HTTP 200 and does not expose response secrets", async () => {
  mocks.getSecret.mockResolvedValue({
    status: "ok",
    data: JSON.stringify({
      integration: "linear",
      destinationId: "team",
      token: "test-token",
    }),
  });
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({ data: {}, errors: [{ message: "test-token" }] }),
    ),
  );
  await expect(
    createDirectLinearIssues(
      { id: "team", name: "Team", directConnectionId: "connection" },
      ["Action"],
      "Context",
    ),
  ).rejects.toThrow("linear rejected");
  const [, init] = mocks.fetch.mock.calls[0];
  expect(init.headers.Authorization).toBe("test-token");
  expect(JSON.parse(init.body).variables.input).toEqual({
    teamId: "team",
    title: "Action",
    description: "Context",
  });
});

it("appends a complete Notion recap with Unicode-safe text limits and rejects oversized recaps before writing", async () => {
  const target = { id: "page", name: "Page", directConnectionId: "connection" };
  mocks.getSecret.mockResolvedValue({
    status: "ok",
    data: JSON.stringify({
      integration: "notion",
      destinationId: "page",
      token: "test-token",
    }),
  });
  const text = "a".repeat(1999) + "🙂" + "z".repeat(2000);
  await appendDirectNotionUpdate(target, "Heading", text);
  const [url, init] = mocks.fetch.mock.calls[0];
  expect(url.toString()).toBe("https://api.notion.com/v1/blocks/page/children");
  const children = JSON.parse(init.body).children;
  const parts = children
    .slice(1)
    .map(
      (block: { paragraph: { rich_text: { text: { content: string } }[] } }) =>
        block.paragraph.rich_text[0].text.content,
    );
  expect(parts.join("")).toBe(text);
  expect(parts.every((part: string) => part.length <= 2000)).toBe(true);
  mocks.fetch.mockClear();
  await expect(
    appendDirectNotionUpdate(target, "Heading", "x".repeat(198001)),
  ).rejects.toThrow("append limit");
  await expect(
    appendDirectNotionUpdate(target, "Heading", "汉".repeat(170000)),
  ).rejects.toThrow("request size limit");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
