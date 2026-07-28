import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ContractReviewViewer from './ContractReviewViewer.jsx';
import PageNavControls from './PageNavControls.jsx';

function App() {
  const [webViewerInstance, setWebViewerInstance] = useState(null);

  return (
    <div className="contract-review-layout">
      <div className="contract-review-viewer">
        <ContractReviewViewer onWebViewerInitialized={setWebViewerInstance} />
      </div>
      <PageNavControls instance={webViewerInstance} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
 
    <App />

);
