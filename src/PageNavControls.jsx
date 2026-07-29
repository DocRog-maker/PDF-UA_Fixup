import { useCallback, useEffect, useRef, useState } from 'react';

function PageNavControls({ instance }) {
    const documentViewer = instance?.Core?.documentViewer;
    const isReady = Boolean(documentViewer);
    const fileInputRef = useRef(null);
    const activeHighlightAnnotationRef = useRef(null);
    const programmaticScrollInProgressRef = useRef(false);
    const programmaticScrollTimeoutRef = useRef(null);
    const topAlignLockRef = useRef(null);
    const topAlignLockTimeoutRef = useRef(null);
    const topAlignLockIntervalRef = useRef(null);
    const debugSequenceRef = useRef(0);
    const [tags, setTags] = useState([]);
    const [imageTagsWithAltText, setImageTagsWithAltText] = useState([]);
    const [selectedImageTagId, setSelectedImageTagId] = useState('');
    const [editableAltText, setEditableAltText] = useState('');
    const [manualScrollInput, setManualScrollInput] = useState('');
    const [isSavingAltText, setIsSavingAltText] = useState(false);
    const [altTextSaveStatus, setAltTextSaveStatus] = useState('');
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [tagError, setTagError] = useState('');
    const licenseKey = import.meta.env.APRYSE_LICENSE_KEY || '';
    const debugScroll = true;
    const debugVerbosity = 'verbose';
    const enableImageHighlight = true;

    const logDebug = useCallback((eventName, details = {}) => {
        if (!debugScroll) {
            return;
        }

        debugSequenceRef.current += 1;
        const now = new Date().toISOString();
        const perfNow = Math.round(window.performance.now());
        const payload = {
            verbosity: debugVerbosity,
            tMs: perfNow,
            ...details,
        };
        console.log(`[ImageNavDebug #${debugSequenceRef.current}] ${now} ${eventName}`, payload);
    }, [debugScroll, debugVerbosity]);

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

    const clearImageHighlight = useCallback(() => {
        logDebug('clearImageHighlight:begin', {
            hasHighlight: Boolean(activeHighlightAnnotationRef.current),
        });
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
        logDebug('clearImageHighlight:end');
    }, [instance, logDebug]);

    const clearTopAlignLock = useCallback(() => {
        topAlignLockRef.current = null;
        if (topAlignLockTimeoutRef.current) {
            window.clearTimeout(topAlignLockTimeoutRef.current);
            topAlignLockTimeoutRef.current = null;
        }
        if (topAlignLockIntervalRef.current) {
            window.clearInterval(topAlignLockIntervalRef.current);
            topAlignLockIntervalRef.current = null;
        }
        logDebug('clearTopAlignLock');
    }, [logDebug]);

    const getTopAlignedPdfY = useCallback((imageTag) => {
        if (!documentViewer || !imageTag?.rect || !imageTag?.pageNumber) {
            return null;
        }

        const pageHeight = documentViewer.getPageHeight(imageTag.pageNumber);
        const maxY = Math.max(imageTag.rect.y1, imageTag.rect.y2);
        return pageHeight - maxY;
    }, [documentViewer]);

    const setTopAlignLock = useCallback((imageTag, durationMs = 5000) => {
        if (!imageTag?.rect || !imageTag?.pageNumber) {
            return;
        }

        const topAlignedPdfY = getTopAlignedPdfY(imageTag);
        if (topAlignedPdfY === null) {
            return;
        }

        topAlignLockRef.current = {
            pageNumber: imageTag.pageNumber,
            rect: {
                x1: imageTag.rect.x1,
                y1: imageTag.rect.y1,
                x2: imageTag.rect.x2,
                y2: imageTag.rect.y2,
            },
            id: imageTag.id,
            topAlignedPdfY,
        };
        if (topAlignLockTimeoutRef.current) {
            window.clearTimeout(topAlignLockTimeoutRef.current);
        }
        if (topAlignLockIntervalRef.current) {
            window.clearInterval(topAlignLockIntervalRef.current);
        }

        const runLockCorrection = () => {
            if (!documentViewer || !topAlignLockRef.current) {
                return;
            }

            const scrollViewElement = documentViewer.getScrollViewElement();
            const displayMode = documentViewer.getDisplayModeManager().getDisplayMode();
            if (!scrollViewElement || !displayMode) {
                return;
            }

            const lock = topAlignLockRef.current;
            const lockTargetPoint = displayMode.pageToWindow(
                {
                    x: (lock.rect.x1 + lock.rect.x2) / 2,
                    y: lock.topAlignedPdfY,
                },
                lock.pageNumber
            );
            const maxTop = Math.max(0, scrollViewElement.scrollHeight - scrollViewElement.clientHeight);
            const desiredTop = Math.min(maxTop, Math.max(0, lockTargetPoint.y - 24));
            const verticalDelta = Math.abs(scrollViewElement.scrollTop - desiredTop);

            if (verticalDelta > 2) {
                logDebug('topAlignLock:intervalCorrection', {
                    lockTagId: lock.id,
                    currentTop: scrollViewElement.scrollTop,
                    desiredTop,
                    verticalDelta,
                });
                scrollViewElement.scrollTo({
                    top: desiredTop,
                    behavior: 'auto',
                });
            }
        };

        topAlignLockIntervalRef.current = window.setInterval(runLockCorrection, 90);
        topAlignLockTimeoutRef.current = window.setTimeout(() => {
            if (topAlignLockIntervalRef.current) {
                window.clearInterval(topAlignLockIntervalRef.current);
                topAlignLockIntervalRef.current = null;
            }
            topAlignLockRef.current = null;
            topAlignLockTimeoutRef.current = null;
            logDebug('topAlignLockExpired');
        }, durationMs);
        logDebug('setTopAlignLock', {
            tagId: imageTag.id,
            pageNumber: imageTag.pageNumber,
            topAlignedPdfY,
            durationMs,
        });
    }, [documentViewer, getTopAlignedPdfY, logDebug]);

    const scheduleProgrammaticScrollReset = useCallback((delayMs) => {
        logDebug('scheduleProgrammaticScrollReset', {
            delayMs,
            hadExistingTimer: Boolean(programmaticScrollTimeoutRef.current),
        });
        if (programmaticScrollTimeoutRef.current) {
            window.clearTimeout(programmaticScrollTimeoutRef.current);
        }

        programmaticScrollTimeoutRef.current = window.setTimeout(() => {
            programmaticScrollInProgressRef.current = false;
            programmaticScrollTimeoutRef.current = null;
            logDebug('programmaticScrollResetFired');
        }, delayMs);
    }, [logDebug]);

    const beginProgrammaticScroll = useCallback((maxDurationMs = 2500) => {
        programmaticScrollInProgressRef.current = true;
        logDebug('beginProgrammaticScroll', { maxDurationMs });
        scheduleProgrammaticScrollReset(maxDurationMs);
    }, [logDebug, scheduleProgrammaticScrollReset]);

    const markProgrammaticScrollSettling = useCallback(() => {
        if (!programmaticScrollInProgressRef.current) {
            logDebug('markProgrammaticScrollSettling:ignored');
            return;
        }

        logDebug('markProgrammaticScrollSettling:apply');
        scheduleProgrammaticScrollReset(220);
    }, [logDebug, scheduleProgrammaticScrollReset]);

    const enforceTopAlignLock = useCallback((source) => {
        if (!documentViewer || !topAlignLockRef.current) {
            return false;
        }

        const scrollViewElement = documentViewer.getScrollViewElement();
        const displayMode = documentViewer.getDisplayModeManager().getDisplayMode();
        if (!scrollViewElement || !displayMode) {
            return true;
        }

        const lock = topAlignLockRef.current;
        const lockTargetPoint = displayMode.pageToWindow(
            {
                x: (lock.rect.x1 + lock.rect.x2) / 2,
                y: lock.topAlignedPdfY,
            },
            lock.pageNumber
        );
        const maxTop = Math.max(0, scrollViewElement.scrollHeight - scrollViewElement.clientHeight);
        const desiredTop = Math.min(maxTop, Math.max(0, lockTargetPoint.y - 24));
        const verticalDelta = Math.abs(scrollViewElement.scrollTop - desiredTop);

        if (verticalDelta > 2) {
            logDebug('topAlignLock:enforceCorrection', {
                source,
                currentTop: scrollViewElement.scrollTop,
                desiredTop,
                verticalDelta,
                lockTagId: lock.id,
            });
            beginProgrammaticScroll(1200);
            scrollViewElement.scrollTo({
                top: desiredTop,
                behavior: 'auto',
            });
        }

        return true;
    }, [beginProgrammaticScroll, documentViewer, logDebug]);

    const showImageHighlight = useCallback((imageTag) => {
        logDebug('showImageHighlight:begin', {
            tagId: imageTag?.id,
            pageNumber: imageTag?.pageNumber,
            hasRect: Boolean(imageTag?.rect),
        });
        clearImageHighlight();

        if (!enableImageHighlight) {
            logDebug('showImageHighlight:disabled');
            return;
        }

        if (!imageTag?.pageNumber || !imageTag?.rect || !instance?.Core || !documentViewer) {
            return;
        }

        const { annotationManager, Annotations, Math: CoreMath } = instance.Core;
        const pageHeight = documentViewer.getPageHeight(imageTag.pageNumber);
        const minX = Math.min(imageTag.rect.x1, imageTag.rect.x2);
        const maxX = Math.max(imageTag.rect.x1, imageTag.rect.x2);
        const minY = Math.min(imageTag.rect.y1, imageTag.rect.y2);
        const maxY = Math.max(imageTag.rect.y1, imageTag.rect.y2);
        const padding = 6;
        const top = pageHeight - maxY;
        const bottom = pageHeight - minY;

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
                minX - padding,
                top - padding,
                maxX + padding,
                bottom + padding
            )
        );

        annotationManager.addAnnotation(highlightAnnotation, {
            source: 'image-tag-highlight',
        });
        annotationManager.redrawAnnotation(highlightAnnotation);
        activeHighlightAnnotationRef.current = highlightAnnotation;
        logDebug('showImageHighlight:end', {
            tagId: imageTag?.id,
            pageNumber: imageTag?.pageNumber,
        });
        instance.Core.annotationManager.jumpToAnnotation(highlightAnnotation);
    }, [clearImageHighlight, documentViewer, enableImageHighlight, instance, logDebug]);

    const scrollToImageTag = useCallback(async(imageTag, options = {}) => {
        //return;
        const { alignTop = false } = options;
        const expectedPdfRect = imageTag?.rect
            ? {
                x1: imageTag.rect.x1,
                y1: imageTag.rect.y1,
                x2: imageTag.rect.x2,
                y2: imageTag.rect.y2,
                minX: Math.min(imageTag.rect.x1, imageTag.rect.x2),
                maxX: Math.max(imageTag.rect.x1, imageTag.rect.x2),
                minY: Math.min(imageTag.rect.y1, imageTag.rect.y2),
                maxY: Math.max(imageTag.rect.y1, imageTag.rect.y2),
            }
            : null;
        const expectedPdfAnchor = expectedPdfRect
            ? {
                x: (expectedPdfRect.x1 + expectedPdfRect.x2) / 2,
                yTop: expectedPdfRect.maxY,
                yCenter: (expectedPdfRect.y1 + expectedPdfRect.y2) / 2,
            }
            : null;
        logDebug('scrollToImageTag:begin', {
            tagId: imageTag?.id,
            pageNumber: imageTag?.pageNumber,
            alignTop,
            hasRect: Boolean(imageTag?.rect),
            caller: alignTop ? 'next-button' : 'dropdown-select',
            expectedPdfRect,
            expectedPdfAnchor,
        });

        if (!documentViewer || !imageTag?.pageNumber) {
            logDebug('scrollToImageTag:abort-no-documentViewer-or-page');
            return;
        }
        console.log('AAA')
      //  beginProgrammaticScroll();
        showImageHighlight(imageTag);
        documentViewer.setCurrentPage(imageTag.pageNumber, !alignTop);
        logDebug('scrollToImageTag:setCurrentPage', {
            pageNumber: imageTag.pageNumber,
            smooth: !alignTop,
        });

        if (!imageTag.rect) {
            logDebug('scrollToImageTag:abort-no-rect', {
                tagId: imageTag?.id,
            });
            return;
        }
return;
        const pageHieght = await documentViewer.getPageHeight(imageTag.pageNumber)
        console.log(`ph: ${pageHieght}`)
        const targetTop = pageHieght - Math.max(imageTag.rect.y1, imageTag.rect.y2);
         console.log(`top: ${targetTop}`)
        const zoom = documentViewer.getZoomLevel();
        const finalTop = targetTop*zoom
        // if (alignTop) {
             const scrollViewElement = documentViewer.getScrollViewElement();
             scrollViewElement.scrollTo({
            top: finalTop,
            behavior: 'auto',
        });
        //     const displayMode = documentViewer.getDisplayModeManager().getDisplayMode();
        //     if (scrollViewElement && displayMode) {
        //         const topAlignedPdfY = getTopAlignedPdfY(imageTag);
        //         if (topAlignedPdfY !== null) {
        //             const targetPoint = displayMode.pageToWindow(
        //                 {
        //                     x: (imageTag.rect.x1 + imageTag.rect.x2) / 2,
        //                     y: topAlignedPdfY,
        //                 },
        //                 imageTag.pageNumber
        //             );
        //             const maxTop = Math.max(0, scrollViewElement.scrollHeight - scrollViewElement.clientHeight);
        //             const desiredTop = Math.min(maxTop, Math.max(0, targetPoint.y - 24));
        //             beginProgrammaticScroll(2500);
        //             logDebug('scrollToImageTag:firstPass:scrollTo', {
        //                 left: scrollViewElement.scrollLeft,
        //                 top: desiredTop,
        //                 rawPoint: targetPoint,
        //                 topAlignedPdfY,
        //                 expectedPdfRect,
        //                 expectedPdfAnchor,
        //             });
        //             scrollViewElement.scrollTo({
        //                 top: desiredTop,
        //                 behavior: 'auto',
        //             });
        //         }
        //     }
        //     setTopAlignLock(imageTag);
        // } else {
        //     clearTopAlignLock();
        // }

    }, [beginProgrammaticScroll, clearTopAlignLock, documentViewer, getTopAlignedPdfY, logDebug, setTopAlignLock, showImageHighlight]);

    const loadTags = useCallback(async () => {
        if (!instance?.Core || !documentViewer) {
            setTags([]);
            setImageTagsWithAltText([]);
            setSelectedImageTagId('');
            setEditableAltText('');
            setAltTextSaveStatus('');
            return;
        }

        setIsLoadingTags(true);
        setTagError('');

        try {
            const doc = documentViewer.getDocument();
            const pdfDoc = await doc.getPDFDoc();

            const extractedData = await instance.Core.PDFNet.runWithCleanup(async () => {
                await pdfDoc.initSecurityHandler();
                const structTree = await pdfDoc.getStructTree();

                if (!(await structTree.isValid())) {
                    return { tags: [], imageTags: [] };
                }

                const allTags = [];
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

                    const scanElements = async () => {
                        while (true) {
                            const element = await reader.next();
                            if (!element) { return null; }

                            const elementType = await element.getType();

                            if (elementType === elementTypes.e_null) {
                                return null;
                            }

                            if (elementType === elementTypes.e_form) {
                                await reader.formBegin();
                                const nestedRect = await scanElements();
                                await reader.end();

                                if (nestedRect) {
                                    return nestedRect;
                                }

                                continue;
                            }

                            if (elementType !== elementTypes.e_image && elementType !== elementTypes.e_inline_image) {
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

                            const imageRect = await element.getBBox();
                            return {
                                x1: imageRect.x1,
                                y1: imageRect.y1,
                                x2: imageRect.x2,
                                y2: imageRect.y2,
                            };
                        }
                    };

                    const imageRect = await scanElements();
                    await reader.end();

                    return imageRect;
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

                    allTags.push({
                        id: tagId,
                        depth,
                        type: structType,
                        title,
                        altText,
                    });

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

                return { tags: allTags, imageTags };
            }, licenseKey);

            setTags(extractedData.tags);
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
            setTags([]);
            setImageTagsWithAltText([]);
            setSelectedImageTagId('');
            setEditableAltText('');
            setTagError('Failed to load tags from this PDF.');
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

        const scrollViewElement = documentViewer.getScrollViewElement();
        if (!scrollViewElement || typeof scrollViewElement.addEventListener !== 'function') {
            return undefined;
        }

        const onScroll = () => {
            const scrollViewElement = documentViewer.getScrollViewElement();
            logDebug('scrollView:onScroll', {
                programmaticInProgress: programmaticScrollInProgressRef.current,
                scrollTop: scrollViewElement?.scrollTop,
                scrollLeft: scrollViewElement?.scrollLeft,
                hasTopAlignLock: Boolean(topAlignLockRef.current),
            });

            if (enforceTopAlignLock('scroll')) {
                return;
            }

            if (programmaticScrollInProgressRef.current) {
                markProgrammaticScrollSettling();
                return;
            }

          //  clearImageHighlight();
        };

        scrollViewElement.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            scrollViewElement.removeEventListener('scroll', onScroll);
        };
    }, [clearImageHighlight, documentViewer, enforceTopAlignLock, markProgrammaticScrollSettling, logDebug]);

    useEffect(() => {
        if (!documentViewer) {
            return undefined;
        }

        const onFinishedRendering = () => {
            enforceTopAlignLock('finishedRendering');
        };
        const onPagesUpdated = () => {
            enforceTopAlignLock('pagesUpdated');
        };
        const onPageComplete = (pageNum) => {
            if (!topAlignLockRef.current) {
                return;
            }

            if (pageNum === topAlignLockRef.current.pageNumber) {
                enforceTopAlignLock('pageComplete');
            }
        };

        documentViewer.addEventListener('finishedRendering', onFinishedRendering);
        documentViewer.addEventListener('pagesUpdated', onPagesUpdated);
        documentViewer.addEventListener('pageComplete', onPageComplete);

        return () => {
            documentViewer.removeEventListener('finishedRendering', onFinishedRendering);
            documentViewer.removeEventListener('pagesUpdated', onPagesUpdated);
            documentViewer.removeEventListener('pageComplete', onPageComplete);
        };
    }, [documentViewer, enforceTopAlignLock]);

    useEffect(() => {
        if (!documentViewer) {
            return undefined;
        }

        const onMouseLeftDown = () => {
            logDebug('documentViewer:mouseLeftDown', {
                programmaticInProgress: programmaticScrollInProgressRef.current,
            });
            if (programmaticScrollInProgressRef.current) {
                return;
            }

            clearImageHighlight();
        };

        documentViewer.addEventListener('mouseLeftDown', onMouseLeftDown);

        return () => {
            documentViewer.removeEventListener('mouseLeftDown', onMouseLeftDown);
        };
    }, [clearImageHighlight, documentViewer, logDebug]);

    useEffect(() => {
        const onGlobalClickCapture = (event) => {
            const clickTarget = event.target;
            if (!(clickTarget instanceof Element)) {
                return;
            }

            const isExportActionClick = Boolean(
                clickTarget.closest(
                    '[data-element="downloadButton"],[data-element="saveAsButton"],[data-element="printButton"]'
                )
            );

            if (isExportActionClick) {
                clearImageHighlight();
            }
        };

        const onGlobalKeyDownCapture = (event) => {
            const key = event.key?.toLowerCase();
            const isSaveHotkey = (event.ctrlKey || event.metaKey) && key === 's';
            const isPrintHotkey = (event.ctrlKey || event.metaKey) && key === 'p';

            if (isSaveHotkey || isPrintHotkey) {
                clearImageHighlight();
            }
        };

        window.addEventListener('click', onGlobalClickCapture, true);
        window.addEventListener('keydown', onGlobalKeyDownCapture, true);

        return () => {
            window.removeEventListener('click', onGlobalClickCapture, true);
            window.removeEventListener('keydown', onGlobalKeyDownCapture, true);
        };
    }, [clearImageHighlight]);

    useEffect(() => () => {
        programmaticScrollInProgressRef.current = false;
        clearImageHighlight();
        clearTopAlignLock();
        if (programmaticScrollTimeoutRef.current) {
            window.clearTimeout(programmaticScrollTimeoutRef.current);
            programmaticScrollTimeoutRef.current = null;
        }
        if (topAlignLockIntervalRef.current) {
            window.clearInterval(topAlignLockIntervalRef.current);
            topAlignLockIntervalRef.current = null;
        }
    }, [clearImageHighlight, clearTopAlignLock]);

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
        console.log(`RECT: ${nextTag.rect.y1} ${nextTag.rect.y2}`)
        scrollToImageTag(nextTag, { alignTop: true });
    };

    const scrollToManualPosition = () => {
        if (!documentViewer) {
            return;
        }

        const targetTop = Number.parseFloat(manualScrollInput);
        if (!Number.isFinite(targetTop) || targetTop < 0) {
            logDebug('manualScroll:invalidInput', { manualScrollInput });
            return;
        }

        const scrollViewElement = documentViewer.getScrollViewElement();
        if (!scrollViewElement || typeof scrollViewElement.scrollTo !== 'function') {
            logDebug('manualScroll:abort-no-scroll-element');
            return;
        }

        clearTopAlignLock();
        beginProgrammaticScroll(1200);
        logDebug('manualScroll:scrollTo', {
            input: manualScrollInput,
            targetTop,
            previousTop: scrollViewElement.scrollTop,
        });

        scrollViewElement.scrollTo({
            top: targetTop,
            behavior: 'auto',
        });
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
        <>
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

                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelected}
                        style={{ display: 'none' }}
                    />
                </div>

                <div className="manual-scroll-row">
                    <input
                        type="text"
                        value={manualScrollInput}
                        onChange={(event) => setManualScrollInput(event.target.value)}
                        placeholder="Scroll top (px)"
                    />
                    <button onClick={scrollToManualPosition} disabled={!isReady}>
                        Scroll To Position
                    </button>
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

            <div className="tag-list-container">
                <h3>Document tags ({tags.length})</h3>
                {tagError && <p>{tagError}</p>}
                {!tagError && tags.length === 0 && !isLoadingTags && (
                    <p>No tags found in this document.</p>
                )}
                {tags.length > 0 && (
                    <ul className="tag-list">
                        {tags.map((tag) => (
                            <li key={tag.id} style={{ paddingLeft: `${tag.depth * 14}px` }}>
                                <span>{tag.type}</span>
                                {tag.title ? <span>{` | Title: ${tag.title}`}</span> : null}
                                {tag.altText ? <span>{` | Alt: ${tag.altText}`}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );

}

export default PageNavControls