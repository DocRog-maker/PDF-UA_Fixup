import { useCallback, useEffect, useRef, useState } from 'react';

function PageNavControls({ instance }) {
    const documentViewer = instance?.Core?.documentViewer;
    const isReady = Boolean(documentViewer);
    const fileInputRef = useRef(null);
    const activeHighlightAnnotationRef = useRef(null);
    const [imageTagsWithAltText, setImageTagsWithAltText] = useState([]);
    const [selectedImageTagId, setSelectedImageTagId] = useState('');
    const [editableAltText, setEditableAltText] = useState('');
    const [isDownloadingFile, setIsDownloadingFile] = useState(false);
    const [isSavingAltText, setIsSavingAltText] = useState(false);
    const [altTextSaveStatus, setAltTextSaveStatus] = useState('');
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const licenseKey = import.meta.env.APRYSE_LICENSE_KEY || '';
    const enableImageHighlight = true;

    const loadFile = (file) => {
        if (!file || !instance?.UI) {
            return;
        }

        instance.UI.loadDocument(file, { filename: file.name }).catch((error) => {
            console.error('Failed to load selected file in WebViewer', error);
        });
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

    const downloadCurrentFile = async () => {
        if (!instance?.UI?.downloadPdf || isDownloadingFile) {
            return;
        }

        setIsDownloadingFile(true);
        clearImageHighlight();
        try {
            await instance.UI.downloadPdf();
        } catch (error) {
            console.error('Failed to download PDF from WebViewer', error);
        } finally {
            setIsDownloadingFile(false);
        }
    };

    const clearImageHighlight = useCallback(() => {
        const annotationManager = instance?.Core?.annotationManager;
        const highlightAnnotation = activeHighlightAnnotationRef.current;

        if (!annotationManager || !highlightAnnotation) {
            return;
        }

        annotationManager.deleteAnnotation(highlightAnnotation, {
            force: true,
            source: 'image-tag-highlight',
        });
        activeHighlightAnnotationRef.current = null;
    }, [instance]);

    const showImageHighlight = useCallback((imageTag) => {
        clearImageHighlight();

        if (!enableImageHighlight) {
            return;
        }

        if (!imageTag?.pageNumber || !imageTag?.rect || !instance?.Core || !documentViewer) {
            return;
        }

        console.log(`Rect ${imageTag?.rect.y1} ${imageTag?.rect.y2}`)
        const { annotationManager, Annotations, Math: CoreMath } = instance.Core;
        const pageHeight = documentViewer.getPageHeight(imageTag.pageNumber);
        const pageWidth = documentViewer.getPageWidth(imageTag.pageNumber);
        const minX = Math.min(imageTag.rect.x1, imageTag.rect.x2);
        const maxX = Math.max(imageTag.rect.x1, imageTag.rect.x2);
        const minY = Math.min(imageTag.rect.y1, imageTag.rect.y2);
        const maxY = Math.max(imageTag.rect.y1, imageTag.rect.y2);
        const padding = 6;
        const top = pageHeight - maxY;
        const bottom = pageHeight - minY;
        const leftClamped = Math.max(0, minX - padding);
        const rightClamped = Math.min(pageWidth, maxX + padding);
        const topClamped = Math.max(0, top - padding);
        const bottomClamped = Math.min(pageHeight, bottom + padding);
        const rectLeft = Math.min(leftClamped, rightClamped);
        const rectRight = Math.max(leftClamped, rightClamped);
        const rectTop = Math.min(topClamped, bottomClamped);
        const rectBottom = Math.max(topClamped, bottomClamped);

        const highlightAnnotation = new Annotations.RectangleAnnotation({
            PageNumber: imageTag.pageNumber,
        });

        highlightAnnotation.StrokeColor = new Annotations.Color(0, 136, 0, 1);
        highlightAnnotation.FillColor = new Annotations.Color(255, 204, 0, 0.2);
        highlightAnnotation.StrokeThickness = 2;
        highlightAnnotation.Opacity = 0.85;
        highlightAnnotation.Listable = false;
        highlightAnnotation.ReadOnly = true;
        highlightAnnotation.Locked = true;
        highlightAnnotation.setRect(
            new CoreMath.Rect(
                rectLeft,
                rectTop,
                rectRight,
                rectBottom
            )
        );

        annotationManager.addAnnotation(highlightAnnotation, {
            source: 'image-tag-highlight',
        });
        annotationManager.redrawAnnotation(highlightAnnotation);
        activeHighlightAnnotationRef.current = highlightAnnotation;
        instance.Core.annotationManager.jumpToAnnotation(highlightAnnotation);
    }, [clearImageHighlight, documentViewer, enableImageHighlight, instance]);

    const scrollToImageTag = useCallback((imageTag, options = {}) => {
        const { alignTop = false } = options;

        if (!documentViewer || !imageTag?.pageNumber) {
            return;
        }
        console.log(imageTag.rect)
console.log(`imageTagYY ${imageTag.rect.y1}`)
        showImageHighlight(imageTag);
        documentViewer.setCurrentPage(imageTag.pageNumber, !alignTop);
    }, [documentViewer, showImageHighlight]);

    const loadTags = useCallback(async () => {
        if (!instance?.Core || !documentViewer) {
            setImageTagsWithAltText([]);
            setSelectedImageTagId('');
            setEditableAltText('');
            setAltTextSaveStatus('');
            return;
        }

        setIsLoadingTags(true);

        try {
            const doc = documentViewer.getDocument();
            const pdfDoc = await doc.getPDFDoc();

            const extractedData = await instance.Core.PDFNet.runWithCleanup(async () => {
                await pdfDoc.initSecurityHandler();
                const structTree = await pdfDoc.getStructTree();

                if (!(await structTree.isValid())) {
                    return { tags: [], imageTags: [] };
                }

                const imageTags = [];
                const elementTypes = instance.Core.PDFNet.Element.Type;
                const contentItemTypes = instance.Core.PDFNet.ContentItem.Type;

                const findFirstPageForElement = async (structElement) => {
                    const numKids = await structElement.getNumKids();

                    for (let index = 0; index < numKids; index += 1) {
                        const isContentItem = await structElement.isContentItem(index);

                        if (isContentItem) {
                            const contentItem = await structElement.getAsContentItem(index);
                            const page = await contentItem.getPage();

                            if (!(await page.isValid())) {
                                continue;
                            }

                            const pageNumber = await page.getIndex();
                            const contentItemType = await contentItem.getType();
                            const mcid =
                                contentItemType === contentItemTypes.e_MCR || contentItemType === contentItemTypes.e_MCID
                                    ? await contentItem.getMCID()
                                    : null;

                            return { page, pageNumber, mcid };
                        }

                        const childElement = await structElement.getAsStructElem(index);
                        if (!(await childElement.isValid())) {
                            continue;
                        }

                        const nestedPageData = await findFirstPageForElement(childElement);
                        if (nestedPageData) {
                            return nestedPageData;
                        }
                    }

                    return null;
                };

                const findImageRectOnPage = async (page, targetStructObjNum, targetMCID) => {
                    const reader = await instance.Core.PDFNet.ElementReader.create();
                    await reader.beginOnPage(page);
                    let matchedImageRect = null;
                    let matchedVectorRect = null;

                    const mergeRect = (existingRect, nextRect) => {
                        if (!existingRect) {
                            return { ...nextRect };
                        }

                        return {
                            x1: Math.min(existingRect.x1, nextRect.x1),
                            y1: Math.min(existingRect.y1, nextRect.y1),
                            x2: Math.max(existingRect.x2, nextRect.x2),
                            y2: Math.max(existingRect.y2, nextRect.y2),
                        };
                    };

                    const scanElements = async () => {
                        while (true) {
                            const element = await reader.next();
                            if (!element) {
                                return;
                            }

                            const elementType = await element.getType();

                            if (elementType === elementTypes.e_null) {
                                return;
                            }

                            if (elementType === elementTypes.e_form) {
                                await reader.formBegin();
                                await scanElements();
                                await reader.end();
                                continue;
                            }

                            const parentStructElement = await element.getParentStructElement();
                            let parentStructObjNum = null;

                            if (await parentStructElement.isValid()) {
                                const parentSdfObject = await parentStructElement.getSDFObj();
                                parentStructObjNum = await parentSdfObject.getObjNum();
                            }

                            const structMCID = await element.getStructMCID();
                            const matchesStructElement = parentStructObjNum === targetStructObjNum;
                            const matchesMCID = targetMCID !== null && structMCID === targetMCID;

                            if (!matchesStructElement && !matchesMCID) {
                                continue;
                            }

                           const elementRect = await element.getBBox();
                           const rect = {
                               x1: elementRect.x1,
                               y1: elementRect.y1,
                               x2: elementRect.x2,
                               y2: elementRect.y2,
                           };
                           const rectWidth = Math.abs(rect.x2 - rect.x1);
                           const rectHeight = Math.abs(rect.y2 - rect.y1);
                           const minRectSize = 0.01;
                           if (rectWidth < minRectSize && rectHeight < minRectSize) {
                               console.log('[FigureRectSkipSmall]', {
                                   pageNumber: await page.getIndex(),
                                   targetStructObjNum,
                                   targetMCID,
                                   elementType,
                                   structMCID,
                                   rect,
                               });
                               continue;
                           }

                           const isImageElement =
                               elementType === elementTypes.e_image || elementType === elementTypes.e_inline_image;
                           console.log('[FigureRectInclude]', {
                               pageNumber: await page.getIndex(),
                               targetStructObjNum,
                               targetMCID,
                               elementType,
                               structMCID,
                               includedAs: isImageElement ? 'image' : 'vector',
                               rect,
                           });
                           if (isImageElement) {
                               matchedImageRect = mergeRect(matchedImageRect, rect);
                           } else {
                               matchedVectorRect = mergeRect(matchedVectorRect, rect);
                           }
                       }
                   };

                   await scanElements();
                   await reader.end();

                   return matchedImageRect || matchedVectorRect;
               };

               const collectTags = async (structElement, depth) => {
                   if (!(await structElement.isValid())) {
                       return;
                   }

                   const structType = await structElement.getType();
                   const hasAlt = await structElement.hasAlt();
                   const altText = hasAlt ? await structElement.getAlt() : '';
                   const hasTitle = await structElement.hasTitle();
                   const title = hasTitle ? await structElement.getTitle() : '';
                   const structSdfObj = await structElement.getSDFObj();
                   const structObjNum = await structSdfObj.getObjNum();
                   const tagId = `struct-${structObjNum}`;

                   if (structType?.toLowerCase() === 'figure' || structType?.toLowerCase() === 'image') {
                       const pageData = await findFirstPageForElement(structElement);
                       const rect =
                           pageData && pageData.pageNumber
                               ? await findImageRectOnPage(pageData.page, structObjNum, pageData.mcid)
                               : null;

                       imageTags.push({
                           id: tagId,
                           depth,
                           type: structType,
                           title,
                           altText,
                           pageNumber: pageData?.pageNumber ?? null,
                           rect,
                       });
                   }

                   const numKids = await structElement.getNumKids();
                   for (let childIndex = 0; childIndex < numKids; childIndex += 1) {
                       const isContentItem = await structElement.isContentItem(childIndex);
                       if (isContentItem) {
                           continue;
                       }

                       const childElement = await structElement.getAsStructElem(childIndex);
                       await collectTags(childElement, depth + 1);
                   }
               };

               const rootKidCount = await structTree.getNumKids();
               for (let rootIndex = 0; rootIndex < rootKidCount; rootIndex += 1) {
                   const rootElement = await structTree.getKid(rootIndex);
                   await collectTags(rootElement, 0);
               }

               return { imageTags };
           }, licenseKey);

           setImageTagsWithAltText(extractedData.imageTags);
           const nextSelectedTagId = extractedData.imageTags.some((tag) => tag.id === selectedImageTagId)
               ? selectedImageTagId
               : (extractedData.imageTags[0]?.id ?? '');
           const nextSelectedTag = extractedData.imageTags.find((tag) => tag.id === nextSelectedTagId);

           setSelectedImageTagId(nextSelectedTagId);
           setEditableAltText(nextSelectedTag?.altText ?? '');
           setAltTextSaveStatus('');
       } catch (error) {
           console.error('Failed to extract tags from PDF', error);
           setImageTagsWithAltText([]);
           setSelectedImageTagId('');
           setEditableAltText('');
       } finally {
           setIsLoadingTags(false);
       }
   }, [documentViewer, instance, licenseKey, selectedImageTagId]);

   useEffect(() => {
       if (!documentViewer) {
           return undefined;
       }

       const onDocumentLoaded = async () => {
           clearImageHighlight();
           await loadTags();
        };

       documentViewer.addEventListener('documentLoaded', onDocumentLoaded);

       return () => {
           documentViewer.removeEventListener('documentLoaded', onDocumentLoaded);

       };
   }, [clearImageHighlight, documentViewer, loadTags]);

   useEffect(() => {
       if (!documentViewer) {
           return undefined;
       }

       const onMouseLeftDown = () => {
           clearImageHighlight();
       };

       documentViewer.addEventListener('mouseLeftDown', onMouseLeftDown);

       return () => {
           documentViewer.removeEventListener('mouseLeftDown', onMouseLeftDown);
       };
   }, [clearImageHighlight, documentViewer]);

   useEffect(() => {
       const exportActionSelector = [
           '[data-element*="download" i]',
           '[data-element*="save" i]',
           '[data-element*="print" i]',
           '[aria-label*="download" i]',
           '[aria-label*="save" i]',
           '[aria-label*="print" i]',
       ].join(',');

       const clearHighlightIfExportAction = (eventTarget) => {
           if (!(eventTarget instanceof Element)) {
               return;
           }

           const isExportActionClick = Boolean(eventTarget.closest(exportActionSelector));
           if (isExportActionClick) {
               clearImageHighlight();
           }
       };

       const onGlobalPointerDownCapture = (event) => {
           clearHighlightIfExportAction(event.target);
       };

       const onGlobalClickCapture = (event) => {
           clearHighlightIfExportAction(event.target);
       };

       const onGlobalKeyDownCapture = (event) => {
           const key = event.key?.toLowerCase();
           const isSaveHotkey = (event.ctrlKey || event.metaKey) && key === 's';
           const isPrintHotkey = (event.ctrlKey || event.metaKey) && key === 'p';

           if (isSaveHotkey || isPrintHotkey) {
               clearImageHighlight();
           }
       };

       window.addEventListener('pointerdown', onGlobalPointerDownCapture, true);
       window.addEventListener('click', onGlobalClickCapture, true);
       window.addEventListener('keydown', onGlobalKeyDownCapture, true);

       return () => {
           window.removeEventListener('pointerdown', onGlobalPointerDownCapture, true);
           window.removeEventListener('click', onGlobalClickCapture, true);
           window.removeEventListener('keydown', onGlobalKeyDownCapture, true);
       };
   }, [clearImageHighlight]);

   useEffect(() => () => {
       clearImageHighlight();
   }, [clearImageHighlight]);

   const selectedImageTag = imageTagsWithAltText.find((tag) => tag.id === selectedImageTagId) || null;

   const handleImageTagSelected = (event) => {
       const selectedId = event.target.value;
       setSelectedImageTagId(selectedId);
       setAltTextSaveStatus('');

       const selectedTag = imageTagsWithAltText.find((tag) => tag.id === selectedId);
       if (selectedTag) {
           setEditableAltText(selectedTag.altText ?? '');
           scrollToImageTag(selectedTag);
       }
   };

   const goToNextImageWithAltText = () => {
       if (!imageTagsWithAltText.length) {
           return;
       }

       const currentIndex = imageTagsWithAltText.findIndex((tag) => tag.id === selectedImageTagId);
       const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % imageTagsWithAltText.length : 0;
       const nextTag = imageTagsWithAltText[nextIndex];

       setSelectedImageTagId(nextTag.id);
       setEditableAltText(nextTag.altText ?? '');
       setAltTextSaveStatus('');
       scrollToImageTag(nextTag, { alignTop: true });
   };

   const saveSelectedImageAltText = async () => {
       if (!selectedImageTag || !instance?.Core || !documentViewer) {
           return;
       }

       setIsSavingAltText(true);
       setAltTextSaveStatus('');

       try {
           const doc = documentViewer.getDocument();
           const pdfDoc = await doc.getPDFDoc();
           const selectedStructObjNum = Number.parseInt(selectedImageTag.id.replace('struct-', ''), 10);
           const nextAltText = editableAltText;

           await instance.Core.PDFNet.runWithCleanup(async () => {
               await pdfDoc.initSecurityHandler();
               const structTree = await pdfDoc.getStructTree();

               if (!(await structTree.isValid())) {
                   throw new Error('Document has no structure tree');
               }

               const updateTagAltText = async (structElement) => {
                   if (!(await structElement.isValid())) {
                       return false;
                   }

                   const structSdfObj = await structElement.getSDFObj();
                   const structObjNum = await structSdfObj.getObjNum();

                   if (structObjNum === selectedStructObjNum) {
                       if (nextAltText.trim()) {
                           await structSdfObj.putText('Alt', nextAltText);
                       } else {
                           await structSdfObj.eraseFromKey('Alt');
                       }

                       return true;
                   }

                   const numKids = await structElement.getNumKids();
                   for (let index = 0; index < numKids; index += 1) {
                       const isContentItem = await structElement.isContentItem(index);
                       if (isContentItem) {
                           continue;
                       }

                       const childElement = await structElement.getAsStructElem(index);
                       const updated = await updateTagAltText(childElement);

                       if (updated) {
                           return true;
                       }
                   }

                   return false;
               };

               let didUpdate = false;
               const rootKidCount = await structTree.getNumKids();
               for (let rootIndex = 0; rootIndex < rootKidCount; rootIndex += 1) {
                   const rootElement = await structTree.getKid(rootIndex);
                   didUpdate = await updateTagAltText(rootElement);
                   if (didUpdate) {
                       break;
                   }
               }

               if (!didUpdate) {
                   throw new Error('Unable to find selected image tag in structure tree');
               }
           }, licenseKey);

           setAltTextSaveStatus('Alt-text saved to PDF.');
           await loadTags();
       } catch (error) {
           console.error('Failed to update Alt-text in PDF', error);
           setAltTextSaveStatus('Failed to save Alt-text.');
       } finally {
           setIsSavingAltText(false);
       }
   };

   return (
       <aside className="contract-review-nav">
           <div className="contract-review-controls">
               <button
                   onClick={openFilePicker}
                   onDrop={handleFileDrop}
                   onDragOver={handleDragOver}
                   disabled={!isReady}
               >
                   Open File
               </button>
               <button onClick={loadTags} disabled={!isReady || isLoadingTags}>
                   {isLoadingTags ? 'Loading Tags...' : 'Refresh Tags'}
                </button>
               <button
                   onClick={downloadCurrentFile}
                   disabled={!isReady || !instance?.UI?.downloadPdf || isDownloadingFile}
               >
                   {isDownloadingFile ? 'Saving...' : 'Save File'}
               </button>

               <input
                   ref={fileInputRef}
                   type="file"
                   onChange={handleFileSelected}
                   style={{ display: 'none' }}
               />
           </div>

           <div className="tag-tools">
               <h3>Image tags</h3>
               {imageTagsWithAltText.length > 0 ? (
                   <div className="tag-tools-stack">
                       <div className="tag-tools-row">
                           <select value={selectedImageTagId} onChange={handleImageTagSelected}>
                               {imageTagsWithAltText.map((tag) => (
                                   <option key={tag.id} value={tag.id}>
                                       {`Page ${tag.pageNumber ?? '-'} - ${tag.altText || '(No Alt-text)'}`}
                                   </option>
                               ))}
                           </select>
                           <button onClick={goToNextImageWithAltText}>
                               Next Image Tag
                           </button>
                       </div>

                       <label htmlFor="selected-image-alt-text">Alt-text</label>
                       <textarea
                           id="selected-image-alt-text"
                           className="tag-alt-editor"
                           value={editableAltText}
                           onChange={(event) => setEditableAltText(event.target.value)}
                           rows={3}
                       />
                       <button
                           onClick={saveSelectedImageAltText}
                           disabled={!selectedImageTag || isSavingAltText}
                       >
                           {isSavingAltText ? 'Saving Alt-text...' : 'Save Alt-text to PDF'}
                       </button>
                       {altTextSaveStatus ? <p>{altTextSaveStatus}</p> : null}
                   </div>
               ) : (
                   <p>No image tags were found.</p>
               )}
           </div>
       </aside>
   );

}

export default PageNavControls