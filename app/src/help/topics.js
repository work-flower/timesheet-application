// Auto-discovers help topics from src/help/*/index.md frontmatter.
// To add a topic: create src/help/{id}/index.md with YAML frontmatter:
//   ---
//   title: Topic Title
//   description: Short description for the card
//   tags: [tag1, tag2]
//   banner: banner.png  (optional, relative to topic folder)
//   ---

const markdownModules = import.meta.glob('./*/index.md', { eager: true, query: '?raw', import: 'default' });

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { attributes: {}, body: raw };

  const body = raw.slice(match[0].length).replace(/^\r?\n/, '');
  const attributes = {};

  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    }
    attributes[key] = value;
  }

  return { attributes, body };
}

const topics = Object.entries(markdownModules).map(([path, raw]) => {
  const id = path.match(/\.\/(.+?)\/index\.md/)?.[1];
  if (!id) return null;

  const { attributes, body } = parseFrontmatter(raw);

  const banner = attributes.banner
    ? `/help/${id}/${attributes.banner}`
    : null;

  return {
    id,
    title: attributes.title || id,
    description: attributes.description || '',
    tags: Array.isArray(attributes.tags) ? attributes.tags : [],
    banner,
    content: body,
  };
}).filter(Boolean);

export default topics;
