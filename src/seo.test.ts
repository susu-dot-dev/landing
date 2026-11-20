import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@rstest/core";
import { Window } from "happy-dom";

const projectRoot = resolve(import.meta.dirname, "..");
const indexHtml = readFileSync(resolve(projectRoot, "src/index.html"), "utf8");
const ogImageSvg = readFileSync(resolve(projectRoot, "public/og-image.svg"), "utf8");
const robotsTxt = readFileSync(resolve(projectRoot, "public/robots.txt"), "utf8");

const parseHtml = (html: string) => {
  const win = new Window({
    settings: {
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
    },
  });
  return new win.DOMParser().parseFromString(html, "text/html");
};

describe("SEO and static metadata", () => {
  test("src/index.html includes core document, SEO, canonical, and theme metadata", () => {
    const doc = parseHtml(indexHtml);

    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    expect(doc.querySelector("meta[charset]")?.getAttribute("charset")?.toLowerCase()).toBe(
      "utf-8",
    );
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).toContain(
      "width=device-width",
    );
    expect(doc.querySelector("title")?.textContent?.trim()).toBe("susu.dev");

    const description = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    expect(description?.trim().length).toBeGreaterThan(20);

    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://susu.dev/",
    );
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#f3ece0");
  });

  test("src/index.html includes complete Open Graph and Twitter Card tags", () => {
    const doc = parseHtml(indexHtml);

    const requiredOgProps = [
      "og:type",
      "og:site_name",
      "og:title",
      "og:description",
      "og:url",
      "og:image",
      "og:image:width",
      "og:image:height",
      "og:image:alt",
    ];

    for (const prop of requiredOgProps) {
      const value = doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content")?.trim();
      expect(value, `missing ${prop}`).toBeTruthy();
    }

    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("website");
    expect(doc.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe(
      "1200",
    );
    expect(doc.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe(
      "630",
    );
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://susu.dev/og-image.svg",
    );

    const requiredTwitterNames = [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
    ];

    for (const name of requiredTwitterNames) {
      const value = doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim();
      expect(value, `missing ${name}`).toBeTruthy();
    }

    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
  });

  test("src/index.html embeds valid JSON-LD WebSite structured data", () => {
    const doc = parseHtml(indexHtml);
    const ldScript = doc.querySelector('script[type="application/ld+json"]');
    expect(ldScript).not.toBeNull();

    const jsonLd = JSON.parse(ldScript?.textContent ?? "{}") as Record<string, unknown>;
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("WebSite");
    expect(jsonLd.name).toBe("susu.dev");
    expect(jsonLd.url).toBe("https://susu.dev/");
    expect(typeof jsonLd.description).toBe("string");
    expect((jsonLd.description as string).trim().length).toBeGreaterThan(20);
  });

  test("src/index.html preconnects Google Fonts with display=swap and keeps dark-mode bootstrap", () => {
    const doc = parseHtml(indexHtml);

    const preconnects = Array.from(doc.querySelectorAll('link[rel="preconnect"]')).map((el) =>
      el.getAttribute("href"),
    );
    expect(preconnects).toContain("https://fonts.googleapis.com");
    expect(preconnects).toContain("https://fonts.gstatic.com");

    const fontStylesheet = doc
      .querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
      ?.getAttribute("href");
    expect(fontStylesheet).toContain("Fraunces");
    expect(fontStylesheet).toContain("Cormorant+Garamond");
    expect(fontStylesheet).toContain("display=swap");

    expect(indexHtml).toContain('localStorage.getItem("susu-theme")');
  });

  test("src/index.html avoids JS flash-of-content and renders fallback strictly inside noscript .nojs", () => {
    const doc = parseHtml(indexHtml);

    const root = doc.querySelector("#root");
    expect(root).not.toBeNull();
    expect(root?.innerHTML.trim()).toBe("");

    const noscriptMatch = indexHtml.match(/<noscript>([\s\S]*?)<\/noscript>/i);
    expect(noscriptMatch).not.toBeNull();
    const noscriptContent = noscriptMatch?.[1] ?? "";
    expect(noscriptContent).toContain('class="nojs"');
    expect(noscriptContent).toContain("#f3ece0");
    expect(noscriptContent).toContain("susu.dev");
    expect(noscriptContent).toMatch(/<h1\b[^>]*>[\s\S]*susu\.dev[\s\S]*<\/h1>/i);
    expect(noscriptContent).not.toContain("This site needs JavaScript.");
  });

  test("public/og-image.svg is a valid 1200x630 self-contained SVG", () => {
    const trimmed = ogImageSvg.trim();
    expect(trimmed.startsWith("<svg")).toBe(true);
    expect(trimmed.endsWith("</svg>")).toBe(true);
    expect(trimmed).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(trimmed).toContain('viewBox="0 0 1200 630"');
    expect(trimmed).toContain("susu.dev");
    expect(trimmed).not.toContain("<script");
  });

  test("public/robots.txt allows search engine crawling", () => {
    expect(robotsTxt).toMatch(/^User-agent:\s*\*/m);
    expect(robotsTxt).toMatch(/^Allow:\s*\//m);
  });
});
