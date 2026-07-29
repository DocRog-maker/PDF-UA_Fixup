import { useEffect, useRef } from 'react';
import WebViewer from '@pdftron/webviewer';

function DocumentViewer({ contractDocumentUrl, onWebViewerInitialized }) {
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
      instance.UI.disableElements([
        'downloadButton',
        'saveAsButton',
        'toolbarGroup-Annotate',
        'toolbarGroup-Shapes',
        'toolbarGroup-Insert',
        'toolbarGroup-Edit',
        'toolbarGroup-FillAndSign',
        'toolbarGroup-Forms',
        'toolbarGroup-View',
      ]);
      onWebViewerInitialized?.(instance);
    });
  }, [contractDocumentUrl, licenseKey, onWebViewerInitialized]);

  return <div ref={viewerContainerRef} style={{ height: '80vh' }} />;
}

export default DocumentViewer;