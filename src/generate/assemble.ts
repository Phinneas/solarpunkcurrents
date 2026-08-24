export function assembleNewsletter(params: {
  subjectLine: string;
  preHeaderText: string;
  intro: string;
  storySections: string[];
  shortlist: string;
}): string {
  const { subjectLine, preHeaderText, intro, storySections, shortlist } = params;

  const sections = storySections.join("\n\n---\n");

  const SUBSTACK_URL = "https://phinneas.substack.com/";
  const WEBSITE_URL = "https://www.solarcurrents.co";

  return `# ${subjectLine}

${preHeaderText}

> [Subscribe on Substack](${SUBSTACK_URL}) | [Visit solarcurrents.co](${WEBSITE_URL})

---
${intro}

**[Subscribe to Solarpunk Currents on Substack →](${SUBSTACK_URL})**
---
${sections}
---
## The Quick Scribbles

${shortlist}

---

*Solarpunk Currents covers the clean energy transition through a solarpunk lens — community power, climate justice, and imaginative futures.* [Subscribe on Substack](${SUBSTACK_URL}) or [visit solarcurrents.co](${WEBSITE_URL}).
`;
}
