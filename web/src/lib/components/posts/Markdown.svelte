<!-- Renders post bodies (Markdown) as sanitized HTML. Dependency-free on
  purpose: raw HTML is escaped first, so only the formatting below can
  produce markup, and links are restricted to safe protocols. -->
<script lang="ts" module>
  const escapeHtml = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const renderInline = (text: string) => {
    let html = escapeHtml(text);
    // inline code first so its contents are not formatted
    html = html.replaceAll(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replaceAll(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replaceAll(/~~([^~\n]+)~~/g, '<del>$1</del>');
    html = html.replaceAll(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
      const safe = /^(https?:\/\/|mailto:)/i.test(url);
      return safe ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });
    return html;
  };

  const renderBlocks = (source: string) => {
    const lines = source.split('\n');
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | undefined;

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
        paragraph = [];
      }
    };
    const flushList = () => {
      if (list) {
        const tag = list.ordered ? 'ol' : 'ul';
        blocks.push(`<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
        list = undefined;
      }
    };

    for (const line of lines) {
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      const unordered = line.match(/^\s*[-*]\s+(.*)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const quote = line.match(/^\s*>\s?(.*)$/);

      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      } else if (unordered || ordered) {
        flushParagraph();
        const orderedList = Boolean(ordered);
        const item = (unordered ?? ordered)![1];
        if (!list || list.ordered !== orderedList) {
          flushList();
          list = { ordered: orderedList, items: [] };
        }
        list.items.push(item);
      } else if (quote) {
        flushParagraph();
        flushList();
        blocks.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      } else if (line.trim() === '') {
        flushParagraph();
        flushList();
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return blocks.join('');
  };
</script>

<script lang="ts">
  interface Props {
    source: string;
    class?: string;
  }

  let { source, class: className = '' }: Props = $props();

  const html = $derived(renderBlocks(source));
</script>

<div class="immich-markdown {className}">{@html html}</div>

<style>
  .immich-markdown :global(p) {
    margin: 0 0 0.5em;
  }
  .immich-markdown :global(p:last-child) {
    margin-bottom: 0;
  }
  .immich-markdown :global(h1),
  .immich-markdown :global(h2),
  .immich-markdown :global(h3) {
    margin: 0.75em 0 0.375em;
    font-weight: 600;
    line-height: 1.25;
  }
  .immich-markdown :global(h1) {
    font-size: 1.25em;
  }
  .immich-markdown :global(h2) {
    font-size: 1.125em;
  }
  .immich-markdown :global(h3) {
    font-size: 1em;
  }
  .immich-markdown :global(ul),
  .immich-markdown :global(ol) {
    margin: 0 0 0.5em;
    padding-left: 1.5em;
  }
  .immich-markdown :global(ul) {
    list-style: disc;
  }
  .immich-markdown :global(ol) {
    list-style: decimal;
  }
  .immich-markdown :global(blockquote) {
    margin: 0 0 0.5em;
    padding-left: 0.75em;
    border-left: 3px solid var(--color-immich-primary, #4250af);
    opacity: 0.85;
  }
  .immich-markdown :global(a) {
    color: var(--color-immich-primary, #4250af);
    text-decoration: underline;
  }
  .immich-markdown :global(code) {
    padding: 0.1em 0.3em;
    border-radius: 0.25em;
    background: rgb(0 0 0 / 0.07);
    font-size: 0.875em;
  }
  :global(.dark) .immich-markdown :global(code) {
    background: rgb(255 255 255 / 0.1);
  }
</style>
