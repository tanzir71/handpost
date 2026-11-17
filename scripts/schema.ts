/**
 * Builds schema/handpost-post.v1.schema.json from the zod source of truth (src/shared/inbox-schema.ts).
 *   npm run schema          rewrite the committed file
 * tests/unit/inbox/schema-sync.test.ts fails when the committed file differs from what this produces.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultInboxSchemas } from '../src/shared/inbox-schema';

type Json = Record<string, unknown>;

export function buildPostJsonSchema(): Json {
  const { topPost, batch, cancel, post, parts } = defaultInboxSchemas;
  const generated = zodToJsonSchema(topPost.or(batch).or(cancel), {
    target: 'jsonSchema2019-09',
    definitionPath: '$defs',
    $refStrategy: 'root',
    definitions: { ...parts, post, batch, cancel },
  }) as Json;
  const defs = generated.$defs as Record<string, Json>;
  // Refinements are not expressible by zod-to-json-schema; restate the two that are plain JSON Schema.
  const postProps = defs.post!.properties as Record<string, Json>;
  postProps.platforms!.uniqueItems = true;
  postProps.labels!.uniqueItems = true;
  // Flatten the nested binary unions `.or()` produces into one list of alternatives.
  const flatten = (node: Json): Json[] =>
    Array.isArray(node.anyOf) && Object.keys(node).length === 1
      ? (node.anyOf as Json[]).flatMap(flatten)
      : [node];
  const { $schema: _ignored, ...rest } = generated;
  void _ignored;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://tanzir71.github.io/handpost/schema/handpost-post.v1.schema.json',
    title: 'Handpost inbox file — protocol v1',
    description:
      'One post, a batch of posts, or a cancel request dropped into the Handpost inbox. For Markdown files, validate the front matter object with `text` set to the body. Generated from src/shared/inbox-schema.ts (npm run schema). Normative spec: docs/INBOX_PROTOCOL.md.',
    // The top-level post is `post` with `handpost` required (zod: post.extend({ handpost: version })).
    anyOf: [
      { allOf: [{ $ref: '#/$defs/post' }, { required: ['handpost'] }] },
      ...flatten({ anyOf: rest.anyOf }).slice(1),
    ],
    $defs: rest.$defs,
  };
}

export function serializeSchema(schema: Json): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (process.argv[1] && /schema\.ts$/.test(process.argv[1])) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile('schema/handpost-post.v1.schema.json', serializeSchema(buildPostJsonSchema()), 'utf8');
  console.log('Wrote schema/handpost-post.v1.schema.json');
}
