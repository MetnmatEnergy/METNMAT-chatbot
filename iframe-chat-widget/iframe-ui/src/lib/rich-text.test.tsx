/**
 * Run with:  bun test src/lib/rich-text.test.tsx
 *
 * The strings below are REAL agent output, captured from production on
 * 2026-08-04 via scripts/measure-answer-length.mjs — not invented examples.
 */
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderRichText } from './rich-text';

const html = (text: string) => renderToStaticMarkup(renderRichText(text, false, () => {}));
/** What a customer actually reads, with all tags removed. */
const visible = (text: string) => html(text).replace(/<[^>]*>/g, '');

describe('the asterisk bug', () => {
    const real = '*Ag/AgCl Reference Electrode* — a widely used reference electrode in electrochemical experiments.';

    it('does not show asterisks to the customer', () => {
        expect(visible(real)).not.toContain('*');
    });

    it('renders the product name as real bold', () => {
        expect(html(real)).toContain('<strong');
        expect(visible(real)).toContain('Ag/AgCl Reference Electrode');
    });

    it('keeps the rest of the sentence intact', () => {
        expect(visible(real)).toContain('widely used reference electrode');
    });
});

describe('bullets', () => {
    const real = [
        'Some key features of the Ag/AgCl reference electrode include:',
        '• High stability and reliability',
        '• Low noise and drift',
    ].join('\n');

    it('becomes a real list, not bullet characters in a paragraph', () => {
        const out = html(real);
        expect(out).toContain('<ul');
        expect(out.match(/<li/g)?.length).toBe(2);
        expect(visible(real)).not.toContain('•');
    });
});

describe('links still work', () => {
    const real = 'You can find more information on our website: https://www.metnmat.com/shop';

    it('renders an anchor with the url as href', () => {
        expect(html(real)).toContain('href="https://www.metnmat.com/shop"');
    });

    it('does not swallow trailing punctuation into the href', () => {
        expect(html('See https://www.metnmat.com/shop.')).toContain('href="https://www.metnmat.com/shop"');
    });

    it('links inside a bold run still render', () => {
        expect(html('*Shop*: https://www.metnmat.com/shop')).toContain('href=');
    });
});

describe('it cannot become markup', () => {
    // The single property the old renderer had that must not be lost.
    it('escapes html in message text', () => {
        const out = html('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
        expect(out).not.toContain('<img');
        expect(out).not.toContain('<script>');
        expect(out).toContain('&lt;');
    });

    it('escapes html inside a bold run', () => {
        expect(html('*<b>hi</b>*')).not.toContain('<b>hi</b>');
    });

    it('escapes html inside a bullet', () => {
        expect(html('• <img src=x onerror=1>')).not.toContain('<img');
    });
});

describe('does not over-match', () => {
    it('leaves arithmetic alone', () => {
        expect(visible('2 * 3 * 4 equals 24')).toContain('2 * 3 * 4');
    });

    it('leaves a lone asterisk alone', () => {
        expect(visible('grade A* material')).toContain('A*');
    });

    it('handles empty text without throwing', () => {
        expect(() => html('')).not.toThrow();
    });
});
