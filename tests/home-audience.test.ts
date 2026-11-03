import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeAudience from "@/components/HomeAudience";

describe("the public development preview", () => {
  it("describes a product being built rather than a service already for sale", () => {
    const html = renderToStaticMarkup(createElement(HomeAudience));
    assert.match(html, /We are building/);
    assert.doesNotMatch(html, /Choose a plan|Buy now|Subscribe now/i);
  });

  it("lets both audiences identify themselves with labelled radio controls", () => {
    const html = renderToStaticMarkup(createElement(HomeAudience));
    assert.match(html, /Who are you planning for\?/);
    assert.match(html, /Planning trips for clients/);
    assert.match(html, /Planning my own trip/);
    assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
    assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  });

  it("takes a prospective visitor to public examples and company information", () => {
    const html = renderToStaticMarkup(createElement(HomeAudience));
    assert.match(html, /href="\/sample-itinerary"/);
    assert.match(html, /href="\/about"/);
    assert.doesNotMatch(html, /href="\/(?:login|account|itinerary)(?:[?"/])/);
  });
});
