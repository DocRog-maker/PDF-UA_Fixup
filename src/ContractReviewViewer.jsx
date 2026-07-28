import { useEffect, useRef } from 'react';
import WebViewer from '@pdftron/webviewer';

function ContractReviewViewer({ contractDocumentUrl, onWebViewerInitialized }) {
  const viewerContainerRef = useRef(null);
  const licenseKey = import.meta.env.APRYSE_LICENSE_KEY;

  useEffect(() => {
    WebViewer(
      {
        path: 'lib/webviewer',
        licenseKey,
        initialDoc: contractDocumentUrl,
        enableFilePicker: true,
        fullAPI: true,
      },
      viewerContainerRef.current
    ).then((instance) => {
      onWebViewerInitialized?.(instance);
    });
  }, [contractDocumentUrl, licenseKey, onWebViewerInitialized]);

  return <div ref={viewerContainerRef} style={{ height: '80vh' }} />;
}

export default ContractReviewViewer;