import type { ReactNode } from 'react';
import { cn } from './utils';

/**
 * Renders the agent's message text.
 *
 * The agent is a MULTI-CHANNEL agent: one prompt serves WhatsApp, Instagram,
 * Facebook and this widget (chat-orchestrator.ts routes them all to
 * sales-agent). It is instructed to emit WhatsApp's own markup — *asterisks*
 * for bold and • for bullets — because on WhatsApp that IS the formatting.
 *
 * The web widget used to render that string in a single
 * `<p className="whitespace-pre-wrap">`, so customers read a literal
 * "*Ag/AgCl Reference Electrode*", asterisks and all.
 *
 * The fix belongs here, not in the prompt: strip the asterisks from the agent
 * and WhatsApp loses its bold. This translates the same wire format into real
 * elements for the web.
 *
 * NO HTML IS EVER CONSTRUCTED. Everything below returns React nodes, so message
 * text cannot become markup — the property the previous `linkify` had, kept.
 * That also rules out a markdown library: react-markdown plus a sanitiser would
 * add far more to a 356 KiB bundle than this handles, and would parse syntax
 * the agent never emits.
 */

/** URLs, kept as their own token so they survive the bold pass. */
const URL_SPLIT = /(https?:\/\/[^\s<>"')]+)/g;

/**
 * *bold* — asterisk-delimited, no newline inside, and the content may not begin
 * or end with a space. That last rule is what stops "2 * 3 * 4" becoming bold;
 * the agent always writes *Product Name* with no padding.
 */
const BOLD_SPLIT = /(\*[^\s*][^*\n]*[^\s*]\*|\*[^\s*]\*)/g;

const BULLET = /^\s*[•·]\s*/;

function link(url: string, isUser: boolean, onNavigate: (u: string) => void, key: string): ReactNode {
    // Trailing punctuation belongs to the sentence, not the href.
    const trail = url.match(/[.,;:!?)]+$/)?.[0] ?? '';
    const href = trail ? url.slice(0, url.length - trail.length) : url;
    return (
        <span key={key}>
            <a
                href={href}
                onClick={(e) => {
                    e.preventDefault();
                    onNavigate(href);
                }}
                className={cn(
                    'font-semibold underline decoration-1 underline-offset-2 break-all cursor-pointer',
                    isUser ? 'text-white' : 'text-red-600 hover:text-red-700',
                )}
            >
                {href}
            </a>
            {trail}
        </span>
    );
}

/** URLs inside a run of plain text. */
function withLinks(
    text: string,
    isUser: boolean,
    onNavigate: (u: string) => void,
    keyPrefix: string,
): ReactNode[] {
    return text.split(URL_SPLIT).map((part, i) =>
        /^https?:\/\//.test(part) ? (
            link(part, isUser, onNavigate, `${keyPrefix}-u${i}`)
        ) : (
            <span key={`${keyPrefix}-t${i}`}>{part}</span>
        ),
    );
}

/** One line: bold runs first, then links inside everything that is left. */
function inline(
    text: string,
    isUser: boolean,
    onNavigate: (u: string) => void,
    keyPrefix: string,
): ReactNode[] {
    // Built imperatively rather than with flatMap: flatMap over string[] is
    // typed to return elements, and each branch here yields a ReactNode[].
    const out: ReactNode[] = [];
    text.split(BOLD_SPLIT).forEach((part, i) => {
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            out.push(
                <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
                    {withLinks(part.slice(1, -1), isUser, onNavigate, `${keyPrefix}-b${i}`)}
                </strong>,
            );
            return;
        }
        out.push(...withLinks(part, isUser, onNavigate, `${keyPrefix}-p${i}`));
    });
    return out;
}

/**
 * Blocks: runs of consecutive "• " lines become one list; everything else is a
 * paragraph. Blank lines separate blocks rather than rendering as empty ones.
 */
export function renderRichText(
    text: string,
    isUser: boolean,
    onNavigate: (url: string) => void,
): ReactNode {
    if (!text) return text;

    const lines = text.split('\n');
    const blocks: ReactNode[] = [];
    let bullets: string[] = [];

    const flushBullets = () => {
        if (bullets.length === 0) return;
        const items = bullets;
        bullets = [];
        blocks.push(
            <ul key={`ul-${blocks.length}`} className="my-1 space-y-1 ps-4 list-disc">
                {items.map((b, i) => (
                    <li key={i}>{inline(b, isUser, onNavigate, `li-${blocks.length}-${i}`)}</li>
                ))}
            </ul>,
        );
    };

    for (const raw of lines) {
        if (BULLET.test(raw)) {
            bullets.push(raw.replace(BULLET, ''));
            continue;
        }
        flushBullets();
        if (raw.trim() === '') continue; // spacing comes from the block margins
        blocks.push(
            <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
                {inline(raw, isUser, onNavigate, `p-${blocks.length}`)}
            </p>,
        );
    }
    flushBullets();

    return <div className="space-y-1">{blocks}</div>;
}
