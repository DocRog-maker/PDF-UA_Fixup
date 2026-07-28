import { useRef } from 'react';

function PageNavControls({ instance }) {
    const documentViewer = instance?.Core?.documentViewer;
    const isReady = Boolean(documentViewer);
    const fileInputRef = useRef(null);

    const loadFile = (file) => {
        if (!file || !instance?.UI) {
            return;
        }

        instance.UI.loadDocument(file, { filename: file.name }).catch((error) => {
            console.error('Failed to load selected file in WebViewer', error);
        });
    };

    const goToNextPage = () => {
        if (!documentViewer) {
            return;
        }

        const currentPage = documentViewer.getCurrentPage();
        const totalPages = documentViewer.getPageCount();

        if (currentPage < totalPages) {
            documentViewer.setCurrentPage(currentPage + 1);
        }
    };

    const goToPreviousPage = () => {
        if (!documentViewer) {
            return;
        }

        const currentPage = documentViewer.getCurrentPage();

        if (currentPage > 1) {
            documentViewer.setCurrentPage(currentPage - 1);
        }
    };

    const openFilePicker = () => {
        if (!isReady) {
            return;
        }

        fileInputRef.current?.click();
    };

    const handleFileSelected = (event) => {
        const selectedFile = event.target.files?.[0];

        loadFile(selectedFile);

        event.target.value = '';
    };

    const handleFileDrop = (event) => {
        event.preventDefault();

        if (!isReady) {
            return;
        }

        const droppedFile = event.dataTransfer.files?.[0];
        loadFile(droppedFile);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
    };

    return (
        <div className="contract-review-controls">
            <button
                onClick={openFilePicker}
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                disabled={!isReady}
            >
                Open File
            </button>
            <button onClick={goToPreviousPage} disabled={!isReady}>
                Previous
            </button>
            <button onClick={goToNextPage} disabled={!isReady}>
                Next
            </button>

            <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelected}
                style={{ display: 'none' }}
            />
        </div>
    );

}

export default PageNavControls