import { render } from '@testing-library/svelte';
import Markdown from '$lib/components/posts/Markdown.svelte';

describe('Markdown component', () => {
  it('renders paragraphs with line breaks', () => {
    const { baseElement } = render(Markdown, { source: 'hello\nworld' });
    const paragraph = baseElement.querySelector('p');
    expect(paragraph?.innerHTML).toBe('hello<br>world');
  });

  it('renders inline formatting', () => {
    const { baseElement } = render(Markdown, { source: '**bold** *italic* ~~struck~~ `code`' });
    const html = baseElement.querySelector('p')?.innerHTML ?? '';
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<del>struck</del>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders headings and lists', () => {
    const { baseElement } = render(Markdown, { source: '# Title\n\n- one\n- two\n\n1. first\n2. second' });
    expect(baseElement.querySelector('h1')?.textContent).toBe('Title');
    expect(baseElement.querySelectorAll('ul li')).toHaveLength(2);
    expect(baseElement.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('escapes raw HTML to prevent XSS', () => {
    const { baseElement } = render(Markdown, { source: '<script>alert("xss")</script>' });
    expect(baseElement.querySelector('script')).toBeNull();
    expect(baseElement.textContent).toContain('<script>');
  });

  it('only allows safe link protocols', () => {
    const { baseElement } = render(Markdown, {
      source: '[safe](https://example.com) [evil](javascript:alert(1))',
    });
    const links = baseElement.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(baseElement.textContent).toContain('evil');
  });

  it('renders blockquotes', () => {
    const { baseElement } = render(Markdown, { source: '> quoted text' });
    expect(baseElement.querySelector('blockquote')?.textContent).toBe('quoted text');
  });
});
