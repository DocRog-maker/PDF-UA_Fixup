import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ContractReviewViewer from './ContractReviewViewer.jsx';
import PageNavControls from './PageNavControls.jsx';

function App() {
  const [webViewerInstance, setWebViewerInstance] = useState(null);

  return (
    <>
      <ContractReviewViewer onWebViewerInitialized={setWebViewerInstance} />
      <PageNavControls instance={webViewerInstance} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
 
    <App />

);
