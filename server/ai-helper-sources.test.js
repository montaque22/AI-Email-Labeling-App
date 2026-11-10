import { describe, expect, it } from "vitest";
import { extractAgentResearchSources } from "./ai-helper-sources.js";

describe("extractAgentResearchSources", () => {
  it("normalizes explicit source metadata without inventing missing fields", () => {
    const sources = extractAgentResearchSources([{ toolName: "connected_tool", result: {
      sources: [{ url: "https://example.com/report", title: "Public report", sourceType: "document", date: "2026-11-09" }],
    } }]);
    expect(sources).toEqual([expect.objectContaining({ domain: "example.com", title: "Public report", url: "https://example.com/report" })]);
  });

  it("collects URL records returned by research tools and rejects unsafe URLs", () => {
    const sources = extractAgentResearchSources([{ toolName: "search_web", result: { results: [
      { url: "https://open.example/news", title: "News" },
      { url: "file:///etc/passwd", title: "Unsafe" },
    ] } }]);
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("News");
  });

  it("does not treat unrelated tool URLs as research sources", () => {
    expect(extractAgentResearchSources([{ toolName: "createTask", result: { url: "https://tasks.example/item/1" } }])).toEqual([]);
  });
});
