import { Suspense } from 'react';
import { LargeView } from '../../components/large-view';

export default function LargePage() {
  return (
    <>
      <h1>Large form</h1>
      <p className="pg-lead">
        A generated form for measuring render cost. Change the size with ?fields=10, 100, 500 or
        1000.
      </p>
      <Suspense>
        <LargeView />
      </Suspense>
    </>
  );
}
