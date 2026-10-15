import { notFound } from 'next/navigation';
import { ExampleView } from '../../../components/example-view';
import { examples } from '../../../lib/examples';

export function generateStaticParams() {
  return examples.map((example) => ({ id: example.id }));
}

export default async function ExamplePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const example = examples.find((candidate) => candidate.id === id);
  if (!example) notFound();
  return (
    <>
      <h1>{example.title}</h1>
      <p className="pg-lead">{example.summary}</p>
      <ExampleView exampleId={example.id} />
    </>
  );
}
