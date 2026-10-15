import { examples } from '../lib/examples';

export default function Home() {
  return (
    <>
      <h1>Examples</h1>
      <p className="pg-lead">
        Three unrelated forms, each defined only by JSON and rendered by the same library.
      </p>
      <ul className="pg-cards">
        {examples.map((example) => (
          <li key={example.id} className="pg-card">
            <h2>
              <a href={`/examples/${example.id}`}>{example.title}</a>
            </h2>
            <p>{example.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
