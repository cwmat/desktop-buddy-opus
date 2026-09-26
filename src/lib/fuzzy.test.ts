import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch, highlightSegments, scoreFields } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyMatch('gt', 'Give treat')?.indices).toEqual([0, 5]);
    expect(fuzzyMatch('TREAT', 'Give treat')?.indices).toEqual([5, 6, 7, 8, 9]);
  });

  it('returns null when a character is missing', () => {
    expect(fuzzyMatch('xyz', 'Give treat')).toBeNull();
    expect(fuzzyMatch('taerg', 'Give treat')).toBeNull();
  });

  it('prefers contiguous word-start matches over the leftmost scatter', () => {
    expect(fuzzyMatch('nap', 'Turn on nap when away')?.indices).toEqual([8, 9, 10]);
  });

  it('rejects matches scattered through the middle of words', () => {
    expect(fuzzyMatch('idle', 'Hide during fullscreen')).toBeNull();
  });

  it('tolerates a dropped letter', () => {
    expect(fuzzyMatch('setings', 'Settings')).not.toBeNull();
  });

  it('jumps to word starts for acronyms', () => {
    expect(fuzzyMatch('rwi', 'Movement: Roam when idle')?.indices).toEqual([10, 15, 20]);
  });

  it('scores prefix > word start > mid-word', () => {
    const prefix = fuzzyMatch('nap', 'Nap time')!.score;
    const wordStart = fuzzyMatch('nap', 'Take a nap')!.score;
    const midWord = fuzzyMatch('nap', 'Snappy')!.score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it('scores contiguous higher than scattered', () => {
    expect(fuzzyMatch('tre', 'street')!.score).toBeGreaterThan(fuzzyMatch('tre', 'stxrxe')!.score);
  });
});

describe('scoreFields', () => {
  it('requires every word to match somewhere', () => {
    expect(scoreFields('roam idle', { title: 'Movement: Roam when idle' })).not.toBeNull();
    expect(scoreFields('roam banana', { title: 'Movement: Roam when idle' })).toBeNull();
  });

  it('lets keywords and subtitles match but only highlights the title', () => {
    const m = scoreFields('feed', { title: 'Give a treat', keywords: ['feed', 'snack'] });
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([]);
    const both = scoreFields('treat snack', { title: 'Give a treat', keywords: ['snack'] });
    expect(both!.indices).toEqual([7, 8, 9, 10, 11]);
  });

  it('weights title matches above keyword and subtitle matches', () => {
    const title = scoreFields('ghost', { title: 'Ghost mode' })!.score;
    const keyword = scoreFields('ghost', { title: 'Other', keywords: ['ghost'] })!.score;
    const subtitle = scoreFields('ghost', { title: 'Other', subtitle: 'ghost' })!.score;
    expect(title).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(subtitle);
  });

  it('only matches subtitles as substrings', () => {
    const subtitle = 'How long without input before you count as away (for roaming and naps).';
    expect(scoreFields('turn', { title: 'Idle after', subtitle })).toBeNull();
    expect(scoreFields('roaming', { title: 'Idle after', subtitle })).not.toBeNull();
  });

  it('matches everything with an empty query', () => {
    expect(scoreFields('   ', { title: 'Anything' })).toEqual({ score: 0, indices: [] });
  });
});

describe('fuzzyFilter', () => {
  const items = ['Snappy', 'Take a nap', 'Nap time', 'Zebra'];
  const fields = (title: string) => ({ title });

  it('drops non-matches and ranks the best first', () => {
    expect(fuzzyFilter('nap', items, fields).map((r) => r.item)).toEqual(['Nap time', 'Take a nap', 'Snappy']);
  });

  it('keeps original order for an empty query', () => {
    expect(fuzzyFilter('', items, fields).map((r) => r.item)).toEqual(items);
  });
});

describe('highlightSegments', () => {
  it('groups runs of matched and unmatched characters', () => {
    expect(highlightSegments('Give treat', [0, 5, 6])).toEqual([
      { text: 'G', match: true },
      { text: 'ive ', match: false },
      { text: 'tr', match: true },
      { text: 'eat', match: false },
    ]);
  });

  it('returns the whole text when nothing matched', () => {
    expect(highlightSegments('Hello', [])).toEqual([{ text: 'Hello', match: false }]);
  });
});
