import Anthropic from '@anthropic-ai/sdk';

// Looking at every photo before anybody else does.
//
// The review queue worked and had one fatal flaw: it depended on a person
// emptying it. A queue nobody empties is the same as no upload button, and
// photos that go up three days late are photos nobody sees.
//
// So Haiku looks at every upload as it arrives. Cheap enough not to think about
// at about a quarter of a cent each, and fast enough that the person who sent
// it finds out then and there rather than wondering for a day.
//
// Three answers, not two, and the third is the important one.
//
// Anything clearly fine goes up. Anything clearly wrong is deleted on the spot.
// Anything the model is not sure about goes to the human queue, which is what
// that queue is now for. A moderator that only says yes or no has to guess on
// the hard ones, and it will guess wrong in both directions: publishing
// something it should not, and binning somebody's genuine photo of their camp
// because there happened to be a person in the frame.
//
// It fails shut. A model that times out, errors, or returns something
// unexpected leaves the photo pending. The one outcome that must never happen
// by accident is an unchecked photo going public.

export type Verdict = {
  decision: 'ok' | 'reject' | 'unsure';
  /** Plain words, shown to the person who uploaded it when it is refused. */
  reason: string;
  /** A short description, used as alt text so the photos are readable aloud. */
  caption: string;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'reason', 'caption'],
  properties: {
    decision: {
      type: 'string',
      enum: ['ok', 'reject', 'unsure'],
      description: "'ok' to publish, 'reject' to delete, 'unsure' to send to a person.",
    },
    reason: {
      type: 'string',
      description: "Why, in one short sentence, addressed to the person who uploaded it. Empty when the decision is 'ok'.",
    },
    caption: {
      type: 'string',
      description: 'A short plain description of what is in the photo, for somebody who cannot see it. Under 15 words.',
    },
  },
} as const;

const SYSTEM = [
  'You are checking photographs uploaded to an Australian caravan and camping map.',
  'Somebody who stayed at a campsite or caravan park has taken a photo of it for other travellers.',
  '',
  'Answer ok when the photo shows a place: a campsite, a caravan park, an amenities block, a view from a site, a beach, bush, a road, a facility, a sign at the entrance. Ordinary holiday snapshots are the point of this. A photo can be badly composed, dim, crooked or dull and still be ok. People appearing in a photo of a place is normal and fine.',
  '',
  'Answer reject only for: sexual or nude content; violence, injury or gore; hate symbols or abuse; anything involving children inappropriately; illegal activity; an advertisement, a business card, a price list or a screenshot; a photo that is only text; something with a phone number, a website or a promotion written across it.',
  '',
  'Answer unsure when you genuinely cannot tell, when the photo is mostly a close portrait of one identifiable person rather than a place, when there is a car registration plate or a document readable in the frame, or when it might be someone else\'s professional photograph rather than a snapshot.',
  '',
  'Prefer unsure to reject when in doubt. A person will look at it. Wrongly deleting somebody\'s photo of their own camp is worse than making them wait.',
  'Never use em dashes or en dashes in the reason. Use a comma or a full stop.',
].join('\n');

/**
 * @param base64 the image bytes, base64 encoded, without the data URL prefix
 */
export async function judge(base64: string, mediaType: 'image/jpeg' | 'image/webp'): Promise<Verdict> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { decision: 'unsure', reason: '', caption: '' };
  }
  try {
    const claude = new Anthropic({ timeout: 25_000, maxRetries: 1 });
    const res = await claude.messages.create({
      // Haiku, not Opus. This is a well specified yes or no on an ordinary
      // photograph, it runs on every single upload, and the hard cases are
      // handed to a person rather than reasoned about.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Check this photo.' },
        ],
      }],
    });

    // A refusal is the model declining to look at something, which is itself a
    // signal that a person should.
    if (res.stop_reason === 'refusal') {
      return { decision: 'unsure', reason: '', caption: '' };
    }

    const text = res.content.find((b) => b.type === 'text');
    if (!text) return { decision: 'unsure', reason: '', caption: '' };

    const out = JSON.parse(text.text) as Verdict;
    if (out.decision !== 'ok' && out.decision !== 'reject' && out.decision !== 'unsure') {
      return { decision: 'unsure', reason: '', caption: '' };
    }
    return {
      decision: out.decision,
      reason: String(out.reason ?? '').slice(0, 200),
      caption: String(out.caption ?? '').slice(0, 140),
    };
  } catch {
    // Timeouts, rate limits, a bad response: all of them mean a person looks at
    // it. Never a silent approval.
    return { decision: 'unsure', reason: '', caption: '' };
  }
}
