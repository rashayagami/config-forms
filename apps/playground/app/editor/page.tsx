import { EditorView } from '../../components/editor-view';

export default function EditorPage() {
  return (
    <>
      <h1>Config editor</h1>
      <p className="pg-lead">
        Edit the JSON. It is compiled as you type: errors show their path and a suggested fix; a
        valid config renders below.
      </p>
      <EditorView />
    </>
  );
}
