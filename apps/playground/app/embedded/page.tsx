import { EmbeddedView } from '../../components/embedded-view';

export default function EmbeddedPage() {
  return (
    <>
      <h1>Embedded in a dashboard</h1>
      <p className="pg-lead">
        The same forms in a 300px sidebar and in the main column. Layouts follow the width of their
        own container, not the window.
      </p>
      <EmbeddedView />
    </>
  );
}
