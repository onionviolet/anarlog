import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type DragEvent,
  type HTMLAttributes,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FileHandlerConfig } from "@anlg/editor/note";
import { toast } from "@anlg/ui/components/ui/toast";

import { useFileUpload } from "~/shared/hooks/useFileUpload";
import { isAudioUploadFile, useUploadFile } from "~/stt/useUploadFile";

export function useNoteFileHandlerConfig(sessionId: string) {
  const onFileUpload = useFileUpload(sessionId);
  const { queueAudioFiles } = useUploadFile(sessionId);
  const [isAudioDragActive, setIsAudioDragActive] = useState(false);
  const audioDragDepthRef = useRef(0);

  const processAudioDrop = useCallback(
    (files: File[], items?: DataTransferItemList) => {
      const fileItems = Array.from(items ?? []).filter(
        (item) => item.kind === "file",
      );
      const audioEntries = files.flatMap((file, index) =>
        isAudioDropFile(file, fileItems[index])
          ? [{ file, item: fileItems[index] }]
          : [],
      );
      if (audioEntries.length === 0) return null;
      const audioFiles = audioEntries.map(({ file }) => file);
      void queueAudioFiles(
        audioFiles,
        audioEntries.map(({ file, item }) =>
          !isAudioUploadFile(file)
            ? {
                allowUnknownAudio: true,
                contentType: file.type || item?.type || undefined,
              }
            : undefined,
        ),
      ).catch(handleAudioQueueError);
      return {
        remainingFiles: files.filter((file) => !audioFiles.includes(file)),
      };
    },
    [queueAudioFiles],
  );

  const handleDrop = useCallback(
    (files: File[], _pos?: number, items?: DataTransferItemList) => {
      const result = processAudioDrop(files, items);
      if (!result) {
        return undefined;
      }

      return result.remainingFiles.length === 0 ? true : result;
    },
    [processAudioDrop],
  );

  const handlePaste = useCallback(
    (files: File[], items?: DataTransferItemList) =>
      handleDrop(files, undefined, items),
    [handleDrop],
  );
  const handleFileUploadError = useCallback((error: unknown) => {
    toast.error(
      error instanceof Error ? error.message : "Could not add this attachment.",
    );
  }, []);

  const resetAudioDrag = useCallback(() => {
    audioDragDepthRef.current = 0;
    setIsAudioDragActive(false);
  }, []);

  const prepareAudioDragEvent = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setIsAudioDragActive(true);
    },
    [],
  );

  const handleDragEnterCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasAudioUploadDrag(event.dataTransfer)) {
        return;
      }

      if (audioDragDepthRef.current === 0) {
        focusCurrentWindowForAudioDrop();
      }

      audioDragDepthRef.current += 1;
      prepareAudioDragEvent(event);
    },
    [prepareAudioDragEvent],
  );

  const handleDragOverCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        audioDragDepthRef.current === 0 &&
        !hasAudioUploadDrag(event.dataTransfer)
      ) {
        return;
      }

      prepareAudioDragEvent(event);
    },
    [prepareAudioDragEvent],
  );

  const handleDragLeaveCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        audioDragDepthRef.current === 0 &&
        !hasAudioUploadDrag(event.dataTransfer)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      audioDragDepthRef.current = Math.max(0, audioDragDepthRef.current - 1);
      if (audioDragDepthRef.current === 0) {
        setIsAudioDragActive(false);
      }
    },
    [],
  );

  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) {
        return;
      }

      const audioDrop = getAudioDrop(files, event.dataTransfer.items);
      if (!audioDrop) {
        return;
      }

      if (
        files.some(
          (file, index) =>
            !isAudioDropFile(
              file,
              Array.from(event.dataTransfer.items ?? [])[index],
            ),
        )
      ) {
        resetAudioDrag();
        return;
      }
      processAudioDrop(files, event.dataTransfer.items);
      event.preventDefault();
      event.stopPropagation();
      resetAudioDrag();
    },
    [processAudioDrop, resetAudioDrag],
  );

  const fileHandlerConfig = useMemo<FileHandlerConfig>(
    () => ({
      onFileUpload,
      onFileUploadError: handleFileUploadError,
      onDrop: handleDrop,
      onPaste: handlePaste,
    }),
    [handleDrop, handleFileUploadError, handlePaste, onFileUpload],
  );

  const audioDropTargetProps = useMemo<HTMLAttributes<HTMLDivElement>>(
    () => ({
      onDragEnterCapture: handleDragEnterCapture,
      onDragOverCapture: handleDragOverCapture,
      onDragLeaveCapture: handleDragLeaveCapture,
      onDropCapture: handleDropCapture,
      onDragEndCapture: resetAudioDrag,
    }),
    [
      handleDragEnterCapture,
      handleDragLeaveCapture,
      handleDragOverCapture,
      handleDropCapture,
      resetAudioDrag,
    ],
  );

  return useMemo(
    () => ({
      audioDropTargetProps,
      fileHandlerConfig,
      isAudioDragActive,
    }),
    [audioDropTargetProps, fileHandlerConfig, isAudioDragActive],
  );
}

function hasAudioUploadDrag(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0) {
    return items.every((item) => {
      if (item.kind !== "file") {
        return false;
      }

      if (item.type.startsWith("audio/")) {
        return true;
      }

      const file = item.getAsFile();
      return file ? isAudioUploadFile(file) : false;
    });
  }

  const files = Array.from(dataTransfer.files ?? []);
  return files.length > 0 && files.every(isAudioUploadFile);
}

function getAudioDrop(files: File[], items?: DataTransferItemList) {
  const dataTransferItems = Array.from(items ?? []).filter(
    (item) => item.kind === "file",
  );
  const audioFileIndex = files.findIndex((file, index) =>
    isAudioDropFile(file, dataTransferItems[index]),
  );
  if (audioFileIndex === -1) {
    return null;
  }
  const audioFile = files[audioFileIndex];

  return {
    allowUnknownAudio: !isAudioUploadFile(audioFile),
    audioFile,
    contentType:
      audioFile.type || dataTransferItems[audioFileIndex]?.type || undefined,
    remainingFiles: files.filter((file) => file !== audioFile),
  };
}

function isAudioDropFile(file: File, item?: DataTransferItem) {
  return isAudioUploadFile(file) || item?.type.startsWith("audio/") === true;
}

function focusCurrentWindowForAudioDrop() {
  if (!isTauri()) {
    return;
  }

  void bringCurrentWindowToFront();
}

async function bringCurrentWindowToFront() {
  try {
    const currentWindow = getCurrentWindow();
    await currentWindow.show();
    await currentWindow.unminimize();
    await currentWindow.setFocus();
  } catch (error) {
    console.error("Failed to focus window for audio drop", error);
  }
}

function handleAudioQueueError(error: unknown) {
  toast.error(
    error instanceof Error ? error.message : "Could not queue audio files.",
  );
}
