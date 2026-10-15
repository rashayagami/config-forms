import { CustomView } from '../../components/custom-view';

export default function CustomPage() {
  return (
    <>
      <h1>Custom components and actions</h1>
      <p className="pg-lead">
        A "rating" component and an "app.fill_example" action registered by this application. The
        config only names them; the compiler checks their props and arguments against the specs
        registered with them.
      </p>
      <CustomView />
    </>
  );
}
