import { describe, it, expect } from "vitest";
import {
  flattenTemplateVariables,
  provenanceForTemplate,
  renderTemplate,
  templatePlaceholderKeys,
  variablesForTemplate,
} from "../src/modules/packet/template-engine.js";

describe("renderTemplate", () => {
  it("replaces flat keys", () => {
    const out = renderTemplate("Hello {{name}}, {{name}}!", {
      name: "World",
    });
    expect(out).toBe("Hello World, World!");
  });

  it("uses empty string for nullish values in the map", () => {
    const out = renderTemplate("x{{a}}y", { a: "" });
    expect(out).toBe("xy");
  });

  it("escapes dots in keys so they match literally", () => {
    const out = renderTemplate("NPI: {{a.b}}", { "a.b": "123" });
    expect(out).toBe("NPI: 123");
  });

  it("does not treat . in key as regex wildcard", () => {
    const out = renderTemplate("{{x.y}}", { "x.y": "ok" });
    expect(out).toBe("ok");
    expect(renderTemplate("{{xay}}", { "x.y": "bad" })).toBe("{{xay}}");
  });
});

describe("flattenTemplateVariables + variablesForTemplate", () => {
  it("flattens nested paths for templates", () => {
    const flat = flattenTemplateVariables({
      case: { patientFirstName: "Jane" },
      derived: { diagnosisCodesJoined: "M17" },
    });
    expect(flat["case.patientFirstName"]).toBe("Jane");
    expect(flat["derived.diagnosisCodesJoined"]).toBe("M17");
  });

  it("fills missing placeholder keys with empty string", () => {
    const template = "a{{missing}}b";
    const vars = variablesForTemplate(template, { x: 1 } as Record<string, unknown>);
    expect(vars.missing).toBe("");
    expect(renderTemplate(template, vars)).toBe("ab");
  });
});

describe("templatePlaceholderKeys / provenanceForTemplate", () => {
  it("lists placeholders and builds provenance map", () => {
    expect(templatePlaceholderKeys("{{a}} and {{b.c}}")).toEqual(["a", "b.c"]);
    expect(provenanceForTemplate("{{a}}")).toEqual({ a: "a" });
  });
});
