import { insertLink, prefixLines, wrapSelection } from '$lib/utils/post-markdown';

describe('wrapSelection', () => {
  it('wraps the selected text with markers', () => {
    const result = wrapSelection('hello world', 6, 11, '**', '**', 'text');
    expect(result.value).toBe('hello **world**');
    expect(result.start).toBe(8);
    expect(result.end).toBe(13);
  });

  it('uses the placeholder when nothing is selected', () => {
    const result = wrapSelection('hello ', 6, 6, '*', '*', 'text');
    expect(result.value).toBe('hello *text*');
    expect(result.start).toBe(7);
    expect(result.end).toBe(11);
  });
});

describe('prefixLines', () => {
  it('prefixes each line intersecting the selection', () => {
    const result = prefixLines('one\ntwo\nthree', 0, 11, '- ');
    expect(result.value).toBe('- one\n- two\n- three');
  });

  it('does not double-prefix lines', () => {
    const result = prefixLines('- one\ntwo', 0, 9, '- ');
    expect(result.value).toBe('- one\n- two');
  });

  it('only touches lines intersecting a partial selection', () => {
    const result = prefixLines('one\ntwo\nthree', 4, 7, '> ');
    expect(result.value).toBe('one\n> two\nthree');
  });
});

describe('insertLink', () => {
  it('turns the selection into a link and selects the URL', () => {
    const result = insertLink('see this', 4, 8, 'text');
    expect(result.value).toBe('see [this](https://)');
    expect(result.value.slice(result.start, result.end)).toBe('https://');
  });

  it('uses the placeholder for an empty selection', () => {
    const result = insertLink('', 0, 0, 'text');
    expect(result.value).toBe('[text](https://)');
  });
});
