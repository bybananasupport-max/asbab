import { describe, it, expect } from "vitest";
import Markdown from "../www/markdown.js";

describe("markdown (Phase 6.2)", () => {
  it("formats bold, italic, code, lists and headings", () => {
    const html = Markdown.toHtml("# Ringkasan\n**Tebal** dan *condong* `kod`\n- satu\n- dua\n\n1. a\n2. b");
    expect(html).toContain("<strong>Ringkasan</strong>");
    expect(html).toContain("<strong>Tebal</strong>");
    expect(html).toContain("<em>condong</em>");
    expect(html).toContain("<code>kod</code>");
    expect(html).toContain("<ul><li>satu</li><li>dua</li></ul>");
    expect(html).toContain("<ol><li>a</li><li>b</li></ol>");
  });

  it("never lets HTML through", () => {
    const html = Markdown.toHtml('<img src=x onerror="alert(1)"> **<script>x</script>**');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps only http(s) links and marks them for opening outside the app", () => {
    const html = Markdown.toHtml("[Google](https://google.com) [jahat](javascript:alert(1)) https://example.com/a_b.");
    expect(html).toContain('data-url="https://google.com"');
    expect(html).toContain('data-url="https://example.com/a_b"');
    expect(html).not.toContain("javascript:alert(1)\"");
    expect(html).not.toMatch(/href="javascript/);
  });

  it("code blocks keep their text as is", () => {
    expect(Markdown.toHtml("```\n**x** <b>\n```")).toBe("<pre><code>**x** &lt;b&gt;</code></pre>");
  });

  it("plain text for copying", () => {
    expect(Markdown.toPlain("**Tebal** [Google](https://google.com)\n# Tajuk")).toBe("Tebal Google (https://google.com)\nTajuk");
  });
});
